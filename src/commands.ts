import type { EngineInterface } from 'claude-code'

import type { Channel } from '../types'
import { closePane, findKnownChannel, myUserId, openPane, runSearch } from './actions'
import { reportError } from './errors'
import { channelLabel } from './format'
import { openView, setIntervalSeconds } from './poller'
import type { SlackClient } from './slack/client'
import { readIntervalSeconds, readPaneOpen } from './state'

const MIN_INTERVAL = 5
const MAX_INTERVAL = 300

export type Target = { kind: 'id'; id: string } | { kind: 'name'; name: string; isDm: boolean }

export function parseTarget(arg: string): Target | undefined {
  const text = arg.trim()
  if (text === '') return undefined
  if (text.startsWith('#')) return { kind: 'name', name: text.slice(1), isDm: false }
  if (text.startsWith('@')) return { kind: 'name', name: text.slice(1), isDm: true }
  if (/^[CDG][A-Z0-9]+$/.test(text)) return { kind: 'id', id: text }
  return { kind: 'name', name: text, isDm: false }
}

export function splitQuery(query: string): { keywords: string[]; filters: string } {
  const tokens = query.match(/"[^"]*"|\S+/g) ?? []
  const filters = tokens.filter(token => /^[a-z_]+:/.test(token))
  const keywords = tokens.filter(token => !/^[a-z_]+:/.test(token))
  return { keywords, filters: filters.join(' ') }
}

export function parseInterval(arg: string): number | undefined {
  const text = arg.trim()
  if (!/^\d+$/.test(text)) return undefined
  const seconds = Number(text)
  return seconds >= MIN_INTERVAL && seconds <= MAX_INTERVAL ? seconds : undefined
}

async function resolveTarget($: EngineInterface, client: SlackClient, target: Target): Promise<Channel | undefined> {
  if (target.kind === 'id') {
    return (await findKnownChannel($, c => c.id === target.id)) ?? { id: target.id, name: target.id, kind: 'public' }
  }
  const known = await findKnownChannel(
    $,
    c => c.name === target.name && (target.isDm ? c.kind === 'im' : c.kind !== 'im'),
  )
  if (known || target.isDm) return known
  return client.findChannel(target.name)
}

export async function runPaneCommand($: EngineInterface, client: SlackClient, args: string): Promise<string> {
  const target = parseTarget(args)
  if (!target) {
    if (await readPaneOpen($)) {
      await closePane($)
      return 'Slack pane closed'
    }
    await openPane($, client)
    return 'Slack pane opened'
  }
  await openPane($, client)
  let channel: Channel | undefined
  try {
    channel = await resolveTarget($, client, target)
  } catch (error) {
    return reportError($, error)
  }
  if (!channel) return `Channel not found: ${args.trim()}`
  const label = channelLabel(channel)
  await openView($, client, { kind: 'channel', channelId: channel.id, label })
  return `Opened ${label}`
}

export async function runRefreshCommand($: EngineInterface, client: SlackClient, args: string): Promise<string> {
  if (args.trim() === '') return `Refresh interval: ${await readIntervalSeconds($)}s`
  const seconds = parseInterval(args)
  if (seconds === undefined) return `Interval must be an integer from ${MIN_INTERVAL} to ${MAX_INTERVAL}`
  await setIntervalSeconds($, client, seconds)
  return `Refresh interval set to ${seconds}s`
}

export async function runSearchCommand($: EngineInterface, client: SlackClient, args: string): Promise<string> {
  const query = args.trim()
  if (query === '') return 'Usage: /slack-pane-search <query>'
  await openPane($, client)
  const { keywords, filters } = splitQuery(query)
  await runSearch($, client, query, keywords, filters)
  return `Searching: ${query}`
}

export { myUserId }
