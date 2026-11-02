import { expect, test } from 'claude-code/testing'

import type { Message } from '../types'
import { authorsMatching, trailingMention } from '../src/mention'
import { parseUsers } from '../src/slack/parse'
import { CHANNEL } from './fixtures/channel'
import { CHANNEL_LIST } from './fixtures/channel-list'
import { PROFILE } from './fixtures/profile'
import { engine, ok, run, start, type McpAnswer } from './harness'

const USERS = `# Search Results for:

## Users (2 results)
1. Alan Park - U0FAKE0002 - alan@example.com - Platform / BE
2. Alice Kim - U0FAKE0001 - alice@example.com - Design
`
const slack: McpAnswer = tool => {
  if (tool === 'slack_list_user_channels') return ok({ result: CHANNEL_LIST })
  if (tool === 'slack_read_user_profile') return ok({ result: PROFILE })
  if (tool === 'slack_read_channel') return ok({ messages: CHANNEL, pagination_info: '' })
  if (tool === 'slack_search_users') return ok({ results: USERS, pagination_info: '' })
  return ok({ result: 'ok' })
}

const PANE = {
  plugin: 'slack-pane',
  component: 'Pane',
  requestId: 'slack',
  surface: 'terminal',
  props: { title: 'Slack', isFocused: true, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
} as const

const message = (userId: string, userName: string): Message => ({ ts: '1.0', userId, userName, text: '', replyCount: 0, hasFile: false })

test('only an @word the text ends in is read', () => {
  expect(trailingMention('hi @al')).toEqual({ start: 3, query: 'al' })
  expect(trailingMention('@')).toEqual({ start: 0, query: '' })
  // A space ends a Korean syllable's composing, so one may follow the query.
  expect(trailingMention('hi @조 ')).toEqual({ start: 3, query: '조' })
  expect(trailingMention('hi @ ')).toBeUndefined()
  expect(trailingMention('hi @조  ')).toBeUndefined()
  expect(trailingMention('hi @al there')).toBeUndefined()
  expect(trailingMention('mail me@example')).toBeUndefined()
})

test('the view offers its people but me, newest first, once each and no bots', () => {
  const items = [message('U1', 'Alice Kim'), message('B1', 'Alert Bot'), message('U2', 'Alan Park'), message('U3', 'Al Me'), message('U1', 'Alice Kim')]
  expect(authorsMatching(items, 'al', 'U3')).toEqual([
    { id: 'U1', name: 'Alice Kim' },
    { id: 'U2', name: 'Alan Park' },
  ])
  expect(authorsMatching(items, 'park', 'U3')).toEqual([{ id: 'U2', name: 'Alan Park' }])
})

test('a user search line gives a name and an ID', () => {
  expect(parseUsers(USERS)).toEqual([
    { id: 'U0FAKE0002', name: 'Alan Park' },
    { id: 'U0FAKE0001', name: 'Alice Kim' },
  ])
  expect(parseUsers('# Search Results for: \n\nNo users found.')).toEqual([])
})

test('typing @ asks for a name, a space ends the word and a pick puts in the person as Slack writes them', async ($, on) => {
  const { sent, clock } = engine(on, slack)
  await start($)
  await run($, 'slack-pane', '#general')
  const ui = await $.ui.mount(PANE)
  const offered = async () =>
    (await ui.findAll({ type: 'Button' })).filter(b => String(b.props.key).startsWith('mention:')).map(b => b.props.label)

  // The fixture's only author is the one logged in: no one to offer before a search.
  await ui.input({ key: 'composer', text: 'hi @', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: 'type a name to search' })).toBeDefined()
  expect(await offered()).toEqual([])
  expect(await ui.find({ key: 'attach-file' })).toBeUndefined()

  await ui.input({ key: 'composer', text: 'hi @al ', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: 'searching…' })).toBeDefined()
  await clock.advance(300)
  const searches = sent.filter(s => s.tool === 'slack_search_users')
  expect(searches.map(s => s.args)).toEqual([{ keywords: ['al'], natural_language_query: '', limit: 5, response_format: 'concise' }])
  expect(await offered()).toEqual(['@Alan Park', '@Alice Kim'])

  await ui.press({ key: 'mention:U0FAKE0002' })
  expect((await ui.find({ key: 'composer' }))?.props.value).toBe('hi <@U0FAKE0002> ')
  expect(await ui.find({ key: 'mention-row' })).toBeUndefined()
  expect(await ui.find({ key: 'attach-file' })).toBeDefined()

  await ui.input({ key: 'composer', text: 'hi <@U0FAKE0002> look' })
  expect(sent.find(s => s.tool === 'slack_send_message')?.args).toEqual({ channel_id: 'C0FAKE0001', message: 'hi <@U0FAKE0002> look' })
  await ui.unmount()
})

test('removing the @ closes the offer and a late search is dropped', async ($, on) => {
  const { sent, clock } = engine(on, slack)
  await start($)
  await run($, 'slack-pane', '#general')
  const ui = await $.ui.mount(PANE)

  await ui.input({ key: 'composer', text: '@zed', kind: 'change' })
  expect(await ui.find({ key: 'mention-row' })).toBeDefined()
  await ui.input({ key: 'composer', text: '@zed x', kind: 'change' })
  expect(await ui.find({ key: 'mention-row' })).toBeUndefined()
  await clock.advance(300)
  expect(sent.some(s => s.tool === 'slack_search_users')).toBe(false)
  await ui.unmount()
})
