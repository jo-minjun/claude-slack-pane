import { expect, test } from 'claude-code/testing'

import { SlackError } from '../src/slack/client'
import { createMcpClient, type McpCall } from '../src/slack/mcp-client'
import { CHANNEL } from './fixtures/channel'
import { CHANNEL_LIST } from './fixtures/channel-list'
import { CHANNEL_SEARCH } from './fixtures/channel-search'
import { mcpResult } from './fixtures/mcp'
import { PROFILE } from './fixtures/profile'
import { SEARCH } from './fixtures/search'

type Sent = { tool: string; args: Record<string, unknown> }

const recorder = (answer: Record<string, string>) => {
  const sent: Sent[] = []
  const call: McpCall = async (tool, args) => {
    sent.push({ tool, args })
    return mcpResult(answer)
  }
  return { sent, client: createMcpClient(call) }
}

test('readChannel sends detailed format and limit', async () => {
  const { sent, client } = recorder({ messages: CHANNEL, pagination_info: '' })
  const page = await client.readChannel('C1', { limit: 50 })
  expect(sent).toEqual([
    { tool: 'slack_read_channel', args: { channel_id: 'C1', limit: 50, response_format: 'detailed' } },
  ])
  expect(page.items.length).toBe(2)
})

test('readChannel passes range and cursor', async () => {
  const { sent, client } = recorder({ messages: CHANNEL, pagination_info: '' })
  await client.readChannel('C1', { limit: 25, latest: '2.0', oldest: '1.0', cursor: 'c' })
  expect(sent[0]?.args).toEqual({
    channel_id: 'C1',
    limit: 25,
    latest: '2.0',
    oldest: '1.0',
    cursor: 'c',
    response_format: 'detailed',
  })
})

test('search sends fixed options', async () => {
  const { sent, client } = recorder({ results: SEARCH, pagination_info: '' })
  await client.search(['deploy'], 'from:<@U1>')
  expect(sent[0]).toEqual({
    tool: 'slack_search_public_and_private',
    args: {
      keywords: ['deploy'],
      filters: 'from:<@U1>',
      sort: 'timestamp',
      limit: 20,
      include_context: false,
      natural_language_query: '',
      response_format: 'detailed',
    },
  })
})

test('listChannels sends all channel types', async () => {
  const { sent, client } = recorder({ result: CHANNEL_LIST })
  const page = await client.listChannels('next')
  expect(sent[0]).toEqual({
    tool: 'slack_list_user_channels',
    args: {
      types: 'public_channel,private_channel,im,mpim',
      exclude_archived: true,
      limit: 200,
      cursor: 'next',
    },
  })
  expect(page.items.length).toBe(4)
})

test('me uses detailed profile', async () => {
  const { sent, client } = recorder({ result: PROFILE })
  expect(await client.me()).toBe('U0FAKE0001')
  expect(sent[0]).toEqual({ tool: 'slack_read_user_profile', args: { response_format: 'detailed' } })
})

test('send passes thread_ts only in thread', async () => {
  const { sent, client } = recorder({ result: 'ok' })
  await client.send('C1', 'hi')
  await client.send('C1', 'hi', '1.2')
  expect(sent.map(s => s.args)).toEqual([
    { channel_id: 'C1', message: 'hi' },
    { channel_id: 'C1', message: 'hi', thread_ts: '1.2' },
  ])
  expect(sent[0]?.tool).toBe('slack_send_message')
})

test('findChannel matches the exact name', async () => {
  const { sent, client } = recorder({ results: CHANNEL_SEARCH, pagination_info: '' })
  expect(await client.findChannel('backend')).toEqual({
    id: 'C0FAKE0002',
    name: 'backend',
    kind: 'private',
  })
  expect(await client.findChannel('back')).toBeUndefined()
  expect(sent[0]).toEqual({
    tool: 'slack_search_channels',
    args: {
      keywords: ['backend'],
      natural_language_query: '',
      channel_types: 'public_channel,private_channel',
      limit: 20,
    },
  })
})

test('call failure becomes not-connected', async () => {
  const client = createMcpClient(async () => {
    throw new Error('server not connected')
  })
  let kind = 'none'
  try {
    await client.me()
  } catch (error) {
    kind = error instanceof SlackError ? error.kind : 'other'
  }
  expect(kind).toBe('not-connected')
})
