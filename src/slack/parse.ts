import type { McpToolResult } from 'claude-code'

import type { Channel, ChannelKind, Message, Page, SearchHit, UploadTicket } from '../../types'
import { SlackError } from './client'

// The Slack MCP answers with human-readable text, not a schema. Every format
// assumption lives in this file so a format change touches one place.

const fail = (what: string): never => {
  throw new SlackError('parse', `Unrecognized Slack response: ${what}`)
}

export function unwrap(result: McpToolResult): Record<string, string> {
  const text = result.content
    .map(block => (block.type === 'text' ? block.text : ''))
    .join('')
  if (result.isError) {
    throw new SlackError('tool-error', text.split('\n')[0] || 'Slack tool error')
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return fail('not JSON')
  }
  if (typeof parsed !== 'object' || parsed === null) return fail('not an object')
  const fields: Record<string, string> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (typeof value === 'string') fields[key] = value
  }
  return fields
}

const decodeEntities = (text: string) =>
  text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

export function decodeSlackText(text: string): string {
  const linked = text.replace(/<([^<>|]+)(?:\|([^<>]*))?>/g, (_, target: string, label?: string) => {
    const url = decodeEntities(target)
    const shown = label === undefined ? undefined : decodeEntities(label)
    if (url.startsWith('@')) return url
    if (url.startsWith('#')) return `#${shown ?? url.slice(1)}`
    if (url.startsWith('!')) return `@${shown ?? url.slice(1)}`
    if (shown === undefined || shown === url) return url
    return `${shown} (${url})`
  })
  return decodeEntities(linked)
}

const cursorIn = (text: string) => /cursor[^`"]*[`"]([^`"]+)[`"]/.exec(text)?.[1]

const page = <T>(items: T[], pagination: string): Page<T> => {
  const nextCursor = cursorIn(pagination)
  return nextCursor === undefined ? { items } : { items, nextCursor }
}

// Search results tag a bot author `  [BOT]`, sometimes with no name before its ID.
const AUTHOR = /^(.*?)(?:\s*<[^>]*>)?\s*\((?:ID:\s*)?([A-Z0-9]+)\)(\s*\[BOT\])?\s*$/
const UNNAMED_BOT = 'Bot'

const author = (raw: string) => {
  const match = AUTHOR.exec(raw.trim())
  // The raw line can hold an email address: keep it out of the error text.
  if (!match) return fail('author line')
  const name = match[1]!.trim()
  return { userName: name === '' && match[3] !== undefined ? UNNAMED_BOT : name, userId: match[2]! }
}

const cleanBody = (lines: string[]) => {
  const body = lines.map(line => line.trimEnd())
  while (body.length > 0 && body[0] === '') body.shift()
  while (body.length > 0 && body[body.length - 1] === '') body.pop()
  return decodeSlackText(body.join('\n'))
}

// Meta lines close a message block: each kind at most once, Thread only in its
// full `(latest: …)` form, so a body line that merely looks like one stays body.
const META = [
  { kind: 'reactions', test: /^Reactions:/ },
  { kind: 'files', test: /^Files?:/ },
  { kind: 'thread', test: /^Thread: (\d+) repl\w* \(latest: .+\)$/ },
] as const

const splitMeta = (lines: string[]) => {
  const body = [...lines]
  const seen = new Set<string>()
  let replyCount = 0
  let hasFile = false
  for (;;) {
    const last = body[body.length - 1]
    if (last === undefined) break
    const trimmed = last.trim()
    if (trimmed === '' || trimmed === 'No thread messsages') {
      body.pop()
      continue
    }
    const meta = META.find(m => !seen.has(m.kind) && m.test.test(trimmed))
    if (meta === undefined) break
    seen.add(meta.kind)
    if (meta.kind === 'thread') replyCount = Number(meta.test.exec(trimmed)?.[1])
    if (meta.kind === 'files') hasFile = true
    body.pop()
  }
  return { text: cleanBody(body), replyCount, hasFile }
}

export function parseProfile(text: string): string {
  return /^User ID:\s*(\S+)/m.exec(text)?.[1] ?? fail('profile')
}

const kindOf = (type: string): ChannelKind => {
  if (/direct message/i.test(type)) return 'im'
  if (/group|multi/i.test(type)) return 'mpim'
  if (/private/i.test(type)) return 'private'
  return 'public'
}

export function parseChannelList(text: string): Page<Channel> {
  if (!/^## My Channels/m.test(text)) fail('channel list')
  const blocks = text.split(/^### /m).slice(1)
  const items = blocks.map(block => {
    const heading = block.split('\n')[0]!.trim()
    const id = /- \*\*ID:\*\*\s*(\S+)/.exec(block)?.[1] ?? fail(`channel ${heading}`)
    const type = /- \*\*Type:\*\*\s*(.+)/.exec(block)?.[1] ?? ''
    const name = heading.replace(/^#/, '').replace(/^DM with /, '')
    return { id, name, kind: kindOf(type) }
  })
  return page(items, text)
}

export function parseChannelSearch(text: string, pagination: string): Page<Channel> {
  if (!/^## Channels/m.test(text)) fail('channel search')
  const blocks = text.split(/^### Result \d+ of \d+\s*$/m).slice(1)
  const items = blocks.map(block => {
    const name = /^Name:\s*#?(.+)$/m.exec(block)?.[1]?.trim() ?? fail('channel search name')
    const id = /^Permalink:.*\/archives\/([A-Z0-9]+)/m.exec(block)?.[1] ?? fail(`channel search ${name}`)
    const type = /^Channel Type:\s*(.+)$/m.exec(block)?.[1] ?? ''
    return { id, name, kind: kindOf(type) }
  })
  return page(items, pagination)
}

const MESSAGE_HEADER = /^=== Message from (.+?) at .+? ===[ \t]*$/

export function parseChannelMessages(text: string, pagination: string): Page<Message> {
  if (!/^Channel: /.test(text)) fail('channel history')
  const items: Message[] = []
  let current: { header: string; lines: string[] } | undefined
  const flush = () => {
    if (!current) return
    const [tsLine = '', ...rest] = current.lines
    const ts = /^Message TS:\s*(\S+)/.exec(tsLine)?.[1] ?? fail('message ts')
    items.push({ ts, ...author(current.header), ...splitMeta(rest) })
  }
  for (const line of text.split('\n')) {
    const header = MESSAGE_HEADER.exec(line)
    if (header) {
      flush()
      current = { header: header[1]!, lines: [] }
    } else if (current) {
      current.lines.push(line)
    }
  }
  flush()
  return page(items, pagination)
}

const headeredMessage = (block: string, threadTs?: string): Message => {
  const lines = block.split('\n')
  const field = (name: string) => {
    const index = lines.findIndex(line => line.startsWith(`${name}:`))
    return index === -1 ? fail(`thread ${name}`) : { index, value: lines[index]!.slice(name.length + 1).trim() }
  }
  const from = field('From')
  const ts = field('Message TS')
  const message: Message = {
    ts: ts.value,
    ...author(from.value),
    ...splitMeta(lines.slice(ts.index + 1)),
  }
  return threadTs === undefined ? message : { ...message, threadTs }
}

export function parseThread(text: string, pagination: string, parentTs?: string): Page<Message> {
  const PARENT = '=== THREAD PARENT MESSAGE ==='
  const REPLIES = /^=== THREAD REPLIES.*===\s*$/m
  const hasParent = text.includes(PARENT)
  if (!hasParent && !REPLIES.test(text)) fail('thread')
  const [parentPart = '', repliesPart = ''] = hasParent
    ? text.slice(text.indexOf(PARENT) + PARENT.length).split(REPLIES)
    : ['', text.split(REPLIES)[1] ?? '']
  const parent = hasParent ? headeredMessage(parentPart) : undefined
  const threadTs = parent?.ts ?? parentTs
  const replies = repliesPart
    .split(/^--- Reply \d+ of \d+ ---\s*$/m)
    .slice(1)
    .map(block => headeredMessage(block, threadTs))
  return page(parent === undefined ? replies : [parent, ...replies], pagination)
}

export function parseSearch(text: string, pagination: string): Page<SearchHit> {
  if (!/^# Search Results/m.test(text)) fail('search')
  const blocks = text.split(/^### Result \d+ of \d+\s*$/m).slice(1)
  const items = blocks.map(block => {
    const line = (name: string) =>
      new RegExp(`^${name}:\\s*(.*)$`, 'm').exec(block)?.[1]?.trim() ?? fail(`search ${name}`)
    const channel = /^(.*?)\s*\(ID:\s*([A-Z0-9]+)\)$/.exec(line('Channel')) ?? fail('search channel')
    const permalink = /\]\((\S+)\)/.exec(line('Permalink'))?.[1] ?? fail('search permalink')
    const threadTs = /[?&]thread_ts=([\d.]+)/.exec(permalink)?.[1]
    const lines = block.split('\n')
    const textStart = lines.findIndex(row => row.startsWith('Text:'))
    const textEnd = lines.findIndex((row, index) => index > textStart && row.trim() === '---')
    const body = [lines[textStart]!.slice('Text:'.length), ...lines.slice(textStart + 1, textEnd === -1 ? undefined : textEnd)]
    const hit: SearchHit = {
      channelId: channel[2]!,
      channelName: channel[1]!.replace(/^#/, ''),
      ts: line('Message_ts'),
      userName: author(line('From')).userName,
      text: cleanBody(body),
      permalink,
    }
    return threadTs === undefined ? hit : { ...hit, threadTs }
  })
  return page(items, pagination)
}

// The upload answer's layout was not observed; take the first https URL and
// the first file ID (F…) outside it, whatever the wrapping.
export function parseUploadTicket(text: string): UploadTicket {
  const uploadUrl = /https:\/\/[^\s"'<>`]+/.exec(text)?.[0] ?? fail('upload url')
  const fileId = /\bF[A-Z0-9]{6,}\b/.exec(text.replace(uploadUrl, ''))?.[0] ?? fail('upload file id')
  return { uploadUrl, fileId }
}
