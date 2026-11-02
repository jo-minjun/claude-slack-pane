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

export function charWidth(char: string): number {
  return WIDE.test(char) ? 2 : 1
}

export function displayWidth(text: string): number {
  let width = 0
  for (const char of text) width += charWidth(char)
  return width
}

export function fitWidth(text: string, cells: number): string {
  if (displayWidth(text) <= cells) return text
  let out = ''
  let width = 0
  for (const char of text) {
    const w = charWidth(char)
    if (width + w > cells - 1) break
    out += char
    width += w
  }
  return `${out}…`
}

export function firstLine(text: string, width: number): string {
  return fitWidth(text.split('\n')[0] ?? '', width)
}

// Rows taken by items of these widths laid out one cell apart, a new row when the next does not fit.
export function packedRows(widths: number[], width: number): number {
  let rows = 1
  let used = 0
  for (const w of widths) {
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

// Splits text into rows of at most `width` cells, at spaces where it can, inside a word where it must.
// Leading spaces stay; the spaces at a break are dropped.
export function wrapText(text: string, width: number): string[] {
  const cells = Math.max(1, width)
  const rows: string[] = []
  for (const source of text.split('\n')) {
    let row = ''
    let used = 0
    const breakRow = () => {
      rows.push(row.trimEnd())
      row = ''
      used = 0
    }
    for (const token of source.match(/ +|[^ ]+/g) ?? []) {
      const w = displayWidth(token)
      if (used + w <= cells) {
        row += token
        used += w
      } else if (token.startsWith(' ')) {
        breakRow()
      } else if (w <= cells) {
        breakRow()
        row = token
        used = w
      } else {
        for (const char of token) {
          if (used + charWidth(char) > cells) breakRow()
          row += char
          used += charWidth(char)
        }
      }
    }
    rows.push(row)
  }
  return rows
}
