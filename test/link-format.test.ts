import { expect, test } from 'claude-code/testing'

import { channelLabel, formatTime } from '../src/format'
import { domainFromPermalink, messageLink } from '../src/slack/link'

test('messageLink for channel message', () => {
  expect(messageLink('acme.slack.com', 'C1', '1793337289.953239')).toBe(
    'https://acme.slack.com/archives/C1/p1793337289953239',
  )
})

test('messageLink for reply', () => {
  expect(messageLink('acme.slack.com', 'C1', '1793337289.953239', '1793300000.000100')).toBe(
    'https://acme.slack.com/archives/C1/p1793337289953239?thread_ts=1793300000.000100&cid=C1',
  )
})

test('domainFromPermalink', () => {
  expect(domainFromPermalink('https://acme.slack.com/archives/C1/p1?x=1')).toBe('acme.slack.com')
  expect(domainFromPermalink('not a link')).toBeUndefined()
})

test('formatTime shows HH:mm today and MM/DD HH:mm otherwise', () => {
  const ts = '1793337289.953239'
  const sameDay = 1793337289_000 + 60 * 60 * 1000
  const nextDay = 1793337289_000 + 24 * 60 * 60 * 1000
  expect(formatTime(ts, sameDay, 540)).toBe('14:14')
  expect(formatTime(ts, nextDay, 540)).toBe('10/30 14:14')
})

test('channelLabel by kind', () => {
  expect(channelLabel({ id: 'C1', name: 'general', kind: 'public' })).toBe('#general')
  expect(channelLabel({ id: 'C2', name: 'backend', kind: 'private' })).toBe('#backend')
  expect(channelLabel({ id: 'D1', name: 'Bob', kind: 'im' })).toBe('@Bob')
  expect(channelLabel({ id: 'G1', name: 'Bob, Carol', kind: 'mpim' })).toBe('Bob, Carol')
})
