import { describe, expect, test } from 'claude-code/testing'

import { SlackError } from '../src/slack/client'
import {
  decodeSlackText,
  parseChannelList,
  parseChannelSearch,
  parseChannelMessages,
  parseProfile,
  parseSearch,
  parseThread,
  unwrap,
} from '../src/slack/parse'
import { CHANNEL_LIST, CHANNEL_LIST_LAST } from './fixtures/channel-list'
import { CHANNEL_SEARCH } from './fixtures/channel-search'
import { CHANNEL, CHANNEL_CURSOR, CHANNEL_EMPTY } from './fixtures/channel'
import { mcpError, mcpResult } from './fixtures/mcp'
import { PROFILE } from './fixtures/profile'
import { SEARCH, SEARCH_BOTS, SEARCH_CURSOR, SEARCH_EMPTY } from './fixtures/search'
import { THREAD, THREAD_CURSOR, THREAD_NO_REPLIES } from './fixtures/thread'

const parseError = (fn: () => unknown) => {
  try {
    fn()
  } catch (error) {
    return error instanceof SlackError ? error.kind : 'other'
  }
  return 'none'
}

describe('unwrap', () => {
  test('returns the JSON fields', () => {
    expect(unwrap(mcpResult({ result: 'x' }))).toEqual({ result: 'x' })
  })

  test('tool error becomes tool-error', () => {
    expect(parseError(() => unwrap(mcpError('channel_not_found\nmore')))).toBe('tool-error')
  })

  test('non JSON becomes parse error', () => {
    expect(
      parseError(() => unwrap({ content: [{ type: 'text', text: 'hello' }], isError: false })),
    ).toBe('parse')
  })
})

test('parseProfile returns only the user id', () => {
  expect(parseProfile(PROFILE)).toBe('U0FAKE0001')
})

test('parseChannelList reads id, name, kind and cursor', () => {
  const page = parseChannelList(CHANNEL_LIST)
  expect(page.items).toEqual([
    { id: 'C0FAKE0001', name: 'general', kind: 'public' },
    { id: 'C0FAKE0002', name: 'backend', kind: 'private' },
    { id: 'D0FAKE0001', name: 'Bob', kind: 'im' },
    { id: 'G0FAKE0001', name: 'Bob, Carol', kind: 'mpim' },
  ])
  expect(page.nextCursor).toBe('Y3Vyc29yLTE=')
  expect(parseChannelList(CHANNEL_LIST_LAST).nextCursor).toBeUndefined()
})

test('parseChannelSearch reads id from permalink', () => {
  expect(parseChannelSearch(CHANNEL_SEARCH, '').items).toEqual([
    { id: 'C0FAKE0009', name: 'team-backend', kind: 'public' },
    { id: 'C0FAKE0002', name: 'backend', kind: 'private' },
  ])
})

test('parseChannelMessages reads ts, author, body, replies', () => {
  const page = parseChannelMessages(CHANNEL, CHANNEL_CURSOR)
  expect(page.items.length).toBe(2)
  expect(page.items[0]).toEqual({
    ts: '1793337289.953239',
    userId: 'B0FAKE0001',
    userName: 'Bot One',
    text: 'New post & notes:\n https://example.com/notice?view&page=0',
    replyCount: 0,
    hasFile: false,
  })
  expect(page.items[1]?.userName).toBe('Alice Kim')
  expect(page.items[1]?.replyCount).toBe(9)
  expect(page.nextCursor).toBe('bmV4dC0x')
})

test('parseChannelMessages keeps meta-like body lines', () => {
  const page = parseChannelMessages(CHANNEL, '')
  expect(page.items[1]?.text).toBe(
    'Release status\nThread: 3 replies (fake line inside the body)\nnext line',
  )
})

test('empty channel is an empty page', () => {
  expect(parseChannelMessages(CHANNEL_EMPTY, '').items).toEqual([])
})

test('parseThread puts parent first and marks replies', () => {
  const page = parseThread(THREAD, THREAD_CURSOR)
  expect(page.items.map(m => m.ts)).toEqual([
    '1793325746.615629',
    '1793334367.423609',
    '1793338156.146259',
  ])
  expect(page.items[0]?.text).toBe('Parent body line 1\n\nParent body line 2')
  expect(page.items[0]?.threadTs).toBeUndefined()
  expect(page.items[1]).toEqual({
    ts: '1793334367.423609',
    userId: 'U0FAKE0002',
    userName: 'Bob Lee',
    text: 'First reply',
    replyCount: 0,
    threadTs: '1793325746.615629',
    hasFile: false,
  })
  expect(page.nextCursor).toBe('dGhyZWFkLTI=')
})

test('parseThread with no replies returns the parent', () => {
  const page = parseThread(THREAD_NO_REPLIES, '')
  expect(page.items.length).toBe(1)
  expect(page.items[0]?.text).toBe('Only the parent')
})

test('parseSearch takes thread_ts from permalink', () => {
  const page = parseSearch(SEARCH, SEARCH_CURSOR)
  expect(page.items[0]).toEqual({
    channelId: 'C0FAKE0002',
    channelName: 'backend',
    ts: '1793339391.207789',
    threadTs: '1793089818.196009',
    userName: 'Alice Kim',
    text: 'Reply in a thread\nsecond line',
    permalink:
      'https://acme.slack.com/archives/C0FAKE0002/p1793339391207789?thread_ts=1793089818.196009&cid=C0FAKE0002',
  })
  expect(page.items[1]?.threadTs).toBeUndefined()
  expect(page.nextCursor).toBe('Q1VSLTI=')
})

test('empty search is an empty page', () => {
  expect(parseSearch(SEARCH_EMPTY, '').items).toEqual([])
})

test('decodeSlackText restores entities and links', () => {
  expect(decodeSlackText('a &amp; b <https://x.io/a?b&amp;c|x.io>')).toBe(
    'a & b x.io (https://x.io/a?b&c)',
  )
  expect(decodeSlackText('see <https://x.io> &lt;tag&gt;')).toBe('see https://x.io <tag>')
  expect(decodeSlackText('<https://x.io|https://x.io>')).toBe('https://x.io')
  expect(decodeSlackText('<!subteam^S04PZ3PGQUD> <@U068EFBD6TU|심소현> <@U0NOLABEL>')).toBe('@subteam^S04PZ3PGQUD @심소현 @U0NOLABEL')
})

test('unrecognized text throws parse error', () => {
  expect(parseError(() => parseChannelMessages('hello', ''))).toBe('parse')
  expect(parseError(() => parseThread('hello', ''))).toBe('parse')
  expect(parseError(() => parseSearch('hello', ''))).toBe('parse')
  expect(parseError(() => parseChannelList('hello'))).toBe('parse')
  expect(parseError(() => parseChannelSearch('hello', ''))).toBe('parse')
  expect(parseError(() => parseProfile('hello'))).toBe('parse')
})

test('search hits by bots keep their name, or Bot when it has none', () => {
  expect(parseSearch(SEARCH_BOTS, '').items.map(hit => hit.userName)).toEqual(['deploy-bot', 'Bot'])
})
