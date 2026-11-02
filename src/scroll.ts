import type { EngineInterface, UiScrollInput } from 'claude-code'

import type { ChannelsState, LeftState, Message, View } from '../types'
import { loadChannels, runSearch } from './actions'
import { splitQuery } from './commands'
import { rowsFor } from './format'
import { loadOlder } from './poller'
import type { SlackClient } from './slack/client'
import { actionBarRows } from './ui/action-bar'
import {
  readChannels,
  readLeft,
  readMessageBottomTs,
  readMessages,
  readSelectedTs,
  readView,
  updateChannels,
  updateLeft,
  updateMessageBottomTs,
  updateSelectedTs,
} from './state'

// Rows of the left column above and below its list: title, search, buttons, ▲ and ▼.
const LEFT_CHROME_ROWS = 5
const SEARCH_HIT_ROWS = 2

// What the last drawing laid out; a wheel tick is read against it.
type PaneLayout = { leftWidth: number; leftRows: number; rightWidth: number; messageRows: number }
let layout: PaneLayout | undefined
export function setLayout(next: PaneLayout): void {
  layout = next
}

// The list the left column shows now, and its first shown item.
export function leftList(left: LeftState, channels: ChannelsState) {
  const isSearch = left.mode === 'search'
  return { isSearch, list: isSearch ? left.results : channels, top: isSearch ? left.top : channels.top }
}

export function leftItemRows(isSearch: boolean): number {
  return isSearch ? SEARCH_HIT_ROWS : 1
}

export function leftPageSize(rows: number, isSearch: boolean): number {
  return Math.max(1, Math.floor((rows - LEFT_CHROME_ROWS) / leftItemRows(isSearch)))
}

// The blank row the message list draws between two messages.
export const MESSAGE_GAP_ROWS = 1

// Rows each message takes; the selected one also carries its action bar.
export function messageHeights(items: Message[], view: View, selectedTs: string | null, width: number): number[] {
  const barRows = actionBarRows(view, width)
  return items.map(m => 1 + rowsFor(m.text, width) + (m.hasFile ? 1 : 0) + MESSAGE_GAP_ROWS + (m.ts === selectedTs ? barRows : 0))
}

// How many items from `from`, walking by `step`, fit `rows`; the first one always counts.
function fill(length: number, from: number, step: 1 | -1, rows: number, heightAt: (index: number) => number): number {
  let count = 0
  let used = 0
  for (let i = from; i >= 0 && i < length; i += step) {
    const need = heightAt(i)
    if (count > 0 && used + need > rows) break
    used += need
    count += 1
  }
  return count
}

function windowEnd(items: Message[], bottomTs: string | null): number {
  const anchored = bottomTs === null ? -1 : items.findIndex(m => m.ts === bottomTs)
  return anchored === -1 ? items.length : anchored + 1
}

// The messages that fit `rows` ending at `bottomTs` (the newest when null), as [start, end).
export function messageWindow(items: Message[], bottomTs: string | null, rows: number, heights: number[]) {
  const end = windowEnd(items, bottomTs)
  return { start: end - fill(items.length, end - 1, -1, rows, i => heights[i]!), end }
}

// The bottom message of a window that starts at `start`; null when it reaches the newest.
function bottomFrom(items: Message[], start: number, rows: number, heights: number[]): string | null {
  const end = start + fill(items.length, start, 1, rows, i => heights[i]!)
  return end >= items.length ? null : items[end - 1]!.ts
}

// Moves the right column by `by` rows, negative toward older messages.
export async function scrollMessages($: EngineInterface, client: SlackClient, by: number): Promise<void> {
  if (!layout || by === 0) return
  const { messageRows: rows, rightWidth: width } = layout
  const [view, before, bottomTs, selectedTs] = await Promise.all([
    readView($),
    readMessages($),
    readMessageBottomTs($),
    readSelectedTs($),
  ])
  if (!view) return
  const shown = messageWindow(before.items, bottomTs, rows, messageHeights(before.items, view, selectedTs, width))
  const isAtOldest = by < 0 && shown.start === 0 && view.kind === 'channel'
  const isAtNewest = by > 0 && shown.end === before.items.length && view.kind === 'thread' && before.cursor !== undefined
  let items = before.items
  if (items.length > 0 && (isAtOldest || isAtNewest)) {
    await loadOlder($, client)
    items = (await readMessages($)).items
  }
  const heights = messageHeights(items, view, selectedTs, width)
  const heightAt = (i: number) => heights[i]!
  const step = by < 0 ? -1 : 1
  const anchor = windowEnd(items, bottomTs)
  // Whole messages, at least one, without passing `by` rows: a page move must not skip any.
  const moved = fill(items.length, by < 0 ? anchor - 1 : anchor, step, Math.abs(by), heightAt)
  let end = anchor + step * moved
  if (by < 0) end = Math.max(end, fill(items.length, 0, 1, rows, heightAt))
  const next = end >= items.length ? null : items[end - 1]!.ts
  if (next !== bottomTs) await updateMessageBottomTs($, () => next)
}

// Moves the left list by `by` rows, loading the next page at its end.
export async function scrollLeft($: EngineInterface, client: SlackClient, by: number): Promise<void> {
  if (!layout || by === 0) return
  const [left, channels] = await Promise.all([readLeft($), readChannels($)])
  const { isSearch, list, top } = leftList(left, channels)
  const count = Math.sign(by) * Math.ceil(Math.abs(by) / leftItemRows(isSearch))
  const size = leftPageSize(layout.leftRows, isSearch)
  let length = list.items.length
  if (count > 0 && top + count + size > length && list.cursor !== undefined && !list.isLoading) {
    if (isSearch) {
      await runSearch($, client, left.query, splitQuery(left.query).keywords, left.filters, list.cursor)
      length = (await readLeft($)).results.items.length
    } else {
      await loadChannels($, client, list.cursor)
      length = (await readChannels($)).items.length
    }
  }
  const next = Math.min(Math.max(0, top + count), Math.max(0, length - size))
  if (next === top) return
  if (isSearch) await updateLeft($, l => ({ ...l, top: next }))
  else await updateChannels($, c => ({ ...c, top: next }))
}

// A wheel tick moves the column under the pointer; the scroll keys move the messages.
export async function scrollPane($: EngineInterface, client: SlackClient, e: UiScrollInput): Promise<void> {
  const isOverLeft = layout !== undefined && e.pointer !== undefined && e.pointer.column < layout.leftWidth
  await (isOverLeft ? scrollLeft($, client, e.by) : scrollMessages($, client, e.by))
}

// Selects a message and keeps it, with its action bar, inside the window.
export async function selectMessage($: EngineInterface, ts: string): Promise<void> {
  await updateSelectedTs($, () => ts)
  const [view, messages, bottomTs] = await Promise.all([readView($), readMessages($), readMessageBottomTs($)])
  if (!layout || !view) return
  const { items } = messages
  const index = items.findIndex(m => m.ts === ts)
  const heights = messageHeights(items, view, ts, layout.rightWidth)
  if (index === -1 || index >= messageWindow(items, bottomTs, layout.messageRows, heights).start) return
  const next = bottomFrom(items, index, layout.messageRows, heights)
  await updateMessageBottomTs($, () => next)
}
