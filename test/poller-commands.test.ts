import { describe, expect, test } from 'claude-code/testing'

import { parseInterval, parseTarget, splitQuery } from '../src/commands'
import { CHANNEL, CHANNEL_EMPTY } from './fixtures/channel'
import { CHANNEL_LIST } from './fixtures/channel-list'
import { CHANNEL_SEARCH } from './fixtures/channel-search'
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
  if (tool === 'slack_search_channels') return ok({ results: CHANNEL_SEARCH, pagination_info: '' })
  return ok({ result: 'ok' })
}

describe('argument parsing', () => {
  test('parseTarget', () => {
    expect(parseTarget('#backend')).toEqual({ kind: 'name', name: 'backend', isDm: false })
    expect(parseTarget('@Bob')).toEqual({ kind: 'name', name: 'Bob', isDm: true })
    expect(parseTarget('C0123ABCD')).toEqual({ kind: 'id', id: 'C0123ABCD' })
    expect(parseTarget('  ')).toBeUndefined()
    expect(parseTarget('https://acme.slack.com/archives/C0123ABCD/p1793590460032119')).toEqual({
      kind: 'link',
      channelId: 'C0123ABCD',
      ts: '1793590460.032119',
    })
    expect(parseTarget('https://acme.slack.com/archives/C062VH82275/p1793088676072399?thread_ts=1792730962.696089&cid=C062VH82275')).toEqual({
      kind: 'link',
      channelId: 'C062VH82275',
      ts: '1793088676.072399',
      threadTs: '1792730962.696089',
    })
    expect(parseTarget('https://acme.slack.com/archives/C0123ABCD')).toEqual({ kind: 'name', name: 'https://acme.slack.com/archives/C0123ABCD', isDm: false })
  })

  test('splitQuery', () => {
    expect(splitQuery('deploy "roll back" from:<@U1> in:<#C1>')).toEqual({
      keywords: ['deploy', '"roll back"'],
      filters: 'from:<@U1> in:<#C1>',
    })
  })

  test('parseInterval', () => {
    expect(parseInterval('30')).toBe(30)
    expect(parseInterval('5')).toBe(5)
    expect(parseInterval('300')).toBe(300)
    for (const bad of ['4', '301', '1.5', 'x', '']) expect(parseInterval(bad)).toBeUndefined()
  })
})

test('commands are registered immediate', async ($, on) => {
  const { registered } = engine(on, slack)
  await start($)
  expect(registered.map(r => [r.name, r.immediate, r.argumentHint])).toEqual([
    ['slack-pane', true, '[#channel | @user | channel ID | message link]'],
    ['slack-pane-refresh', true, '[seconds]'],
    ['slack-pane-search', true, '<query>'],
  ])
})

test('pane command opens a message link at its place, a reply in its thread', async ($, on) => {
  const { states } = engine(on, slack)
  await start($)
  expect(await run($, 'slack-pane', 'https://acme.slack.com/archives/C0FAKE0001/p1793325746615629')).toBe('Opened #general at 1793325746.615629')
  expect(states.view).toEqual({ kind: 'channel', channelId: 'C0FAKE0001', label: '#general', anchorTs: '1793325746.615629' })
  expect(states.messageTop).toEqual({ ts: '1793325746.615629', skip: 0 })
  await run($, 'slack-pane', 'https://acme.slack.com/archives/C0FAKE0001/p1793334367423609?thread_ts=1793325746.615629&cid=C0FAKE0001')
  expect(states.view).toEqual({
    kind: 'thread',
    channelId: 'C0FAKE0001',
    label: '#general',
    threadTs: '1793325746.615629',
    back: { anchorTs: '1793325746.615629' },
  })
  expect(states.messageTop).toEqual({ ts: '1793334367.423609', skip: 0 })
})

test('pane command toggles and opens a channel', async ($, on) => {
  const { sent } = engine(on, slack)
  await start($)
  expect(await run($, 'slack-pane')).toBe('Slack pane opened')
  expect(count(sent, 'slack_list_user_channels')).toBe(1)
  expect(count(sent, 'slack_read_user_profile')).toBe(1)
  expect(await run($, 'slack-pane')).toBe('Slack pane closed')
  expect(await run($, 'slack-pane', '#general')).toBe('Opened #general')
  expect(await run($, 'slack-pane', '@Bob')).toBe('Opened @Bob')
  expect(await run($, 'slack-pane', '#team-backend')).toBe('Opened #team-backend')
  expect(await run($, 'slack-pane', '#nope')).toBe('Channel not found: #nope')
})

test('refresh command outputs', async ($, on) => {
  const { clock } = engine(on, slack)
  await start($)
  expect(await run($, 'slack-pane-refresh')).toBe('Refresh interval: 10s')
  expect(await run($, 'slack-pane-refresh', '4')).toBe('Interval must be an integer from 5 to 300')
  expect(await run($, 'slack-pane-refresh', '30')).toBe('Refresh interval set to 30s')
  expect(await run($, 'slack-pane-refresh')).toBe('Refresh interval: 30s')
  void clock
})

test('stored interval is loaded at start', async ($, on) => {
  engine(on, slack, { refreshSeconds: 45 })
  await start($)
  expect(await run($, 'slack-pane-refresh')).toBe('Refresh interval: 45s')
})

test('search command', async ($, on) => {
  const { sent, states } = engine(on, slack)
  await start($)
  expect(await run($, 'slack-pane-search')).toBe('Usage: /slack-pane-search <query>')
  expect(await run($, 'slack-pane-search', 'deploy from:<@U1>')).toBe('Searching: deploy from:<@U1>')
  const search = sent.find(s => s.tool === 'slack_search_public_and_private')
  expect(search?.args.keywords).toEqual(['deploy'])
  expect(search?.args.filters).toBe('from:<@U1>')
  expect((states.left as { mode: string }).mode).toBe('search')
})

test('polls the open channel every interval', async ($, on) => {
  const { sent, clock, states } = engine(on, slack)
  await start($)
  await run($, 'slack-pane', '#general')
  expect(count(sent, 'slack_read_channel')).toBe(1)
  await clock.advance(10_000)
  await clock.advance(10_000)
  expect(count(sent, 'slack_read_channel')).toBe(3)
  const messages = states.messages as { items: { ts: string }[] }
  expect(messages.items.map(m => m.ts)).toEqual(['1793325746.615629', '1793337289.953239'])
  expect((states.refresh as { status: string }).status).toBe('idle')
})

test('closed pane stops polling', async ($, on) => {
  const { sent, clock } = engine(on, slack)
  await start($)
  await run($, 'slack-pane', '#general')
  await run($, 'slack-pane')
  await clock.advance(30_000)
  expect(count(sent, 'slack_read_channel')).toBe(1)
})

test('interval change restarts timer', async ($, on) => {
  const { sent, clock } = engine(on, slack)
  await start($)
  await run($, 'slack-pane', '#general')
  await run($, 'slack-pane-refresh', '30')
  await clock.advance(10_000)
  expect(count(sent, 'slack_read_channel')).toBe(1)
  await clock.advance(20_000)
  expect(count(sent, 'slack_read_channel')).toBe(2)
})

test('requests never overlap', async ($, on) => {
  let inFlight = 0
  let maxInFlight = 0
  const { clock } = engine(on, async (tool, args) => {
    if (tool !== 'slack_read_channel') return slack(tool, args)
    inFlight += 1
    maxInFlight = Math.max(maxInFlight, inFlight)
    await clock.sleep(15_000)
    inFlight -= 1
    return slack(tool, args)
  })
  await start($)
  void run($, 'slack-pane', '#general')
  for (let i = 0; i < 6; i += 1) await clock.advance(10_000)
  expect(maxInFlight).toBe(1)
})

test('late response for old view is dropped', async ($, on) => {
  const { clock, states } = engine(on, async (tool, args) => {
    if (tool === 'slack_read_channel' && args.channel_id === 'C0FAKE0001') {
      await clock.sleep(5_000)
      return ok({ messages: CHANNEL, pagination_info: '' })
    }
    if (tool === 'slack_read_channel') return ok({ messages: CHANNEL_EMPTY, pagination_info: '' })
    return slack(tool, args)
  })
  await start($)
  void run($, 'slack-pane', '#general')
  await clock.settle()
  await run($, 'slack-pane', '#backend')
  await clock.advance(5_000)
  const view = states.view as { channelId: string }
  const messages = states.messages as { items: unknown[] }
  expect(view.channelId).toBe('C0FAKE0002')
  expect(messages.items).toEqual([])
})

test('failure marks error and retries', async ($, on) => {
  let fail = true
  const { sent, clock, states } = engine(on, (tool, args) => {
    if (tool === 'slack_read_channel' && fail) {
      fail = false
      return mcpError('ratelimited')
    }
    return slack(tool, args)
  })
  await start($)
  await run($, 'slack-pane', '#general')
  const failed = states.refresh as { status: string; failedAt?: number }
  expect(failed.status).toBe('error')
  expect(typeof failed.failedAt).toBe('number')
  await clock.advance(10_000)
  expect(count(sent, 'slack_read_channel')).toBe(2)
  expect((states.refresh as { status: string }).status).toBe('idle')
})

test('not connected sets the banner', async ($, on) => {
  const { states } = engine(on, () => {
    throw new Error('not connected')
  })
  await start($)
  await run($, 'slack-pane')
  expect(states.banner).toMatch(/^Slack MCP not connected: plugin:slack:slack: /)
})
