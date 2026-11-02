import type { EngineInterface, RenderInput } from 'claude-code'

import { tzOffsetMinutes } from '../format'
import { messageFrame, setLayout } from '../scroll'
import type { SlackClient } from '../slack/client'
import {
  readBanner,
  readChannels,
  readComposer,
  readIntervalSeconds,
  readLeft,
  readMessageTop,
  readMessages,
  readRefresh,
  readSelectedTs,
  readView,
} from '../state'
import { channelColumn } from './channel-column'
import { composerBox } from './composer'
import { headerRow, latestRow, messageList, refreshText } from './message-column'

const MIN_LEFT = 22
const LEFT_SHARE = 0.3
// Header and its rule, ▲ Older and the blank under it, the row above the composer (▼ Latest or blank), and the composer with its frame.
const RIGHT_RESERVED_ROWS = 12
const RULE = '─'

export async function renderPane($: EngineInterface, e: RenderInput<'Pane'>, client: SlackClient) {
  const els = $.ui.resolve(e)
  const { Box, Text } = els
  const columns = e.props.bodyColumns
  const rows = e.props.scroll.bodyRows
  const leftWidth = Math.max(MIN_LEFT, Math.floor(columns * LEFT_SHARE))
  const rightWidth = Math.max(10, columns - leftWidth)
  const [banner, channels, left, view, messages, selectedTs, messageTop, refresh, interval, composer] = await Promise.all([
    readBanner($),
    readChannels($),
    readLeft($),
    readView($),
    readMessages($),
    readSelectedTs($),
    readMessageTop($),
    readRefresh($),
    readIntervalSeconds($),
    readComposer($),
  ])
  // Each column is clipped to the body so the pane itself never scrolls: one window would move both.
  const columnRows = Math.max(1, rows - (banner === null ? 0 : 1))
  const messageRows = Math.max(3, columnRows - RIGHT_RESERVED_ROWS)
  setLayout({ leftWidth, leftRows: columnRows, rightWidth, messageRows })
  const clock = { now: await $.clock.now(), tz: tzOffsetMinutes() }
  const frame = view === null ? null : messageFrame(messages.items, view, selectedTs, messageTop, messageRows, rightWidth)

  return (
    <Box flexDirection="column">
      {banner !== null && <Text color="red">{banner}</Text>}
      <Box flexDirection="row">
        {channelColumn($, client, els, leftWidth, columnRows, channels, left, view, clock)}
        <Box key="right" flexDirection="column" width={rightWidth} height={columnRows} overflow="hidden">
          {view === null || frame === null ? (
            <Text dimColor>Select a channel</Text>
          ) : (
            <>
              {headerRow($, client, els, view, refreshText(refresh, interval, clock))}
              <Box flexShrink={0}>
                <Text dimColor>{RULE.repeat(rightWidth)}</Text>
              </Box>
              <Box key="messages" flexDirection="column" flexGrow={1} flexShrink={1} justifyContent="flex-end" overflow="hidden">
                {messageList($, client, els, view, messages, selectedTs, frame, clock)}
              </Box>
              <Box flexDirection="column" flexShrink={0}>
                {latestRow($, client, els, view, frame)}
                {composerBox($, client, els, view, composer)}
              </Box>
            </>
          )}
        </Box>
      </Box>
    </Box>
  )
}
