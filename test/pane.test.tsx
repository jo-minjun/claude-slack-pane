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
  expect((await ui.find({ key: 'hit:C0FAKE0002:1793339391.207789' }))?.text).toContain('Reply in a thread')
  expect(await ui.find({ key: 'ch:C0FAKE0001' })).toBeUndefined()
  await ui.press({ key: 'clear' })
  expect(await ui.find({ key: 'ch:C0FAKE0001' })).toBeDefined()
  await ui.unmount()
})

test('from me searches with my id', async ($, on) => {
  const { sent } = engine(on, slack)
  await start($)
  await run($, 'slack-pane')
  const ui = await $.ui.mount({ ...pane(), surface: 'terminal' })
  await ui.press({ key: 'from-me' })
  const search = sent.find(s => s.tool === 'slack_search_public_and_private')
  expect(search?.args.filters).toBe('from:<@U0FAKE0001>')
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
  expect((await ui.find({ key: 'latest' }))?.text).toBe('Jump to latest')
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

test('left column width', async ($, on) => {
  engine(on, slack)
  await start($)
  await run($, 'slack-pane')
  const wide = await $.ui.mount({ ...pane(90), surface: 'terminal' })
  expect((await wide.find({ key: 'left' }))?.props.width).toBe(27)
  await wide.unmount()
  const narrow = await $.ui.mount({ ...pane(60), surface: 'terminal' })
  expect((await narrow.find({ key: 'left' }))?.props.width).toBe(22)
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
  await ui.unmount()
})
