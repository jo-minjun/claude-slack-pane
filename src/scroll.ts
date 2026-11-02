import type { EngineInterface, UiScrollInput } from 'claude-code'

import type { Channel, ChannelsState, LeftState, Message, MessageAnchor, View } from '../types'
import { loadChannels, runSearch } from './actions'
import { splitQuery } from './commands'
import { isDirect, plainEmoji, wrapText } from './format'
import { loadOlder } from './poller'
import type { SlackClient } from './slack/client'
import { actionBarRows } from './ui/action-bar'
import {
  readChannels,
  readLeft,
  readMessageTop,
  readMessages,
  readSelectedTs,
  readView,
  updateChannels,
  updateLeft,
  updateMessageTop,
  updateSelectedTs,
} from './state'

// Rows of the left column above and below its list: title, the framed search with its buttons, ▲ and ▼.
const LEFT_CHROME_ROWS = 7
// A search hit: its channel and time, its author and text, and a blank row after it.
const SEARCH_HIT_ROWS = 3

// What the last drawing laid out; a wheel tick is read against it.
type PaneLayout = { leftWidth: number; leftRows: number; rightWidth: number; messageRows: number }
let layout: PaneLayout | undefined
export function setLayout(next: PaneLayout): void {
  layout = next
}

// The channel list as the left column draws it: channels, then direct messages, each under a heading.
export type ChannelRow = { kind: 'heading'; label: string } | { kind: 'gap' } | { kind: 'channel'; channel: Channel }
const CHANNELS_HEADING = 'CHANNELS'
const DIRECT_HEADING = 'DIRECT MESSAGES'

export function channelRows(items: Channel[]): ChannelRow[] {
  const section = (label: string, members: Channel[]): ChannelRow[] =>
    members.length === 0 ? [] : [{ kind: 'heading', label }, ...members.map(channel => ({ kind: 'channel' as const, channel }))]
  const channels = section(CHANNELS_HEADING, items.filter(c => !isDirect(c)))
  const direct = section(DIRECT_HEADING, items.filter(isDirect))
  return channels.length > 0 && direct.length > 0 ? [...channels, { kind: 'gap' }, ...direct] : [...channels, ...direct]
}

// The list the left column shows now, its first shown row, and how many rows it has.
export function leftList(left: LeftState, channels: ChannelsState) {
  const isSearch = left.mode === 'search'
  const length = isSearch ? left.results.items.length : channelRows(channels.items).length
  return { isSearch, list: isSearch ? left.results : channels, top: isSearch ? left.top : channels.top, length }
}

export function leftItemRows(isSearch: boolean): number {
  return isSearch ? SEARCH_HIT_ROWS : 1
}

export function leftPageSize(rows: number, isSearch: boolean): number {
  return Math.max(1, Math.floor((rows - LEFT_CHROME_ROWS) / leftItemRows(isSearch)))
}

// Between two messages.
const GAP_ROWS = 1
// Cells left free at the right edge, so a full row never wraps even when a symbol the width
// table misses is drawn a cell wider: a wrapped row shifts every row below it on screen.
const EDGE_CELLS = 2
const FILE_ROW = '[file]'

// The right column's messages laid out in rows: each a header row, its body rows, and the
// selected one's action bar; `top` is the first row the window of `rows` shows.
export type MessageFrame = {
  body: string[][]
  bar: number[]
  pos: number[]
  total: number
  top: number
  rows: number
  width: number
}

export function messageHeight(frame: MessageFrame, index: number): number {
  return 1 + frame.body[index]!.length + frame.bar[index]!
}

export function lastTop(frame: MessageFrame): number {
  return Math.max(0, frame.total - frame.rows)
}

export function messageFrame(
  items: Message[],
  view: View,
  selectedTs: string | null,
  anchor: MessageAnchor | null,
  rows: number,
  width: number,
): MessageFrame {
  const textWidth = Math.max(1, width - EDGE_CELLS)
  const barRows = actionBarRows(view, width)
  const body = items.map(m => [...wrapText(m.text === '' ? ' ' : plainEmoji(m.text), textWidth), ...(m.hasFile ? [FILE_ROW] : [])])
  const bar = items.map(m => (m.ts === selectedTs ? barRows : 0))
  const pos: number[] = []
  let total = 0
  items.forEach((_, i) => {
    if (i > 0) total += GAP_ROWS
    pos.push(total)
    total += 1 + body[i]!.length + bar[i]!
  })
  const frame = { body, bar, pos, total, top: 0, rows, width: textWidth }
  const index = anchor === null ? -1 : items.findIndex(m => m.ts === anchor.ts)
  const end = lastTop(frame)
  return { ...frame, top: index === -1 ? end : Math.min(end, pos[index]! + anchor!.skip) }
}

// Loaded messages wholly below the window.
export function newerBelow(frame: MessageFrame): number {
  return frame.pos.filter(p => p >= frame.top + frame.rows).length
}

// The anchor of a window starting at row `top`; null at the newest end, so new messages stay in view.
function anchorAt(items: Message[], frame: MessageFrame, top: number): MessageAnchor | null {
  if (top >= lastTop(frame)) return null
  let i = 0
  while (i + 1 < items.length && frame.pos[i + 1]! <= top) i += 1
  return { ts: items[i]!.ts, skip: top - frame.pos[i]! }
}

const sameAnchor = (a: MessageAnchor | null, b: MessageAnchor | null) =>
  a === b || (a !== null && b !== null && a.ts === b.ts && a.skip === b.skip)

async function moveTo($: EngineInterface, items: Message[], frame: MessageFrame, current: MessageAnchor | null, top: number) {
  const next = anchorAt(items, frame, top)
  if (!sameAnchor(next, current)) await updateMessageTop($, () => next)
}

// Moves the right column by `by` rows, negative toward older messages.
export async function scrollMessages($: EngineInterface, client: SlackClient, by: number): Promise<void> {
  if (!layout || by === 0) return
  const { messageRows: rows, rightWidth: width } = layout
  const [view, before, anchor, selectedTs] = await Promise.all([readView($), readMessages($), readMessageTop($), readSelectedTs($)])
  if (!view) return
  let frame = messageFrame(before.items, view, selectedTs, anchor, rows, width)
  const isAtOldest = by < 0 && frame.top === 0 && view.kind === 'channel'
  const isAtNewest = by > 0 && frame.top >= lastTop(frame) && view.kind === 'thread' && before.cursor !== undefined
  let items = before.items
  if (items.length > 0 && (isAtOldest || isAtNewest)) {
    await loadOlder($, client)
    items = (await readMessages($)).items
    frame = messageFrame(items, view, selectedTs, anchor, rows, width)
  }
  await moveTo($, items, frame, anchor, Math.min(lastTop(frame), Math.max(0, frame.top + by)))
}

// Moves the left list by `by` rows, loading the next page at its end.
export async function scrollLeft($: EngineInterface, client: SlackClient, by: number): Promise<void> {
  if (!layout || by === 0) return
  const [left, channels] = await Promise.all([readLeft($), readChannels($)])
  const { isSearch, list, top, length: loaded } = leftList(left, channels)
  const count = Math.sign(by) * Math.ceil(Math.abs(by) / leftItemRows(isSearch))
  const size = leftPageSize(layout.leftRows, isSearch)
  const needsMore = count > 0 && top + count + size > loaded && list.cursor !== undefined && !list.isLoading
  if (needsMore) {
    if (isSearch) await runSearch($, client, left.query, splitQuery(left.query).keywords, left.filters, list.cursor)
    else await loadChannels($, client, list.cursor)
  }
  const length = needsMore ? leftList(await readLeft($), await readChannels($)).length : loaded
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

// Selects a message and brings it, with its action bar, into the window; the selected one, pressed again, is let go.
export async function selectMessage($: EngineInterface, ts: string): Promise<void> {
  if ((await readSelectedTs($)) === ts) {
    await updateSelectedTs($, () => null)
    return
  }
  await updateSelectedTs($, () => ts)
  const [view, messages, anchor] = await Promise.all([readView($), readMessages($), readMessageTop($)])
  if (!layout || !view) return
  const { items } = messages
  const index = items.findIndex(m => m.ts === ts)
  if (index === -1) return
  const frame = messageFrame(items, view, ts, anchor, layout.messageRows, layout.rightWidth)
  const start = frame.pos[index]!
  const end = start + messageHeight(frame, index)
  if (start < frame.top) await moveTo($, items, frame, anchor, start)
  else if (end > frame.top + frame.rows) await moveTo($, items, frame, anchor, Math.min(start, end - frame.rows))
}
