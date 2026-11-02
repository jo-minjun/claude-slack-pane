import type { Engine } from 'claude-code/testing'
import { expect, test } from 'claude-code/testing'

import { PROFILE } from './fixtures/profile'
import { count, engine, ok, run, start, type McpAnswer } from './harness'

const CHANNEL_COUNT = 30
const channelId = (i: number) => `C${String(i).padStart(3, '0')}`
const CHANNELS = `## My Channels (showing ${CHANNEL_COUNT})

${Array.from({ length: CHANNEL_COUNT }, (_, i) => `### #c${String(i).padStart(2, '0')}\n- **ID:** ${channelId(i)}\n- **Type:** Public Channel\n- **Archived:** No\n`).join('\n')}`

const tsOf = (i: number) => `${1793300000 + i * 60}.000100`
// Newest first, as the Slack MCP server answers.
const channelText = (from: number, to: number) =>
  `Channel: #c0 (C000)\n\n${Array.from({ length: to - from }, (_, k) => to - 1 - k)
    .map(i => `=== Message from Alice Kim (U0FAKE0001) at 2026-10-30 11:02:26 KST === \nMessage TS: ${tsOf(i)}\nbody ${i}`)
    .join('\n\n')}`

function slack(state: { newest: number }): McpAnswer {
  return (tool, args) => {
    if (tool === 'slack_list_user_channels') return ok({ result: CHANNELS })
    if (tool === 'slack_read_user_profile') return ok({ result: PROFILE })
    if (tool === 'slack_read_channel') {
      if (args.latest !== undefined) return ok({ messages: channelText(0, 10), pagination_info: '' })
      return ok({ messages: channelText(state.newest - 20, state.newest), pagination_info: '' })
    }
    return ok({ result: 'ok' })
  }
}

// Ten rows of messages under the header, its rule and the composer.
const BODY_ROWS = 22
const pane = {
  plugin: 'slack-pane',
  component: 'Pane',
  requestId: 'slack',
  surface: 'terminal',
  props: { title: 'Slack', isFocused: true, bodyColumns: 90, placement: 'dock', scroll: { offset: 0, bodyRows: BODY_ROWS }, view: {} },
} as const

const LEFT_COLUMN = 3
const RIGHT_COLUMN = 60

function wheel($: Engine, by: number, column?: number) {
  return $.ui.scroll({
    component: 'Pane',
    requestId: 'slack',
    offset: 0,
    by,
    bodyRows: BODY_ROWS,
    contentRows: BODY_ROWS,
    origin: { kind: 'person' },
    ...(column === undefined ? {} : { pointer: { column, row: 5 } }),
  })
}

async function openFirstChannel($: Engine) {
  await start($)
  await run($, 'slack-pane')
  const ui = await $.ui.mount(pane)
  await ui.press({ key: `ch:${channelId(0)}` })
  return ui
}

test('wheel over one column leaves the other where it was', async ($, on) => {
  engine(on, slack({ newest: 40 }))
  const ui = await openFirstChannel($)
  expect(await ui.find({ key: `msg:${tsOf(39)}` })).toBeDefined()

  await wheel($, 3, LEFT_COLUMN)
  expect(await ui.find({ key: `ch:${channelId(0)}` })).toBeUndefined()
  expect(await ui.find({ key: `ch:${channelId(3)}` })).toBeDefined()
  expect(await ui.find({ key: `msg:${tsOf(39)}` })).toBeDefined()

  await wheel($, -6, RIGHT_COLUMN)
  expect(await ui.find({ key: `msg:${tsOf(39)}` })).toBeUndefined()
  expect(await ui.find({ key: `msg:${tsOf(36)}` })).toBeDefined()
  expect(await ui.find({ key: `ch:${channelId(3)}` })).toBeDefined()
  await ui.unmount()
})

test('scroll keys without a pointer move the messages', async ($, on) => {
  engine(on, slack({ newest: 40 }))
  const ui = await openFirstChannel($)
  await wheel($, -2)
  expect(await ui.find({ key: `msg:${tsOf(39)}` })).toBeUndefined()
  expect(await ui.find({ key: `ch:${channelId(0)}` })).toBeDefined()
  await wheel($, 100)
  expect(await ui.find({ key: `msg:${tsOf(39)}` })).toBeDefined()
  await ui.unmount()
})

test('the left list stops at its last full page', async ($, on) => {
  engine(on, slack({ newest: 40 }))
  const ui = await openFirstChannel($)
  await wheel($, 100, LEFT_COLUMN)
  expect(await ui.find({ key: `ch:${channelId(CHANNEL_COUNT - 1)}` })).toBeDefined()
  expect(await ui.find({ key: 'more-down' })).toBeUndefined()
  await wheel($, -100, LEFT_COLUMN)
  expect(await ui.find({ key: `ch:${channelId(0)}` })).toBeDefined()
  await ui.unmount()
})

test('a new message keeps a scrolled-up view in place', async ($, on) => {
  const state = { newest: 40 }
  const { clock } = engine(on, slack(state))
  const ui = await openFirstChannel($)
  await wheel($, -6, RIGHT_COLUMN)
  const shown = (await ui.findAll({ type: 'Button' })).map(b => b.key).filter(k => k?.startsWith('msg:'))
  state.newest = 41
  await clock.advance(10_000)
  const after = (await ui.findAll({ type: 'Button' })).map(b => b.key).filter(k => k?.startsWith('msg:'))
  expect(after).toEqual(shown)
  await wheel($, 100, RIGHT_COLUMN)
  expect(await ui.find({ key: `msg:${tsOf(40)}` })).toBeDefined()
  await ui.unmount()
})

test('older at the oldest message loads earlier ones and shows them', async ($, on) => {
  const { sent } = engine(on, slack({ newest: 30 }))
  const ui = await openFirstChannel($)
  for (let i = 0; i < 10 && !(await ui.find({ key: `msg:${tsOf(9)}` })); i += 1) await ui.press({ key: 'older' })
  expect(count(sent, 'slack_read_channel')).toBe(2)
  expect(await ui.find({ key: `msg:${tsOf(9)}` })).toBeDefined()
  await ui.unmount()
})

test('wheel at the oldest message stops asking once nothing older is left', async ($, on) => {
  const base = slack({ newest: 20 })
  const { sent } = engine(on, (tool, args) =>
    tool === 'slack_read_channel' && args.latest !== undefined ? ok({ messages: 'Channel: #c0 (C000)\n\n', pagination_info: '' }) : base(tool, args),
  )
  const ui = await openFirstChannel($)
  for (let i = 0; i < 5; i += 1) await wheel($, -100, RIGHT_COLUMN)
  expect(count(sent, 'slack_read_channel')).toBe(2)
  await ui.unmount()
})

test('the action bar is drawn under the selected message', async ($, on) => {
  engine(on, slack({ newest: 40 }))
  const ui = await openFirstChannel($)
  expect(await ui.find({ key: 'quote' })).toBeUndefined()
  await ui.press({ key: `msg:${tsOf(38)}` })
  const row = await ui.find({ key: `row:${tsOf(38)}` })
  expect(JSON.stringify(row?.children)).toContain('"quote"')
  expect(JSON.stringify((await ui.find({ key: `row:${tsOf(39)}` }))?.children)).not.toContain('"quote"')
  await ui.unmount()
})

test('selecting a message cut by the top brings its header and action bar into view', async ($, on) => {
  engine(on, slack({ newest: 40 }))
  const ui = await openFirstChannel($)
  const cut = `msg:${tsOf(36)}`
  expect((await ui.findAll({ type: 'Button' })).map(b => b.key).find(k => k?.startsWith('msg:'))).toBe(cut)
  expect((await ui.find({ key: cut }))?.text?.trimEnd()).toBe('body 36')
  await ui.press({ key: cut })
  // Header and body stay one Button, so the pointer on the body inverts the header row, not the body's first.
  expect((await ui.find({ key: cut }))?.text).toContain('Alice Kim')
  expect((await ui.find({ key: cut }))?.text).toContain('body 36')
  expect((await ui.find({ key: `row:${tsOf(36)}` }))?.text).toContain('Copy link')
  expect(await ui.find({ key: 'quote' })).toBeDefined()
  await ui.unmount()
})

test('a message is pressable across the whole width and lets go when pressed again', async ($, on) => {
  engine(on, slack({ newest: 40 }))
  const ui = await openFirstChannel($)
  const key = `msg:${tsOf(39)}`
  const rows = (await ui.find({ key }))!.text!.split('\n')
  expect(rows.length).toBe(2)
  expect(rows[0]!.length).toBe(rows[1]!.length)
  expect(rows[1]!.trimEnd()).toBe('body 39')
  await ui.press({ key })
  expect(await ui.find({ key: 'quote' })).toBeDefined()
  await ui.press({ key })
  expect(await ui.find({ key: 'quote' })).toBeUndefined()
  await ui.unmount()
})

test('a channel opened at an older message starts its window at that message', async ($, on) => {
  engine(on, slack({ newest: 40 }))
  await start($)
  await run($, 'slack-pane', `https://acme.slack.com/archives/${channelId(0)}/p${tsOf(5).replace('.', '')}`)
  const ui = await $.ui.mount(pane)
  expect((await ui.findAll({ type: 'Button' })).map(b => b.key).find(k => k?.startsWith('msg:'))).toBe(`msg:${tsOf(5)}`)
  expect(await ui.find({ key: `msg:${tsOf(39)}` })).toBeUndefined()
  await ui.unmount()
})

test('a message taller than the window can be read to its end', async ($, on) => {
  const long = Array.from({ length: 30 }, (_, i) => `line ${i}`).join('\n')
  const base = slack({ newest: 40 })
  engine(on, (tool, args) =>
    tool === 'slack_read_channel' && args.latest === undefined
      ? ok({ messages: `Channel: #c0 (C000)\n\n=== Message from Alice Kim (U0FAKE0001) at 2026-10-30 11:02:26 KST === \nMessage TS: ${tsOf(1)}\n${long}`, pagination_info: '' })
      : base(tool, args),
  )
  const ui = await openFirstChannel($)
  expect((await ui.find({ key: `msg:${tsOf(1)}` }))?.text).toContain('line 29')
  await wheel($, -100, RIGHT_COLUMN)
  const top = (await ui.find({ key: `msg:${tsOf(1)}` }))?.text
  expect(top).toContain('Alice Kim')
  expect(top).not.toContain('line 29')
  await ui.unmount()
})

test('latest shows how many newer messages are below and goes back to them', async ($, on) => {
  engine(on, slack({ newest: 40 }))
  const ui = await openFirstChannel($)
  expect(await ui.find({ key: 'latest' })).toBeUndefined()
  await wheel($, -6, RIGHT_COLUMN)
  expect((await ui.find({ key: 'latest' }))?.text).toBe('▼ Latest · 2 newer')
  await ui.press({ key: 'latest' })
  expect(await ui.find({ key: `msg:${tsOf(39)}` })).toBeDefined()
  expect(await ui.find({ key: 'latest' })).toBeUndefined()
  await ui.unmount()
})
