import type { ElementTable, EngineInterface } from 'claude-code'

import type { Loadable, Message, RefreshState, View } from '../../types'
import { clockTime, formatTime, rowsFor } from '../format'
import { loadOlder, openView } from '../poller'
import type { SlackClient } from '../slack/client'
import { updateSelectedTs } from '../state'

export type Clock = { now: number; tz: number }

export function refreshText(refresh: RefreshState, interval: number, clock: Clock): string {
  if (refresh.status === 'refreshing') return '↻ updating…'
  if (refresh.status === 'paused') return '⏸ paused'
  if (refresh.status === 'error') return `⚠ failed ${clockTime(refresh.failedAt ?? clock.now, clock.tz)}`
  return refresh.lastSuccessAt === undefined
    ? `↻ ${interval}s`
    : `↻ ${interval}s · ${clockTime(refresh.lastSuccessAt, clock.tz)}`
}

export function messageHeader(m: Message, clock: Clock, isSelected: boolean): string {
  const replies = m.replyCount > 0 ? `  ${m.replyCount} replies` : ''
  return `${isSelected ? '> ' : ''}${m.userName} ${formatTime(m.ts, clock.now, clock.tz)}${replies}`
}

// Newest messages that fit the rows, oldest first.
export function visibleMessages(items: Message[], rows: number, width: number): Message[] {
  const shown: Message[] = []
  let used = 0
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const m = items[i]!
    const need = 1 + rowsFor(m.text, width - 2) + (m.hasFile ? 1 : 0)
    if (shown.length > 0 && used + need > rows) break
    shown.unshift(m)
    used += need
  }
  return shown
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
    <Box flexDirection="row" justifyContent="space-between">
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
  width: number,
  rows: number,
  clock: Clock,
) {
  const { Box, Text, Button } = els
  const canLoadOlder = messages.items.length > 0 && (view.kind === 'channel' || messages.cursor !== undefined)
  const shown = visibleMessages(messages.items, rows, width)
  return (
    <Box flexDirection="column">
      {canLoadOlder && <Button key="older" label={view.kind === 'thread' ? '▼ More replies' : '▲ Older'} onPress={() => void loadOlder($, client)} />}
      {messages.isLoading && <Text dimColor>Loading…</Text>}
      {messages.error !== undefined && <Text color="red">⚠ {messages.error}</Text>}
      {!messages.isLoading && messages.items.length === 0 && messages.error === undefined && <Text dimColor>No messages</Text>}
      {shown.map(m => (
        <Button key={`msg:${m.ts}`} onPress={() => void updateSelectedTs($, () => m.ts)}>
          <Text bold={m.ts === selectedTs} color={view.kind === 'channel' && m.ts === view.anchorTs ? 'yellow' : undefined}>
            {messageHeader(m, clock, m.ts === selectedTs)}
          </Text>
          <Text>{`\n${m.text === '' ? ' ' : m.text}${m.hasFile ? '\n[file]' : ''}`}</Text>
        </Button>
      ))}
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
