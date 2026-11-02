import { displayWidth, wrapText } from './format'

// How a piece of message text is drawn: Slack's markers taken off and their meaning kept.
export type Segment = { text: string; bold?: true; italic?: true; strike?: true; code?: true; dim?: true }
export type StyledRow = Segment[]
type Style = Omit<Segment, 'text'>
type Line = { kind: 'text' | 'quote' | 'code'; spans: Segment[] }

const FENCE = '```'
const QUOTE_LINE = /^> /
const QUOTE_MARK = '│ '

// Slack opens a marker at a line's start, after a space or an opening mark, and closes it before the
// line's end, a space or a punctuation mark, never with a space just inside: `5 * 3 * 2` and
// `snake_case_name` stay as written.
const OPEN = `(?<=^|[\\s(\\[{"'“‘])`
const CLOSE = `(?=$|[\\s)\\]}.,!?:;"'”’])`
const marker = (mark: string) => new RegExp(`${OPEN}\\${mark}(?=\\S)([^\\${mark}\\n]*?\\S)\\${mark}${CLOSE}`)
const INLINE: { pattern: RegExp; style: Style; isCode?: true }[] = [
  { pattern: /`([^`\n]+)`/, style: { code: true }, isCode: true },
  { pattern: marker('*'), style: { bold: true } },
  { pattern: marker('_'), style: { italic: true } },
  { pattern: marker('~'), style: { strike: true } },
]

function parseInline(text: string, style: Style): Segment[] {
  const segments: Segment[] = []
  let rest = text
  while (rest !== '') {
    let first: { index: number; length: number; inner: string; rule: (typeof INLINE)[number] } | undefined
    for (const rule of INLINE) {
      const match = rule.pattern.exec(rest)
      if (match && (first === undefined || match.index < first.index)) {
        first = { index: match.index, length: match[0].length, inner: match[1]!, rule }
      }
    }
    if (!first) {
      segments.push({ text: rest, ...style })
      break
    }
    if (first.index > 0) segments.push({ text: rest.slice(0, first.index), ...style })
    // A code span's text is taken as written; other markers may hold one another.
    if (first.rule.isCode) segments.push({ text: first.inner, ...style, ...first.rule.style })
    else segments.push(...parseInline(first.inner, { ...style, ...first.rule.style }))
    rest = rest.slice(first.index + first.length)
  }
  return segments
}

function parseLines(text: string): Line[] {
  const lines: Line[] = []
  const code = (body: string) => lines.push({ kind: 'code', spans: body === '' ? [] : [{ text: body, dim: true }] })
  let isInCode = false
  for (const line of text.split('\n')) {
    if (isInCode) {
      if (line.endsWith(FENCE)) {
        isInCode = false
        if (line !== FENCE) code(line.slice(0, -FENCE.length))
      } else code(line)
    } else if (line.startsWith(FENCE)) {
      const body = line.slice(FENCE.length)
      if (body.length >= FENCE.length && body.endsWith(FENCE)) code(body.slice(0, -FENCE.length))
      else {
        isInCode = true
        if (body !== '') code(body)
      }
    } else if (QUOTE_LINE.test(line)) {
      lines.push({ kind: 'quote', spans: parseInline(line.replace(QUOTE_LINE, ''), { dim: true }) })
    } else {
      lines.push({ kind: 'text', spans: parseInline(line, {}) })
    }
  }
  return lines
}

const joined = (spans: Segment[]) => spans.map(s => s.text).join('')

// The pieces of `spans` that fall in [from, to) of their joined text.
function slice(spans: Segment[], from: number, to: number): Segment[] {
  const out: Segment[] = []
  let at = 0
  for (const span of spans) {
    const end = at + span.text.length
    const text = span.text.slice(Math.max(0, from - at), Math.max(0, to - at))
    if (text !== '' && end > from && at < to) out.push({ ...span, text })
    at = end
  }
  return out
}

// The text in rows of at most `width` cells, wrapped as `wrapText` wraps the same text without markers.
export function styledRows(text: string, width: number): StyledRow[] {
  return parseLines(text).flatMap(line => {
    const mark: Segment[] = line.kind === 'quote' ? [{ text: QUOTE_MARK, dim: true }] : []
    const plain = joined(line.spans)
    let cursor = 0
    return wrapText(plain, Math.max(1, width - displayWidth(QUOTE_MARK) * mark.length)).map(row => {
      // A row is the text from where the last ended, the spaces a break dropped skipped.
      const found = row === '' ? -1 : plain.indexOf(row, cursor)
      const start = found === -1 ? cursor : found
      cursor = start + row.length
      return [...mark, ...slice(line.spans, start, cursor)]
    })
  })
}

// The text as it reads without markers, for a one-line preview.
export function plainText(text: string): string {
  return parseLines(text)
    .map(line => joined(line.spans))
    .join('\n')
}
