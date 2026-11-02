import { expect, test } from 'claude-code/testing'

import { CHANNEL } from './fixtures/channel'
import { CHANNEL_LIST } from './fixtures/channel-list'
import { mcpError } from './fixtures/mcp'
import { PROFILE } from './fixtures/profile'
import { SEARCH } from './fixtures/search'
import { THREAD } from './fixtures/thread'
import { count, engine, ok, run, start, type McpAnswer } from './harness'

const slack: McpAnswer = tool => {
  if (tool === 'slack_list_user_channels') return ok({ result: CHANNEL_LIST })
  if (tool === 'slack_read_user_profile') return ok({ result: PROFILE })
  if (tool === 'slack_read_channel') return ok({ messages: CHANNEL, pagination_info: '' })
  if (tool === 'slack_read_thread') return ok({ messages: THREAD, pagination_info: '' })
  if (tool === 'slack_search_public_and_private') return ok({ results: SEARCH, pagination_info: '' })
  return ok({ result: 'ok' })
}

const pane = (bodyColumns = 90, bodyRows = 40) =>
  ({
    plugin: 'slack-pane',
    component: 'Pane',
    requestId: 'slack',
    props: {
      title: 'Slack',
      isFocused: true,
      bodyColumns,
      placement: 'dock',
      scroll: { offset: 0, bodyRows },
      view: {},
    },
  }) as const

const SURFACES = ['terminal', 'desktop'] as const

test('lists channels', async ($, on) => {
  engine(on, slack)
  await start($)
  await run($, 'slack-pane')
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...pane(), surface })
    expect((await ui.find({ key: 'ch:C0FAKE0001' }))?.text).toContain('#general')
    expect((await ui.find({ key: 'ch:D0FAKE0001' }))?.text).toContain('@Bob')
    await ui.unmount()
  }
})

test('channel click opens latest view', async ($, on) => {
  const { sent } = engine(on, slack)
  await start($)
  await run($, 'slack-pane')
  const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
  await ui.press({ key: 'ch:C0FAKE0001' })
  expect(count(sent, 'slack_read_channel')).toBe(1)
  expect(await ui.find({ type: 'Text', text: /^#general$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Release status/ })).toBeDefined()
  expect((await ui.find({ key: 'msg:1793325746.615629' }))?.text).toContain('9 replies')
  await ui.unmount()
})

test('search shows hits and clear returns', async ($, on) => {
  engine(on, slack)
  await start($)
  await run($, 'slack-pane')
  const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
  await ui.input({ key: 'search', text: 'deploy' })
  const hitText = (await ui.find({ key: 'hit:C0FAKE0002:1793339391.207789' }))!.text!
  // What lights under the pointer holds nothing but what a press opens: no blank row after it.
  expect((await ui.find({ key: 'hit-row:C0FAKE0002:1793339391.207789' }))?.text).toBe(hitText)
  const [head, line] = hitText.split('\n')
  expect(head).toMatch(/^#backend +14:49$/)
  expect(line).toMatch(/^Alice Kim: Reply in a/)
  expect(head!.length).toBe(line!.length)
  expect(await ui.find({ key: 'ch:C0FAKE0001' })).toBeUndefined()
  await ui.press({ key: 'clear' })
  expect(await ui.find({ key: 'ch:C0FAKE0001' })).toBeDefined()
  await ui.unmount()
})

test('from me is a filter toggle kept with the typed query', async ($, on) => {
  const { sent } = engine(on, slack)
  await start($)
  await run($, 'slack-pane')
  const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
  const searches = () => sent.filter(s => s.tool === 'slack_search_public_and_private').map(s => s.args)
  await ui.press({ key: 'from-me' })
  expect((await ui.find({ key: 'from-me' }))?.text).toBe('☑ From me')
  expect(searches()[0]?.filters).toBe('from:<@U0FAKE0001>')
  await ui.input({ key: 'search', text: 'deploy in:#backend' })
  expect(searches()[1]).toMatchObject({ keywords: ['deploy'], filters: 'in:#backend from:<@U0FAKE0001>' })
  await ui.press({ key: 'from-me' })
  expect((await ui.find({ key: 'from-me' }))?.text).toBe('☐ From me')
  expect(searches()[2]).toMatchObject({ keywords: ['deploy'], filters: 'in:#backend' })
  await ui.press({ key: 'clear' })
  await ui.press({ key: 'from-me' })
  await ui.input({ key: 'search', text: '' })
  await ui.press({ key: 'from-me' })
  expect(searches()).toHaveLength(5)
  expect(await ui.find({ key: 'ch:C0FAKE0001' })).toBeDefined()
  await ui.unmount()
})

test('hit opens thread view and back goes to message position', async ($, on) => {
  const { sent } = engine(on, slack)
  await start($)
  await run($, 'slack-pane')
  const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
  await ui.input({ key: 'search', text: 'deploy' })
  await ui.press({ key: 'hit:C0FAKE0002:1793339391.207789' })
  const thread = sent.find(s => s.tool === 'slack_read_thread')
  expect(thread?.args).toEqual({ channel_id: 'C0FAKE0002', message_ts: '1793089818.196009', response_format: 'detailed' })
  expect((await ui.find({ key: 'back' }))?.text).toBe('← #backend')
  await ui.press({ key: 'back' })
  const around = sent.filter(s => s.tool === 'slack_read_channel').map(s => s.args)
  expect(around[0]).toEqual({ channel_id: 'C0FAKE0002', latest: '1793089818.196010', limit: 26, response_format: 'detailed' })
  expect(around[1]).toEqual({ channel_id: 'C0FAKE0002', oldest: '1793089818.196009', limit: 25, response_format: 'detailed' })
  expect((await ui.find({ key: 'latest' }))?.text).toMatch(/^▼ Latest/)
  expect(await ui.find({ type: 'Text', text: /⏸ paused/ })).toBeDefined()
  await ui.press({ key: 'latest' })
  expect(await ui.find({ key: 'latest' })).toBeUndefined()
  await ui.unmount()
})

test('refresh status texts', async ($, on) => {
  let fail = false
  const { clock } = engine(on, (tool, args) =>
    fail && tool === 'slack_read_channel' ? mcpError('ratelimited') : slack(tool, args),
  )
  await start($)
  await run($, 'slack-pane', '#general')
  const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /^↻ 10s · \d\d:\d\d:\d\d$/ })).toBeDefined()
  fail = true
  await clock.advance(10_000)
  expect(await ui.find({ type: 'Text', text: /^⚠ failed \d\d:\d\d:\d\d$/ })).toBeDefined()
  await ui.unmount()
})

test('the open channel is drawn in the accent color', async ($, on) => {
  engine(on, slack)
  await start($)
  await run($, 'slack-pane', '#general')
  const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
  expect((await ui.find({ key: 'ch:C0FAKE0001' }))?.props.variant).toBe('primary')
  expect((await ui.find({ key: 'ch:C0FAKE0002' }))?.props.variant).toBeUndefined()
  await ui.unmount()
})

test('search names a DM by whom it is with, as the channel list does', async ($, on) => {
  const DM_HIT = `# Search Results for: dm

## Messages (1 results)
### Result 1 of 1
Channel: DM (ID: D0FAKE0001)
Participants: Alice Kim (ID: U0FAKE0001), Bob (ID: U0FAKE0002)
From: Bob <bob@example.com> (ID: U0FAKE0002) 
Time: 2026-10-30 14:49:51 KST
Message_ts: 1793339391.207789
Permalink: [link](https://acme.slack.com/archives/D0FAKE0001/p1793339391207789)
Text: 
Can you review this?

---
`
  engine(on, (tool, args) => (tool === 'slack_search_public_and_private' ? ok({ results: DM_HIT, pagination_info: '' }) : slack(tool, args)))
  await start($)
  await run($, 'slack-pane')
  const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
  await ui.input({ key: 'search', text: 'review' })
  expect((await ui.find({ key: 'hit:D0FAKE0001:1793339391.207789' }))?.text).toMatch(/^@Bob /)
  await ui.unmount()
})

test('a selected message keeps its whole name: links go to the action bar where the header is too narrow', async ($, on) => {
  engine(on, slack)
  await start($)
  await run($, 'slack-pane', '#general')
  const BOT_TS = '1793337289.953239'
  const wide = await $.ui.mount({ ...pane(120), surface: 'terminal' })
  await wide.press({ key: `msg:${BOT_TS}` })
  expect(await wide.find({ key: 'copy-link' })).toBeDefined()
  expect(await wide.find({ key: 'bar-links' })).toBeUndefined()
  await wide.unmount()
  const narrow = await $.ui.mount({ ...pane(60), surface: 'terminal' })
  expect((await narrow.find({ key: `msg:${BOT_TS}` }))?.text).toMatch(/^> Bot One /)
  expect(await narrow.find({ key: 'bar-links' })).toBeDefined()
  expect(await narrow.find({ key: 'copy-link' })).toBeDefined()
  await narrow.unmount()
})

test('a message is drawn without Slack markers, its marked words styled', async ($, on) => {
  const MARKED = `Channel: #general (C0FAKE0001)

=== Message from Alice Kim (U0FAKE0001) at 2026-10-30 11:02:26 KST === 
Message TS: 1793300000.000100
*Deploy* done: \`v1.2\` _today_`
  engine(on, (tool, args) => (tool === 'slack_read_channel' ? ok({ messages: MARKED, pagination_info: '' }) : slack(tool, args)))
  await start($)
  await run($, 'slack-pane', '#general')
  const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
  const row = (await ui.find({ key: 'msg:1793300000.000100' }))!.text!.split('\n')[1]!
  expect(row.trimEnd()).toBe('Deploy done: v1.2 today')
  const texts = await ui.findAll({ type: 'Text' })
  expect(texts.some(t => t.text === 'Deploy' && t.props.bold === true)).toBe(true)
  // Under the pointer the engine inverts a Text's first line only: a piece led by a break would stay plain.
  expect(texts.filter(t => t.text !== '\n' && String(t.text).startsWith('\n'))).toEqual([])
  await ui.unmount()
})

test('left column width', async ($, on) => {
  engine(on, slack)
  await start($)
  await run($, 'slack-pane')
  const wide = await $.ui.mount({ ...pane(120), surface: 'terminal' })
  expect((await wide.find({ key: 'left' }))?.props.width).toBe(36)
  await wide.unmount()
  // Never so narrow that the search frame's `[ ☐ From me ] [ × Clear ]` spills over the right column.
  const narrow = await $.ui.mount({ ...pane(60), surface: 'terminal' })
  expect((await narrow.find({ key: 'left' }))?.props.width).toBe(29)
  await narrow.unmount()
})

test('more-down loads next channel page', async ($, on) => {
  const { sent } = engine(on, slack)
  await start($)
  await run($, 'slack-pane')
  const ui = await $.ui.mount({ ...pane(90, 10), surface: 'terminal' })
  for (let i = 0; i < 4 && (await ui.find({ key: 'more-down' })); i += 1) {
    await ui.press({ key: 'more-down' })
  }
  const lists = sent.filter(s => s.tool === 'slack_list_user_channels')
  expect(lists[1]?.args.cursor).toBe('Y3Vyc29yLTE=')
  await ui.unmount()
})

test('banner shows not connected', async ($, on) => {
  engine(on, () => {
    throw new Error('not connected')
  })
  await start($)
  await run($, 'slack-pane')
  const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Slack MCP not connected/ })).toBeDefined()
  // A long reason stays on one row, cut to its column, so the rows below keep their place.
  const listError = (await ui.find({ type: 'Text', text: /^⚠ Slack MCP not connected/ }))!.text!
  const leftWidth = (await ui.find({ key: 'left' }))!.props.width as number
  expect(listError.includes('\n')).toBe(false)
  expect(listError.length).toBeLessThanOrEqual(leftWidth - 2)
  expect(listError.endsWith('…')).toBe(true)
  await ui.unmount()
})

test('channels and direct messages are listed in their own sections, each by name', async ($, on) => {
  const MIXED = `## My Channels (showing 4)

### DM with Bob
- **ID:** D0FAKE0001
- **Type:** Direct Message
- **Archived:** No

### #general
- **ID:** C0FAKE0001
- **Type:** Public Channel
- **Archived:** No

### Bob, Carol
- **ID:** G0FAKE0001
- **Type:** Group DM
- **Archived:** No

### #backend
- **ID:** C0FAKE0002
- **Type:** Private Channel
- **Archived:** No
`
  engine(on, (tool, args) => (tool === 'slack_list_user_channels' ? ok({ result: MIXED }) : slack(tool, args)))
  await start($)
  await run($, 'slack-pane')
  const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
  const HEADINGS = ['CHANNELS', 'DIRECT MESSAGES']
  const rows = (await ui.findAll({}))
    .map(e => (e.type === 'Text' && [...HEADINGS, ' '].includes(e.text) ? e.text : e.key))
    .filter(k => k !== undefined && ([...HEADINGS, ' '].includes(k) || k.startsWith('ch:')))
  expect(rows).toEqual(['CHANNELS', 'ch:C0FAKE0002', 'ch:C0FAKE0001', ' ', 'DIRECT MESSAGES', 'ch:D0FAKE0001', 'ch:G0FAKE0001'])
  expect((await ui.find({ key: 'ch:G0FAKE0001' }))?.text).toBe('@Bob, Carol')
  await ui.unmount()
})
