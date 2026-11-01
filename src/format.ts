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

export function firstLine(text: string, width: number): string {
  const line = text.split('\n')[0] ?? ''
  return line.length > width ? `${line.slice(0, Math.max(0, width - 1))}…` : line
}

export function rowsFor(text: string, width: number): number {
  return text.split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / Math.max(1, width))), 0)
}
