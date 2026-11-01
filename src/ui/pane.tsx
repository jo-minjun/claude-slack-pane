import type { EngineInterface, RenderInput } from 'claude-code'

import { tzOffsetMinutes } from '../format'
import type { SlackClient } from '../slack/client'
import {
  readBanner,
  readChannels,
  readComposer,
  readIntervalSeconds,
  readLeft,
  readMessages,
  readRefresh,
  readSelectedTs,
  readView,
} from '../state'
import { channelColumn } from './channel-column'
import { actionBar, composerBox } from './composer'
import { headerRow, messageList, refreshText } from './message-column'

const MIN_LEFT = 22
const LEFT_SHARE = 0.3
const RIGHT_RESERVED_ROWS = 10

export async function renderPane($: EngineInterface, e: RenderInput<'Pane'>, client: SlackClient) {
  const els = $.ui.resolve(e)
  const { Box, Text } = els
  const columns = e.props.bodyColumns
  const rows = e.props.scroll.bodyRows
  const leftWidth = Math.max(MIN_LEFT, Math.floor(columns * LEFT_SHARE))
  const rightWidth = Math.max(10, columns - leftWidth)
  const [banner, channels, left, view, messages, selectedTs, refresh, interval, composer] = await Promise.all([
    readBanner($),
    readChannels($),
    readLeft($),
    readView($),
    readMessages($),
    readSelectedTs($),
    readRefresh($),
    readIntervalSeconds($),
    readComposer($),
  ])
  const selected = messages.items.find(m => m.ts === selectedTs)
  const clock = { now: await $.clock.now(), tz: tzOffsetMinutes() }

  return (
    <Box flexDirection="column">
      {banner !== null && <Text color="red">{banner}</Text>}
      <Box flexDirection="row">
        {channelColumn($, client, els, leftWidth, rows, channels, left, view)}
        <Box key="right" flexDirection="column" width={rightWidth}>
          {view === null ? (
            <Text dimColor>Select a channel</Text>
          ) : (
            <Box flexDirection="column">
              {headerRow($, client, els, view, refreshText(refresh, interval, clock))}
              {messageList($, client, els, view, messages, selectedTs, rightWidth, Math.max(3, rows - RIGHT_RESERVED_ROWS), clock)}
              {selected !== undefined && actionBar($, client, els, view, selected)}
              {composerBox($, client, els, view, composer)}
            </Box>
          )}
        </Box>
      </Box>
    </Box>
  )
}
