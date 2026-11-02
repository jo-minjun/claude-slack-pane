import type { Channel } from '../types'

const MINUTE_MS = 60 * 1000
const pad = (n: number) => String(n).padStart(2, '0')

// The module has no time zone database: the caller passes the offset.
export function formatTime(ts: string, nowMs: number, tzOffsetMinutes: number): string {
  const shift = tzOffsetMinutes * MINUTE_MS
  const at = new Date(Math.floor(Number(ts)) * 1000 + shift)
  const now = new Date(nowMs + shift)
  const time = `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}`
  const isToday =
    at.getUTCFullYear() === now.getUTCFullYear() &&
    at.getUTCMonth() === now.getUTCMonth() &&
    at.getUTCDate() === now.getUTCDate()
  return isToday ? time : `${pad(at.getUTCMonth() + 1)}/${pad(at.getUTCDate())} ${time}`
}

export function channelLabel(channel: Channel): string {
  if (channel.kind === 'im') return `@${channel.name}`
  if (channel.kind === 'mpim') return channel.name
  return `#${channel.name}`
}

export function tzOffsetMinutes(): number {
  return -new Date().getTimezoneOffset()
}

export function clockTime(ms: number, tzMinutes: number): string {
  const at = new Date(ms + tzMinutes * MINUTE_MS)
  return `${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}`
}

// Hangul, CJK, full-width forms and most emoji take two terminal cells.
const WIDE = /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{1F300}-\u{1FAFF}]/u

export function displayWidth(text: string): number {
  let width = 0
  for (const char of text) width += WIDE.test(char) ? 2 : 1
  return width
}

export function fitWidth(text: string, cells: number): string {
  if (displayWidth(text) <= cells) return text
  let out = ''
  let width = 0
  for (const char of text) {
    const w = WIDE.test(char) ? 2 : 1
    if (width + w > cells - 1) break
    out += char
    width += w
  }
  return `${out}…`
}

export function firstLine(text: string, width: number): string {
  return fitWidth(text.split('\n')[0] ?? '', width)
}

// Rows a line takes when the terminal wraps it at spaces, as Text's default wrap does.
function wrappedRows(line: string, width: number): number {
  let rows = 1
  let used = 0
  for (const word of line.split(' ')) {
    const w = displayWidth(word)
    const need = used === 0 ? w : used + 1 + w
    if (need <= width) {
      used = need
    } else if (w <= width) {
      rows += 1
      used = w
    } else {
      const head = used === 0 ? 0 : 1
      rows += head + Math.ceil(w / width) - 1
      used = w % width || width
    }
  }
  return rows
}

export function rowsFor(text: string, width: number): number {
  const cells = Math.max(1, width)
  return text.split('\n').reduce((sum, line) => sum + wrappedRows(line, cells), 0)
}
