import type { ElementTable, EngineInterface } from 'claude-code'

import type { Loadable, Message, RefreshState, View } from '../../types'
import { clockTime, formatTime } from '../format'
import { loadOlder, openView } from '../poller'
import { MESSAGE_GAP_ROWS, messageHeights, messageWindow, scrollMessages, selectMessage } from '../scroll'
import type { SlackClient } from '../slack/client'
import { actionBar } from './action-bar'

export type Clock = { now: number; tz: number }

// The engine inverts only a Button's first line under the pointer: light the whole message instead.
const MESSAGE_HOVER = { backgroundColor: 'subtle' } as const

export function refreshText(refresh: RefreshState, interval: number, clock: Clock): string {
  if (refresh.status === 'refreshing') return '↻ updating…'
  if (refresh.status === 'paused') return '⏸ paused'
  if (refresh.status === 'error') return `⚠ failed ${clockTime(refresh.failedAt ?? clock.now, clock.tz)}`
  return refresh.lastSuccessAt === undefined
    ? `↻ ${interval}s`
    : `↻ ${interval}s · ${clockTime(refresh.lastSuccessAt, clock.tz)}`
}

function messageMeta(m: Message, clock: Clock): string {
  const replies = m.replyCount > 0 ? `  ${m.replyCount} replies` : ''
  return `  ${formatTime(m.ts, clock.now, clock.tz)}${replies}`
}

export function headerRow(
  $: EngineInterface,
  client: SlackClient,
  els: ElementTable,
  view: View,
  status: string,
) {
  const { Box, Text, Button } = els
  return (
    <Box flexDirection="row" justifyContent="space-between" flexShrink={0}>
      {view.kind === 'thread' ? (
        <Box flexDirection="row" gap={1}>
          <Button
            key="back"
            label={`← ${view.label}`}
            onPress={() =>
              void openView($, client, {
                kind: 'channel',
                channelId: view.channelId,
                label: view.label,
                ...(view.back.anchorTs === undefined ? {} : { anchorTs: view.back.anchorTs }),
              })
            }
          />
          <Text bold>Thread</Text>
        </Box>
      ) : (
        <Text bold>{view.label}</Text>
      )}
      <Text dimColor>{status}</Text>
    </Box>
  )
}

export function messageList(
  $: EngineInterface,
  client: SlackClient,
  els: ElementTable,
  view: View,
  messages: Loadable<Message>,
  selectedTs: string | null,
  bottomTs: string | null,
  width: number,
  rows: number,
  clock: Clock,
) {
  const { Box, Text, Button } = els
  const canLoadOlder = messages.items.length > 0 && (view.kind === 'channel' || messages.cursor !== undefined)
  const { start, end } = messageWindow(messages.items, bottomTs, rows, messageHeights(messages.items, view, selectedTs, width))
  const shown = messages.items.slice(start, end)
  const pressOlder = () => (view.kind === 'thread' ? loadOlder($, client) : scrollMessages($, client, -rows))
  return (
    <Box flexDirection="column">
      {canLoadOlder && <Button key="older" label={view.kind === 'thread' ? '▼ More replies' : '▲ Older'} onPress={() => void pressOlder()} />}
      {messages.isLoading && <Text dimColor>Loading…</Text>}
      {messages.error !== undefined && <Text color="red">⚠ {messages.error}</Text>}
      {!messages.isLoading && messages.items.length === 0 && messages.error === undefined && <Text dimColor>No messages</Text>}
      <Box flexDirection="column" gap={MESSAGE_GAP_ROWS}>
        {shown.map(m => (
          <Box key={`row:${m.ts}`} flexDirection="column" hover={MESSAGE_HOVER}>
            <Button key={`msg:${m.ts}`} plain onPress={() => void selectMessage($, m.ts)}>
              <Text bold color={view.kind === 'channel' && m.ts === view.anchorTs ? 'yellow' : 'suggestion'} hover={MESSAGE_HOVER}>
                {`${m.ts === selectedTs ? '> ' : ''}${m.userName}`}
              </Text>
              <Text dimColor hover={MESSAGE_HOVER}>
                {messageMeta(m, clock)}
              </Text>
              <Text hover={MESSAGE_HOVER}>{`\n${m.text === '' ? ' ' : m.text}${m.hasFile ? '\n[file]' : ''}`}</Text>
            </Button>
            {m.ts === selectedTs && actionBar($, client, els, view, m)}
          </Box>
        ))}
      </Box>
      {view.kind === 'channel' && view.anchorTs !== undefined && (
        <Button
          key="latest"
          label="Jump to latest"
          onPress={() => void openView($, client, { kind: 'channel', channelId: view.channelId, label: view.label })}
        />
      )}
    </Box>
  )
}
