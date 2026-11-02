import { expect, test } from 'claude-code/testing'

import { CHANNEL } from './fixtures/channel'
import { CHANNEL_LIST } from './fixtures/channel-list'
import { mcpError } from './fixtures/mcp'
import { PROFILE } from './fixtures/profile'
import { SEARCH, SEARCH_EMPTY } from './fixtures/search'
import { THREAD } from './fixtures/thread'
import { count, engine, ok, run, start, type McpAnswer } from './harness'

const slack: McpAnswer = tool => {
  if (tool === 'slack_list_user_channels') return ok({ result: CHANNEL_LIST })
  if (tool === 'slack_read_user_profile') return ok({ result: PROFILE })
  if (tool === 'slack_read_channel') return ok({ messages: CHANNEL, pagination_info: '' })
  if (tool === 'slack_read_thread') return ok({ messages: THREAD, pagination_info: '' })
  if (tool === 'slack_search_public_and_private') return ok({ results: SEARCH, pagination_info: '' })
  return ok({ result: 'sent' })
}

const PANE = {
  plugin: 'slack-pane',
  component: 'Pane',
  requestId: 'slack',
  surface: 'terminal',
  props: {
    title: 'Slack',
    isFocused: true,
    bodyColumns: 120,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 60 },
    view: {},
  },
} as const

const BOT = 'msg:1793337289.953239'
const PARENT = 'msg:1793325746.615629'
const REPLY = 'msg:1793334367.423609'

test('action bar appears on selection', async ($, on) => {
  engine(on, slack)
  await start($)
  await run($, 'slack-pane', '#general')
  const ui = await $.ui.mount(PANE)
  expect(await ui.find({ key: 'quote-message' })).toBeUndefined()
  await ui.press({ key: BOT })
  for (const key of ['quote-message', 'quote-thread', 'open-thread', 'copy-link']) {
    expect(await ui.find({ key })).toBeDefined()
  }
  await ui.press({ key: PARENT })
  await ui.press({ key: 'open-thread' })
  await ui.press({ key: REPLY })
  expect(await ui.find({ key: 'quote-message' })).toBeDefined()
  expect(await ui.find({ key: 'open-thread' })).toBeUndefined()
  await ui.unmount()
})

test('quote message fills prompt', async ($, on) => {
  const { filled } = engine(on, slack)
  await start($)
  await run($, 'slack-pane', '#general')
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: BOT })
  await ui.press({ key: 'quote-message' })
  expect(filled.length).toBe(1)
  expect(filled[0]?.mode).toBe('insert')
  expect(filled[0]?.text).toMatch(/^\[slack:message #general [\d/: ]+ @Bot One\]\(C0FAKE0001\/1793337289\.953239\) $/)
  await ui.unmount()
})

test('quote thread on reply keeps parent', async ($, on) => {
  const { filled } = engine(on, slack)
  await start($)
  await run($, 'slack-pane', '#general')
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: PARENT })
  await ui.press({ key: 'open-thread' })
  await ui.press({ key: REPLY })
  await ui.press({ key: 'quote-thread' })
  expect(filled[0]?.text).toMatch(/^\[slack:thread #general .+ @Bob Lee\]\(C0FAKE0001\/1793325746\.615629\/1793334367\.423609\) $/)
  await ui.unmount()
})

test('copy link copies and toasts', async ($, on) => {
  const { copied, toasts } = engine(on, slack, { workspaceDomain: 'acme.slack.com' })
  await start($)
  await run($, 'slack-pane', '#general')
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: BOT })
  await ui.press({ key: 'copy-link' })
  expect(copied).toEqual(['https://acme.slack.com/archives/C0FAKE0001/p1793337289953239'])
  expect(toasts).toEqual(['Link copied'])
  await ui.unmount()
})

test('copy link finds the domain by search', async ($, on) => {
  const { copied, sent } = engine(on, slack)
  await start($)
  await run($, 'slack-pane', '#general')
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: PARENT })
  await ui.press({ key: 'open-thread' })
  await ui.press({ key: REPLY })
  await ui.press({ key: 'copy-link' })
  expect(count(sent, 'slack_search_public_and_private')).toBe(1)
  expect(copied).toEqual([
    'https://acme.slack.com/archives/C0FAKE0001/p1793334367423609?thread_ts=1793325746.615629&cid=C0FAKE0001',
  ])
  await ui.unmount()
})

test('copy link without a domain says so', async ($, on) => {
  const { copied, toasts } = engine(on, (tool, args) =>
    tool === 'slack_search_public_and_private' ? ok({ results: SEARCH_EMPTY, pagination_info: '' }) : slack(tool, args),
  )
  await start($)
  await run($, 'slack-pane', '#general')
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: BOT })
  await ui.press({ key: 'copy-link' })
  expect(copied).toEqual([])
  expect(toasts).toEqual(['Workspace domain unknown'])
  await ui.unmount()
})

test('composer shows destination', async ($, on) => {
  engine(on, slack)
  await start($)
  await run($, 'slack-pane', '#general')
  const placeholder = async () => (await ui.find({ key: 'composer' }))?.props.placeholder
  let ui = await $.ui.mount(PANE)
  expect(await placeholder()).toBe('Message #general')
  await ui.press({ key: PARENT })
  await ui.press({ key: 'open-thread' })
  expect(await placeholder()).toBe('Reply in thread · #general')
  await ui.unmount()
  await run($, 'slack-pane', '@Bob')
  ui = await $.ui.mount(PANE)
  expect(await placeholder()).toBe('Message @Bob')
  await ui.unmount()
})

test('enter sends to open view and refreshes', async ($, on) => {
  const { sent } = engine(on, slack)
  await start($)
  await run($, 'slack-pane', '#general')
  const ui = await $.ui.mount(PANE)
  await ui.input({ key: 'composer', text: 'hi' })
  expect(sent.filter(s => s.tool === 'slack_send_message').map(s => s.args)).toEqual([
    { channel_id: 'C0FAKE0001', message: 'hi' },
  ])
  expect(count(sent, 'slack_read_channel')).toBe(2)
  await ui.press({ key: PARENT })
  await ui.press({ key: 'open-thread' })
  await ui.input({ key: 'composer', text: 'reply' })
  expect(sent.filter(s => s.tool === 'slack_send_message')[1]?.args).toEqual({
    channel_id: 'C0FAKE0001',
    message: 'reply',
    thread_ts: '1793325746.615629',
  })
  await ui.unmount()
})

test('send failure keeps text', async ($, on) => {
  engine(on, (tool, args) => (tool === 'slack_send_message' ? mcpError('not_in_channel') : slack(tool, args)))
  await start($)
  await run($, 'slack-pane', '#general')
  const ui = await $.ui.mount(PANE)
  await ui.input({ key: 'composer', text: 'hi' })
  expect(await ui.find({ type: 'Text', text: /⚠ Send failed/ })).toBeDefined()
  expect((await ui.find({ key: 'composer' }))?.props.value).toBe('hi')
  await ui.unmount()
})

test('no double send', async ($, on) => {
  const { sent, clock } = engine(on, async (tool, args) => {
    if (tool === 'slack_send_message') await clock.sleep(5_000)
    return slack(tool, args)
  })
  await start($)
  await run($, 'slack-pane', '#general')
  const ui = await $.ui.mount(PANE)
  void ui.input({ key: 'composer', text: 'hi' })
  await clock.settle()
  void ui.input({ key: 'composer', text: 'hi' })
  await clock.advance(6_000)
  expect(count(sent, 'slack_send_message')).toBe(1)
  await ui.unmount()
})

test('back from channel thread returns to latest', async ($, on) => {
  const { sent } = engine(on, slack)
  await start($)
  await run($, 'slack-pane', '#general')
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: PARENT })
  await ui.press({ key: 'open-thread' })
  await ui.press({ key: 'back' })
  const reads = sent.filter(s => s.tool === 'slack_read_channel').map(s => s.args)
  expect(reads[reads.length - 1]).toEqual({ channel_id: 'C0FAKE0001', limit: 20, response_format: 'detailed' })
  expect(await ui.find({ key: 'latest' })).toBeUndefined()
  await ui.unmount()
})

test('prompt.submit attaches quote context', async ($, on) => {
  const { toasts } = engine(on, slack)
  const seen: (readonly string[] | undefined)[] = []
  on('prompt.submit', (_, e) => {
    seen.push(e.context)
    return { text: e.text }
  })
  await start($)
  await run($, 'slack-pane')
  await $.prompt.submit({ text: 'see [slack:thread #general 10/30 14:14 @Bob](C0FAKE0001/1793325746.615629)' } as never)
  expect(seen[0]?.[0]?.startsWith('<slack-quote kind="thread" channel="#general" source="untrusted">')).toBe(true)
  expect(seen[0]?.[0]).toContain('Bob Lee: First reply')
  await $.prompt.submit({ text: 'bad [slack:message #general 1 @x](C0FAKE0001/9.9)' } as never)
  expect(seen[1]).toEqual(['Slack quote unavailable: #general 9.9'])
  expect(toasts).toEqual(['Quote fetch failed'])
})
