import { expect, test } from 'claude-code/testing'

import { plainText, styledRows } from '../src/mrkdwn'

test('markers turn into styles and leave the text', () => {
  expect(styledRows('a *bold* _it_ ~gone~ `co*de*` z', 80)).toEqual([
    [
      { text: 'a ' },
      { text: 'bold', bold: true },
      { text: ' ' },
      { text: 'it', italic: true },
      { text: ' ' },
      { text: 'gone', strike: true },
      { text: ' ' },
      { text: 'co*de*', code: true },
      { text: ' z' },
    ],
  ])
  expect(styledRows('*다음을 사용하여 보냄* Claude', 80)).toEqual([[{ text: '다음을 사용하여 보냄', bold: true }, { text: ' Claude' }]])
})

test('markers hold one another', () => {
  expect(styledRows('*bold _both_*', 80)).toEqual([[{ text: 'bold ', bold: true }, { text: 'both', bold: true, italic: true }]])
})

test('a marker Slack would not read stays as written', () => {
  for (const text of ['5 * 3 * 2', 'snake_case_name', 'a*b*c', '* not bold *', 'price: ~$5 ~ $7']) {
    expect(styledRows(text, 80)).toEqual([[{ text }]])
  }
})

test('a quote line is marked and dim, a code block dim and taken as written', () => {
  expect(styledRows('> said *so*', 80)).toEqual([
    [{ text: '│ ', dim: true }, { text: 'said ', dim: true }, { text: 'so', dim: true, bold: true }],
  ])
  expect(styledRows('```\nconst a = *b*\n```\nafter', 80)).toEqual([[{ text: 'const a = *b*', dim: true }], [{ text: 'after' }]])
  expect(styledRows('```one line```', 80)).toEqual([[{ text: 'one line', dim: true }]])
})

test('a style runs on across the rows a wrap makes', () => {
  expect(styledRows('*aaaa bbbb* cc', 5)).toEqual([[{ text: 'aaaa', bold: true }], [{ text: 'bbbb', bold: true }], [{ text: 'cc' }]])
  expect(styledRows('', 5)).toEqual([[]])
})

test('plainText reads without markers', () => {
  expect(plainText('*Deploy* done: `v1.2` _today_\n> ok')).toBe('Deploy done: v1.2 today\nok')
})
