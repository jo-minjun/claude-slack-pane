import type { EngineInterface, RenderSurface } from 'claude-code'

import type { Channel, Message, SearchHit, View } from '../types'
import { clearBanner, reportError } from './errors'
import { channelLabel, formatTime, tzOffsetMinutes } from './format'
import { attachQuotes, extractQuotes, type QuoteRef, quoteToken } from './quote'
import { restartTimer, stopTimer } from './poller'
import type { SlackClient } from './slack/client'
import { domainFromPermalink, messageLink } from './slack/link'
import { readChannels, readMyUserIds, updateChannels, updateLeft, updateMyUserIds, updatePaneOpen } from './state'

export const PANE_ID = 'slack'
// The pane's message input.
export const COMPOSER_KEY = 'composer'

export async function loadChannels($: EngineInterface, client: SlackClient, cursor?: string): Promise<void> {
  await updateChannels($, c => ({ ...c, isLoading: true }))
  try {
    const page = await client.listChannels(cursor)
    await updateChannels($, c => ({
      items: cursor === undefined ? page.items : [...c.items, ...page.items],
      top: cursor === undefined ? 0 : c.top,
      isLoading: false,
      ...(page.nextCursor === undefined ? {} : { cursor: page.nextCursor }),
    }))
    await clearBanner($)
  } catch (error) {
    const line = await reportError($, error)
    await updateChannels($, c => ({ ...c, isLoading: false, error: line }))
  }
}

// Asked once a session for each server, never kept across sessions: another session's server, or this
// one logged in again, can be another workspace's user.
export async function myUserId($: EngineInterface, client: SlackClient): Promise<string | undefined> {
  const known = (await readMyUserIds($))[client.server]
  if (known !== undefined) return known
  try {
    const id = await client.me()
    await updateMyUserIds($, ids => ({ ...ids, [client.server]: id }))
    return id
  } catch (error) {
    await reportError($, error)
    return undefined
  }
}

export async function openPane($: EngineInterface, client: SlackClient): Promise<void> {
  await $.ui.open({ id: PANE_ID, title: 'Slack' })
  await updatePaneOpen($, () => true)
  if ((await readChannels($)).items.length === 0) await loadChannels($, client)
  await myUserId($, client)
  await restartTimer($, client)
}

export async function closePane($: EngineInterface): Promise<void> {
  stopTimer()
  await updatePaneOpen($, () => false)
  await $.ui.close({ id: PANE_ID })
}

export async function runSearch(
  $: EngineInterface,
  client: SlackClient,
  query: string,
  keywords: string[],
  filters: string,
  cursor?: string,
): Promise<void> {
  await updateLeft($, l => ({
    ...l,
    mode: 'search' as const,
    query,
    filters,
    top: cursor === undefined ? 0 : l.top,
    results: { ...(cursor === undefined ? { items: [] } : l.results), isLoading: true },
  }))
  try {
    const page = await client.search(keywords, filters, cursor)
    await rememberDomain($, client, page.items)
    await updateLeft($, l => ({
      ...l,
      results: {
        items: cursor === undefined ? page.items : [...l.results.items, ...page.items],
        isLoading: false,
        ...(page.nextCursor === undefined ? {} : { cursor: page.nextCursor }),
      },
    }))
  } catch (error) {
    const line = await reportError($, error)
    await updateLeft($, l => ({ ...l, results: { ...l.results, isLoading: false, error: line } }))
  }
}

export async function findKnownChannel(
  $: EngineInterface,
  test: (c: Channel) => boolean,
): Promise<Channel | undefined> {
  return (await readChannels($)).items.find(test)
}

function quoteRef(view: View, m: Message): QuoteRef {
  const base = { channelId: view.channelId, ts: m.ts }
  return m.threadTs === undefined ? base : { ...base, threadTs: m.threadTs }
}

export async function quoteMessage($: EngineInterface, view: View, m: Message): Promise<void> {
  const time = formatTime(m.ts, await $.clock.now(), tzOffsetMinutes())
  const token = quoteToken(quoteRef(view, m), view.label, time, m.userName)
  await $.prompt.fill({ text: `${token} `, mode: 'insert' })
}

// A workspace's domain, kept across sessions under the user it was found for: a user ID is one workspace's.
const domainKey = (userId: string) => `workspaceDomain:${userId}`

async function rememberDomain($: EngineInterface, client: SlackClient, hits: SearchHit[]): Promise<string | undefined> {
  const domain = hits.map(hit => domainFromPermalink(hit.permalink)).find(Boolean)
  const id = (await readMyUserIds($))[client.server]
  if (domain !== undefined && id !== undefined) await $.store.set(domainKey(id), domain)
  return domain
}

async function workspaceDomain($: EngineInterface, client: SlackClient): Promise<string | undefined> {
  const id = await myUserId($, client)
  if (id === undefined) return undefined
  const stored = await $.store.get(domainKey(id))
  if (typeof stored === 'string') return stored
  try {
    return await rememberDomain($, client, (await client.search([], `from:<@${id}>`)).items)
  } catch (error) {
    await reportError($, error)
    return undefined
  }
}

async function linkFor($: EngineInterface, client: SlackClient, view: View, m: Message): Promise<string | undefined> {
  const domain = await workspaceDomain($, client)
  if (domain === undefined) $.ui.toast('Workspace domain unknown')
  return domain === undefined ? undefined : messageLink(domain, view.channelId, m.ts, m.threadTs)
}

export async function copyLink(
  $: EngineInterface,
  client: SlackClient,
  view: View,
  m: Message,
  surface: RenderSurface,
): Promise<void> {
  const link = await linkFor($, client, view, m)
  if (link === undefined) return
  await $.ui.copy({ text: link, surface })
  $.ui.toast('Link copied')
}

// Slack edits and deletes there: the Slack MCP has no tool for either.
export async function openInSlack($: EngineInterface, client: SlackClient, view: View, m: Message): Promise<void> {
  const link = await linkFor($, client, view, m)
  if (link === undefined) return
  const result = await $.process.run(['open', link])
  if (result.exitCode !== 0) $.ui.toast('Could not open Slack')
}

export async function attachPromptQuotes(
  $: EngineInterface,
  client: SlackClient,
  prompt: string,
): Promise<string[]> {
  if (extractQuotes(prompt).length === 0) return []
  const known = (await readChannels($)).items
  const now = await $.clock.now()
  const tz = tzOffsetMinutes()
  const { context, failed } = await attachQuotes(
    prompt,
    client,
    channelId => {
      const channel = known.find(c => c.id === channelId)
      return channel === undefined ? channelId : channelLabel(channel)
    },
    m => `[${formatTime(m.ts, now, tz)}] ${m.userName}: ${m.text}`,
  )
  if (failed > 0) $.ui.toast('Quote fetch failed')
  return context
}
