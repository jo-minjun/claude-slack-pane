import { displayWidth, packedRows } from '../format'

const FROM_ME = 'From me'
export const CLEAR_LABEL = '× Clear'
export const fromMeLabel = (isOn: boolean) => `${isOn ? '☑' : '☐'} ${FROM_ME}`

// The terminal draws a Button as `[ label ]`.
const BUTTON_CHROME = 4
// The frame's two sides and the column's padding.
const FRAME_CELLS = 3
// A spare cell for a symbol the width table misses.
const SPARE_CELLS = 1

const buttonWidths = (isSearch: boolean) =>
  [fromMeLabel(false), ...(isSearch ? [CLEAR_LABEL] : [])].map(label => displayWidth(label) + BUTTON_CHROME)

// The narrowest left column whose search frame holds its buttons, and the cell between them, on one row.
export const MIN_LEFT_WIDTH = buttonWidths(true).reduce((sum, w) => sum + w, 0) + 1 + FRAME_CELLS + SPARE_CELLS

// Rows the frame's buttons take: in a narrower column they wrap rather than draw over the right column.
export function searchButtonRows(leftWidth: number, isSearch: boolean): number {
  return packedRows(buttonWidths(isSearch), Math.max(1, leftWidth - FRAME_CELLS))
}
