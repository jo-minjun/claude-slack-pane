import type { EngineInterface } from 'claude-code'

import type { Message, Page, View } from '../types'
import { clearBanner, reportError } from './errors'
import type { SlackClient } from './slack/client'
import { removeTemp } from './upload'
import {
  readComposer,
  readIntervalSeconds,
  readMessages,
  readPaneOpen,
  readView,
  updateComposer,
  updateIntervalSeconds,
  updateMessageTop,
  updateMessages,
  updateRefresh,
  updateSelectedTs,
  updateView,
} from './state'

const PAGE_SIZE = 20
const AROUND = 25

type Timer = ReturnType<EngineInterface['clock']['after']>
let timer: Timer | undefined
// A state read inside one hook dispatch keeps returning the value it saw first,
// so a late response is matched against this counter, not against a re-read.
let viewGeneration = 0

export function stopTimer(): void {
  timer?.cancel()
  timer = undefined
}

const newestFirst = (page: Page<Message>) => [...page.items].reverse()

// Slack's `latest` is exclusive; one microsecond past the anchor includes it.
export function nextTs(ts: string): string {
  const [sec = '0', micro = '0'] = ts.split('.')
  const bumped = Number(micro) + 1
  return bumped >= 1_000_000
    ? `${Number(sec) + 1}.000000`
    : `${sec}.${String(bumped).padStart(micro.length, '0')}`
}

const isPaused = (v: View) => v.kind === 'channel' && v.anchorTs !== undefined

const appendNew = (known: Message[], incoming: Message[]) => [
  ...known,
  ...incoming.filter(m => !known.some(k => k.ts === m.ts)),
]

// A thread refresh re-reads as many pages as are on screen, so replies loaded
// with "More replies" stay and new ones past the first page show up.
async function fetchThread(client: SlackClient, channelId: string, threadTs: string, loaded: number) {
  let items: Message[] = []
  let cursor: string | undefined
  do {
    const page = await client.readThread(channelId, threadTs, cursor)
    items = appendNew(items, page.items)
    cursor = page.nextCursor
  } while (cursor !== undefined && items.length < loaded)
  return cursor === undefined ? { items } : { items, nextCursor: cursor }
}

async function fetchView(client: SlackClient, v: View, loaded: number): Promise<Page<Message>> {
  if (v.kind === 'thread') return fetchThread(client, v.channelId, v.threadTs, loaded)
  if (v.anchorTs === undefined) {
    const page = await client.readChannel(v.channelId, { limit: PAGE_SIZE })
    return { ...page, items: newestFirst(page) }
  }
  const older = await client.readChannel(v.channelId, { latest: nextTs(v.anchorTs), limit: AROUND + 1 })
  const newer = await client.readChannel(v.channelId, { oldest: v.anchorTs, limit: AROUND })
  const after = newer.nextCursor === undefined ? newestFirst(newer).filter(m => m.ts > v.anchorTs!) : []
  return {
    items: [...newestFirst(older), ...after],
    ...(older.nextCursor === undefined ? {} : { nextCursor: older.nextCursor }),
  }
}

export async function refreshNow($: EngineInterface, client: SlackClient): Promise<void> {
  const generation = viewGeneration
  const requested = await readView($)
  if (!requested || !(await readPaneOpen($))) return
  await updateRefresh($, r => ({ ...r, status: 'refreshing' as const }))
  try {
    const page = await fetchView(client, requested, (await readMessages($)).items.length)
    if (generation !== viewGeneration) return
    const oldestFetched = page.items[0]?.ts
    await updateMessages($, current => {
      const older =
        requested.kind === 'thread' || oldestFetched === undefined ? [] : current.items.filter(m => m.ts < oldestFetched)
      const items = [...older, ...page.items]
      const cursor = older.length > 0 ? current.cursor : page.nextCursor
      return cursor === undefined ? { items, isLoading: false } : { items, cursor, isLoading: false }
    })
    const kept = (await readMessages($)).items
    await updateSelectedTs($, ts => (ts !== null && kept.some(m => m.ts === ts) ? ts : null))
    const now = await $.clock.now()
    await updateRefresh($, () =>
      isPaused(requested) ? { status: 'paused' as const, lastSuccessAt: now } : { status: 'idle' as const, lastSuccessAt: now },
    )
    await clearBanner($)
  } catch (error) {
    const line = await reportError($, error)
    if (generation !== viewGeneration) return
    const now = await $.clock.now()
    await updateRefresh($, r => ({ ...r, status: 'error' as const, failedAt: now }))
    await updateMessages($, m => (m.items.length === 0 ? { ...m, isLoading: false, error: line } : { ...m, isLoading: false }))
  }
}

export async function restartTimer($: EngineInterface, client: SlackClient): Promise<void> {
  stopTimer()
  const v = await readView($)
  if (!v || isPaused(v) || !(await readPaneOpen($))) return
  const seconds = await readIntervalSeconds($)
  const scheduled = $.clock.after(seconds * 1000, () => {
    if (timer !== scheduled) return
    timer = undefined
    void refreshNow($, client).then(() => (timer === undefined ? restartTimer($, client) : undefined))
  })
  timer = scheduled
}

export async function openView($: EngineInterface, client: SlackClient, v: View): Promise<void> {
  stopTimer()
  viewGeneration += 1
  const generation = viewGeneration
  await updateView($, () => v)
  await updateSelectedTs($, () => null)
  await updateMessageTop($, () => null)
  // A draft or attachment belongs to the view it was made in: never send it elsewhere.
  await removeTemp($, (await readComposer($)).attachment)
  await updateComposer($, () => ({ draft: '', isPathMode: false, isSending: false }))
  await updateMessages($, () => ({ items: [], isLoading: true }))
  await refreshNow($, client)
  if (generation === viewGeneration) await restartTimer($, client)
}

let isLoadingOlder = false
// The oldest message a channel read found nothing before: asking again would repeat that read.
let exhaustedTs: string | undefined

export async function loadOlder($: EngineInterface, client: SlackClient): Promise<void> {
  const generation = viewGeneration
  const v = await readView($)
  const current = await readMessages($)
  const oldest = current.items[0]
  if (!v || !oldest || isLoadingOlder) return
  if (v.kind === 'channel' && oldest.ts === exhaustedTs) return
  isLoadingOlder = true
  try {
    const page =
      v.kind === 'thread'
        ? current.cursor === undefined
          ? undefined
          : await client.readThread(v.channelId, v.threadTs, current.cursor)
        : await client.readChannel(v.channelId, { latest: oldest.ts, limit: PAGE_SIZE })
    if (!page || generation !== viewGeneration) return
    const items = v.kind === 'thread' ? page.items : newestFirst(page)
    await updateMessages($, m =>
      v.kind === 'thread'
        ? { ...m, items: appendNew(m.items, items), cursor: page.nextCursor }
        : { ...m, items: [...items, ...m.items] },
    )
    if (v.kind === 'channel' && (await readMessages($)).items[0]?.ts === oldest.ts) exhaustedTs = oldest.ts
  } catch (error) {
    await reportError($, error)
  } finally {
    isLoadingOlder = false
  }
}

export async function setIntervalSeconds($: EngineInterface, client: SlackClient, seconds: number): Promise<void> {
  await updateIntervalSeconds($, () => seconds)
  await $.store.set('refreshSeconds', seconds)
  await restartTimer($, client)
}
