import type { ElementTable, EngineInterface } from 'claude-code'

import type { Loadable, Message, RefreshState, View } from '../../types'
import { clockTime, displayWidth, fitWidth, formatTime, padWidth, plainEmoji } from '../format'
import { loadOlder, openView } from '../poller'
import { lastTop, type MessageFrame, messageHeight, newerBelow, scrollMessages, selectMessage } from '../scroll'
import type { SlackClient } from '../slack/client'
import { updateMessageTop } from '../state'
import { actionBar, HEADER_LINKS_WIDTH, headerLinks } from './action-bar'

export type Clock = { now: number; tz: number }

// The engine inverts only a Button's first line under the pointer: light the whole message instead.
export const MESSAGE_HOVER = { backgroundColor: 'subtle' } as const

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

const blankRows = (count: number) => Array.from({ length: count }, () => ' ').join('\n')

export function messageList(
  $: EngineInterface,
  client: SlackClient,
  els: ElementTable,
  view: View,
  messages: Loadable<Message>,
  selectedTs: string | null,
  frame: MessageFrame,
  clock: Clock,
) {
  const { Box, Text, Button } = els
  const { items } = messages
  const canLoadOlder = items.length > 0 && (view.kind === 'channel' || messages.cursor !== undefined)
  const pressOlder = () => (view.kind === 'thread' ? loadOlder($, client) : scrollMessages($, client, -frame.rows))
  const bottom = frame.top + frame.rows
  // Only the rows inside the window are drawn, so a message can show from any of its rows.
  const drawn = items.flatMap((m, i) => {
    const start = frame.pos[i]!
    const height = messageHeight(frame, i)
    const hasGap = i < items.length - 1
    if (start >= bottom || start + height + (hasGap ? 1 : 0) <= frame.top) return []
    const textEnd = start + 1 + frame.body[i]!.length
    const from = Math.max(frame.top, start) - start
    const to = Math.min(bottom, textEnd) - start
    const body = frame.body[i]!.slice(Math.max(0, from - 1), Math.max(0, to - 1))
    const hasHeader = from === 0 && to > 0
    const barEnd = textEnd + frame.bar[i]!
    const barShown = Math.max(0, Math.min(bottom, barEnd) - Math.max(frame.top, textEnd))
    const isBarWhole = barShown > 0 && textEnd >= frame.top && barEnd <= bottom
    const gap = start + height
    const parts = []
    if (hasHeader || body.length > 0) {
      const isSelected = m.ts === selectedTs
      const meta = messageMeta(m, clock)
      const nameWidth = frame.width - displayWidth(meta) - (isSelected ? 1 + HEADER_LINKS_WIDTH : 0)
      const name = fitWidth(`${isSelected ? '> ' : ''}${plainEmoji(m.userName)}`, Math.max(1, nameWidth))
      const header = [
        <Text key="name" bold color={view.kind === 'channel' && m.ts === view.anchorTs ? 'yellow' : 'suggestion'} hover={MESSAGE_HOVER}>
          {name}
        </Text>,
        // Rows are padded to the column's width: a Button takes a press only where it draws.
        <Text key="meta" dimColor hover={MESSAGE_HOVER}>
          {padWidth(meta, frame.width - displayWidth(name))}
        </Text>,
      ]
      parts.push(
        <Box key={`row:${m.ts}`} flexDirection="column" hover={MESSAGE_HOVER}>
          <Button key={`msg:${m.ts}`} plain onPress={() => void selectMessage($, m.ts)}>
            {hasHeader && header}
            {body.length > 0 && <Text hover={MESSAGE_HOVER}>{`${hasHeader ? '\n' : ''}${body.map(row => padWidth(row, frame.width)).join('\n')}`}</Text>}
          </Button>
          {/* Laid over the header rather than beside it: a Button cannot hold another, and a header
              apart from the message's Button would leave the body's first row to invert under the pointer. */}
          {hasHeader && isSelected && (
            <Box position="absolute" top={0} left={frame.width - HEADER_LINKS_WIDTH}>
              {headerLinks($, client, els, view, m)}
            </Box>
          )}
          {isBarWhole && actionBar($, client, els, view, m)}
        </Box>,
      )
    }
    // A bar cut by the window's edge keeps its rows blank: a Button cannot be drawn in part.
    if (barShown > 0 && !isBarWhole) parts.push(<Text key={`bar:${m.ts}`}>{blankRows(barShown)}</Text>)
    if (hasGap && gap >= frame.top && gap < bottom) parts.push(<Text key={`gap:${m.ts}`}> </Text>)
    return parts
  })
  return (
    <Box flexDirection="column">
      {canLoadOlder && (
        <Box marginBottom={1}>
          <Button key="older" label={view.kind === 'thread' ? '▼ More replies' : '▲ Older'} onPress={() => void pressOlder()} />
        </Box>
      )}
      {messages.isLoading && <Text dimColor>Loading…</Text>}
      {messages.error !== undefined && <Text color="red">⚠ {messages.error}</Text>}
      {!messages.isLoading && items.length === 0 && messages.error === undefined && <Text dimColor>No messages</Text>}
      {drawn}
    </Box>
  )
}

// The row above the composer: blank while the newest messages show, else a way back to them.
export function latestRow($: EngineInterface, client: SlackClient, els: ElementTable, view: View, frame: MessageFrame) {
  const { Text, Button } = els
  const isAnchored = view.kind === 'channel' && view.anchorTs !== undefined
  if (!isAnchored && frame.top >= lastTop(frame)) return <Text> </Text>
  const newer = newerBelow(frame)
  const press = () =>
    isAnchored
      ? openView($, client, { kind: 'channel', channelId: view.channelId, label: view.label })
      : updateMessageTop($, () => null)
  return <Button key="latest" label={newer > 0 ? `▼ Latest · ${newer} newer` : '▼ Latest'} onPress={() => void press()} />
}
