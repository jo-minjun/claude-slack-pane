import type { Message } from '../../types'
import { displayWidth, formatTime, plainEmoji } from '../format'
import { HEADER_LINKS_WIDTH } from './action-bar'

export type Clock = { now: number; tz: number }

export function messageMeta(m: Message, clock: Clock): string {
  const replies = m.replyCount > 0 ? `  ${m.replyCount} replies` : ''
  return `  ${formatTime(m.ts, clock.now, clock.tz)}${replies}`
}

export function headerName(m: Message, isSelected: boolean): string {
  return `${isSelected ? '> ' : ''}${plainEmoji(m.userName)}`
}

// Whether the selected message's header holds its whole name and time beside the link buttons, a cell
// between; where it does not, the name keeps the header and the links go to the end of the action bar.
export function linksFitHeader(m: Message, clock: Clock, width: number): boolean {
  return displayWidth(headerName(m, true)) + displayWidth(messageMeta(m, clock)) + 1 + HEADER_LINKS_WIDTH <= width
}
