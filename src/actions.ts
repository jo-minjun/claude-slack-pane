import type { EngineInterface, RenderSurface } from 'claude-code'

import type { Channel, Message, View } from '../types'
import { clearBanner, reportError } from './errors'
import { channelLabel, formatTime, tzOffsetMinutes } from './format'
import { attachQuotes, extractQuotes, type QuoteKind, type QuoteRef, quoteToken } from './quote'
import { restartTimer, stopTimer } from './poller'
import type { SlackClient } from './slack/client'
import { domainFromPermalink, messageLink } from './slack/link'
import { readChannels, updateChannels, updateLeft, updatePaneOpen } from './state'

export const PANE_ID = 'slack'

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

export async function myUserId($: EngineInterface, client: SlackClient): Promise<string | undefined> {
  const stored = await $.store.get('myUserId')
  if (typeof stored === 'string') return stored
  try {
    const id = await client.me()
    await $.store.set('myUserId', id)
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
    const domain = page.items.map(hit => domainFromPermalink(hit.permalink)).find(Boolean)
    if (domain !== undefined) await $.store.set('workspaceDomain', domain)
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

export function quoteRef(kind: QuoteKind, view: View, m: Message): QuoteRef {
  const base = { kind, channelId: view.channelId, ts: m.ts }
  return m.threadTs === undefined ? base : { ...base, threadTs: m.threadTs }
}

export async function quoteMessage($: EngineInterface, kind: QuoteKind, view: View, m: Message): Promise<void> {
  const time = formatTime(m.ts, await $.clock.now(), tzOffsetMinutes())
  const token = quoteToken(quoteRef(kind, view, m), view.label, time, m.userName)
  await $.prompt.fill({ text: `${token} `, mode: 'insert' })
}

async function workspaceDomain($: EngineInterface, client: SlackClient): Promise<string | undefined> {
  const stored = await $.store.get('workspaceDomain')
  if (typeof stored === 'string') return stored
  const id = await myUserId($, client)
  if (id === undefined) return undefined
  try {
    const page = await client.search([], `from:<@${id}>`)
    const domain = page.items.map(hit => domainFromPermalink(hit.permalink)).find(Boolean)
    if (domain !== undefined) await $.store.set('workspaceDomain', domain)
    return domain
  } catch (error) {
    await reportError($, error)
    return undefined
  }
}

export async function copyLink(
  $: EngineInterface,
  client: SlackClient,
  view: View,
  m: Message,
  surface: RenderSurface,
): Promise<void> {
  const domain = await workspaceDomain($, client)
  if (domain === undefined) {
    $.ui.toast('Workspace domain unknown')
    return
  }
  await $.ui.copy({ text: messageLink(domain, view.channelId, m.ts, m.threadTs), surface })
  $.ui.toast('Link copied')
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
