import type { EngineInterface, UiScrollInput } from 'claude-code'

import type { Message } from '../types'
import { loadChannels, runSearch } from './actions'
import { splitQuery } from './commands'
import { rowsFor } from './format'
import { loadOlder } from './poller'
import type { SlackClient } from './slack/client'
import {
  readChannels,
  readLeft,
  readMessageBottomTs,
  readMessages,
  readView,
  updateChannels,
  updateLeft,
  updateMessageBottomTs,
} from './state'

// Rows of the left column above and below its list: title, search, buttons, ▲ and ▼.
const LEFT_CHROME_ROWS = 5
const SEARCH_HIT_ROWS = 2

// What the last drawing laid out; a wheel tick is read against it.
export type PaneLayout = { leftWidth: number; leftRows: number; rightWidth: number; messageRows: number }
let layout: PaneLayout | undefined
export function setLayout(next: PaneLayout): void {
  layout = next
}

export function leftPageSize(rows: number, isSearch: boolean): number {
  return Math.max(1, Math.floor((rows - LEFT_CHROME_ROWS) / (isSearch ? SEARCH_HIT_ROWS : 1)))
}

export function messageRows(m: Message, width: number): number {
  return 1 + rowsFor(m.text, width - 2) + (m.hasFile ? 1 : 0)
}

// The messages that fit `rows` ending at `bottomTs` (the newest when null), as [start, end).
export function messageWindow(items: Message[], bottomTs: string | null, rows: number, width: number) {
  const anchored = bottomTs === null ? -1 : items.findIndex(m => m.ts === bottomTs)
  const end = anchored === -1 ? items.length : anchored + 1
  let start = end
  let used = 0
  while (start > 0) {
    const need = messageRows(items[start - 1]!, width)
    if (start < end && used + need > rows) break
    used += need
    start -= 1
  }
  return { start, end }
}

// The smallest window end that still fills the rows from the oldest message.
function firstFullEnd(items: Message[], rows: number, width: number): number {
  let end = 0
  let used = 0
  while (end < items.length) {
    const need = messageRows(items[end]!, width)
    if (end > 0 && used + need > rows) break
    used += need
    end += 1
  }
  return end
}

let loadingOlder = false
async function loadOlderOnce($: EngineInterface, client: SlackClient): Promise<void> {
  if (loadingOlder) return
  loadingOlder = true
  try {
    await loadOlder($, client)
  } finally {
    loadingOlder = false
  }
}

// Moves the right column by `by` rows, negative toward older messages.
export async function scrollMessages($: EngineInterface, client: SlackClient, by: number): Promise<void> {
  const view = await readView($)
  if (!layout || !view || by === 0) return
  const { messageRows: rows, rightWidth: width } = layout
  const before = await readMessages($)
  const bottomTs = await readMessageBottomTs($)
  const first = messageWindow(before.items, bottomTs, rows, width)
  const isAtOldest = by < 0 && first.start === 0 && view.kind === 'channel'
  const isAtNewest = by > 0 && first.end === before.items.length && view.kind === 'thread' && before.cursor !== undefined
  if (before.items.length > 0 && (isAtOldest || isAtNewest)) await loadOlderOnce($, client)
  const items = (await readMessages($)).items
  let { end } = messageWindow(items, bottomTs, rows, width)
  let moved = 0
  if (by < 0) {
    while (end > 1 && moved < -by) {
      moved += messageRows(items[end - 1]!, width)
      end -= 1
    }
    end = Math.max(end, firstFullEnd(items, rows, width))
  } else {
    while (end < items.length && moved < by) {
      moved += messageRows(items[end]!, width)
      end += 1
    }
  }
  const next = end >= items.length ? null : items[end - 1]!.ts
  await updateMessageBottomTs($, () => next)
}

// Moves the left list by `count` items, loading the next page at its end.
export async function scrollLeft($: EngineInterface, client: SlackClient, count: number): Promise<void> {
  if (!layout || count === 0) return
  const left = await readLeft($)
  const channels = await readChannels($)
  const isSearch = left.mode === 'search'
  const before = isSearch ? left.results : channels
  const top = isSearch ? left.top : channels.top
  const size = leftPageSize(layout.leftRows, isSearch)
  if (count > 0 && top + count + size > before.items.length && before.cursor !== undefined && !before.isLoading) {
    if (isSearch) await runSearch($, client, left.query, splitQuery(left.query).keywords, left.filters, before.cursor)
    else await loadChannels($, client, before.cursor)
  }
  const length = (isSearch ? (await readLeft($)).results : await readChannels($)).items.length
  const next = Math.min(Math.max(0, top + count), Math.max(0, length - size))
  if (isSearch) await updateLeft($, l => ({ ...l, top: next }))
  else await updateChannels($, c => ({ ...c, top: next }))
}

// A wheel tick moves the column under the pointer; the scroll keys move the messages.
export async function scrollPane($: EngineInterface, client: SlackClient, e: UiScrollInput): Promise<void> {
  if (!layout) return
  if (e.pointer !== undefined && e.pointer.column < layout.leftWidth) {
    const isSearch = (await readLeft($)).mode === 'search'
    const count = Math.ceil(Math.abs(e.by) / (isSearch ? SEARCH_HIT_ROWS : 1))
    await scrollLeft($, client, Math.sign(e.by) * count)
  } else {
    await scrollMessages($, client, e.by)
  }
}
