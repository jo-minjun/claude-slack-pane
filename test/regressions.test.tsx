import { expect, test } from 'claude-code/testing'

import { displayWidth, fitWidth, plainEmoji, wrapText } from '../src/format'
import { createMcpClient } from '../src/slack/mcp-client'
import { CHANNEL } from './fixtures/channel'
import { PROFILE } from './fixtures/profile'
import { engine, ok, run, start, type McpAnswer } from './harness'

const SAVED_NOTICE = (path: string) =>
  `Error: result (54,000 characters across 1 line) exceeds maximum allowed tokens. Output has been saved to ${path}.\nFormat: Plain text\n- For targeted searches (find a string): use grep on the file directly.`

test('a result saved to a file is read from that file', async () => {
  const reads: string[] = []
  const client = createMcpClient(
    async () => ({ content: [{ type: 'text', text: SAVED_NOTICE('/tmp/results/read-1.txt') }], isError: false }),
    async path => {
      reads.push(path)
      return JSON.stringify({ messages: CHANNEL, pagination_info: '' })
    },
  )
  const page = await client.readChannel('C1', { limit: 30 })
  expect(reads).toEqual(['/tmp/results/read-1.txt'])
  expect(page.items.length).toBe(2)
})

test('a saved file holding content blocks is unwrapped too', async () => {
  const client = createMcpClient(
    async () => ({ content: [{ type: 'text', text: SAVED_NOTICE('/tmp/r.json') }], isError: false }),
    async () => JSON.stringify([{ type: 'text', text: JSON.stringify({ messages: CHANNEL, pagination_info: '' }) }]),
  )
  expect((await client.readChannel('C1', { limit: 30 })).items.length).toBe(2)
})

test('display width counts wide characters as two cells', () => {
  expect(displayWidth('#abc')).toBe(4)
  expect(displayWidth('#추천')).toBe(5)
  expect(fitWidth('#ask-anything-finance', 10)).toBe('#ask-anyt…')
  expect(displayWidth(fitWidth('#정보-뉴스-시장동향', 10))).toBeLessThanOrEqual(10)
  expect(fitWidth('#short', 10)).toBe('#short')
})

// Counting characters instead of cells, or ignoring word wrap, drew more messages than fit and cut the newest off.
test('message rows count wide characters and wrap at spaces', () => {
  expect(wrapText('가나다라마바사아자차', 10)).toEqual(['가나다라마', '바사아자차'])
  expect(wrapText('aaa bbbbb ccccc', 8)).toEqual(['aaa', 'bbbbb', 'ccccc'])
  expect(wrapText('abcdefghijklmnopqrst', 8)).toEqual(['abcdefgh', 'ijklmnop', 'qrst'])
  expect(wrapText('one\n\ntwo', 40)).toEqual(['one', '', 'two'])
  expect(wrapText('    ◦ 들여쓴 줄', 40)).toEqual(['    ◦ 들여쓴 줄'])
})

const LONG_LIST = `## My Channels (showing 2)

### #ask-anything-finance-and-accounting
- **ID:** C0FAKE0010
- **Type:** Public Channel

### #정보-뉴스-시장동향-정리
- **ID:** C0FAKE0011
- **Type:** Public Channel
`

const slack: McpAnswer = tool => {
  if (tool === 'slack_list_user_channels') return ok({ result: LONG_LIST })
  if (tool === 'slack_read_user_profile') return ok({ result: PROFILE })
  return ok({ messages: CHANNEL, pagination_info: '' })
}

test('channel buttons fit the left column including brackets', async ($, on) => {
  engine(on, slack)
  await start($)
  await run($, 'slack-pane')
  const ui = await $.ui.mount({
    plugin: 'slack-pane',
    component: 'Pane',
    requestId: 'slack',
    surface: 'terminal',
    props: { title: 'Slack', isFocused: true, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} },
  })
  for (const key of ['ch:C0FAKE0010', 'ch:C0FAKE0011']) {
    const label = (await ui.find({ key }))?.text ?? ''
    expect(displayWidth(label) + 4).toBeLessThanOrEqual(27 - 1)
  }
  await ui.unmount()
})

test('channel reads ask for 20 messages', async ($, on) => {
  const { sent } = engine(on, slack)
  await start($)
  await run($, 'slack-pane', 'C0FAKE0010')
  expect(sent.find(s => s.tool === 'slack_read_channel')?.args.limit).toBe(20)
})

test('pane command reports a Slack failure instead of throwing', async ($, on) => {
  engine(on, () => {
    throw new Error('no connected MCP tool')
  })
  await start($)
  expect(await run($, 'slack-pane', '#general')).toBe('Slack MCP not connected')
  expect(await run($, 'slack-pane-search', 'deploy')).toBe('Searching: deploy')
})

// A fused emoji is two cells to the layout but wider in some terminals, which shifted the rows below it.
test('emoji are drawn one glyph at a time and wide symbols count two cells', () => {
  expect(plainEmoji('🧑\u200D🎄\u{1F3FC} 이번 주 ✔\uFE0F')).toBe('🧑🎄 이번 주 ✔')
  expect(displayWidth('✅❌⭐⚡⬜')).toBe(10)
  expect(displayWidth('🧑🎄')).toBe(4)
})
