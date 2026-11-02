import type { ElementTable, EngineInterface } from 'claude-code'

import type { ChannelsState, LeftState, SearchHit, View } from '../../types'
import { searchMessages } from '../commands'
import { channelLabel, displayWidth, firstLine, fitWidth, formatTime, padWidth } from '../format'
import { openView } from '../poller'
import { channelRows, leftItemRows, leftList, leftPageSize, scrollLeft } from '../scroll'
import type { SlackClient } from '../slack/client'
import { updateLeft } from '../state'
import { type Clock, MESSAGE_HOVER } from './message-column'

// A button draws `[ ` and ` ]` around its label; the column keeps one cell of padding.
const BUTTON_CHROME = 5
// The column's padding, and a cell for a symbol the width table misses, so a hit's row never wraps.
const HIT_EDGE_CELLS = 2

export function hitLabel(hit: SearchHit): string {
  return hit.channelId.startsWith('D') ? `@${hit.channelName}` : `#${hit.channelName}`
}

export function channelColumn(
  $: EngineInterface,
  client: SlackClient,
  els: ElementTable,
  width: number,
  rows: number,
  channels: ChannelsState,
  left: LeftState,
  view: View | null,
  clock: Clock,
) {
  const { Box, Text, Button } = els
  const Input = 'Input' in els ? (els as ElementTable<'terminal'>).Input : undefined
  const { isSearch, list, top, length } = leftList(left, channels)
  const pageSize = leftPageSize(rows, isSearch)
  const pageRows = pageSize * leftItemRows(isSearch)
  const hasMoreLoaded = top + pageSize < length
  const toggleFromMe = async () => {
    const next = !left.fromMe
    await updateLeft($, l => ({ ...l, fromMe: next }))
    // Turning the filter off outside a search leaves the channel list alone.
    if (next || isSearch) await searchMessages($, client, left.query, next)
  }

  return (
    <Box key="left" flexDirection="column" width={width} height={rows} overflow="hidden" paddingRight={1}>
      <Text bold>Channels</Text>
      <Box key="search-frame" flexDirection="column" {...(Input ? { borderStyle: 'round', borderColor: 'promptBorder' } : {})}>
        {Input && (
          <Input key="search" placeholder="Search messages" value={left.query} submitLabel="search" onSubmit={(value: string) => void searchMessages($, client, value.trim(), left.fromMe)} />
        )}
        <Box flexDirection="row" gap={1}>
          <Button key="from-me" label={`${left.fromMe ? '☑' : '☐'} From me`} onPress={() => void toggleFromMe()} />
          {isSearch && (
            <Button key="clear" label="× Clear" onPress={() => void updateLeft($, l => ({ ...l, mode: 'channels' as const, top: 0 }))} />
          )}
        </Box>
      </Box>
      {top > 0 && <Button key="more-up" label="▲ More" onPress={() => void scrollLeft($, client, -pageRows)} />}
      {list.isLoading && <Text dimColor>Loading…</Text>}
      {list.error !== undefined && <Text color="red">⚠ {list.error}</Text>}
      {isSearch && !list.isLoading && list.items.length === 0 && list.error === undefined && <Text dimColor>No results</Text>}
      {isSearch
        ? left.results.items.slice(top, top + pageSize).map(hit => searchHit($, client, els, hit, width - HIT_EDGE_CELLS, clock))
        : channelRows(channels.items)
            .slice(top, top + pageSize)
            .map((row, i) =>
              row.kind === 'gap' ? (
                <Text key={`gap:${top + i}`}> </Text>
              ) : row.kind === 'heading' ? (
                <Text key={`heading:${row.label}`} bold color="suggestion">
                  {row.label}
                </Text>
              ) : (
                <Button
                  key={`ch:${row.channel.id}`}
                  label={firstLine(`${view?.channelId === row.channel.id ? '> ' : ''}${channelLabel(row.channel)}`, width - BUTTON_CHROME)}
                  onPress={() => void openView($, client, { kind: 'channel', channelId: row.channel.id, label: channelLabel(row.channel) })}
                />
              ),
            )}
      {(hasMoreLoaded || list.cursor !== undefined) && <Button key="more-down" label="▼ More" onPress={() => void scrollLeft($, client, pageRows)} />}
    </Box>
  )
}

// A hit drawn as a message is: channel and time, then author and text, padded so the whole row takes a press.
function searchHit($: EngineInterface, client: SlackClient, els: ElementTable, hit: SearchHit, cells: number, clock: Clock) {
  const { Box, Text, Button } = els
  const time = formatTime(hit.ts, clock.now, clock.tz)
  const channel = fitWidth(hitLabel(hit), Math.max(1, cells - displayWidth(time) - 1))
  const author = `${fitWidth(hit.userName, Math.max(1, Math.floor(cells / 2)))}: `
  const text = firstLine(hit.text, Math.max(1, cells - displayWidth(author)))
  const key = `${hit.channelId}:${hit.ts}`
  return (
    <Box key={`hit-row:${key}`} flexDirection="column" hover={MESSAGE_HOVER}>
      <Button
        key={`hit:${key}`}
        plain
        onPress={() =>
          void openView($, client, {
            kind: 'thread',
            channelId: hit.channelId,
            label: hitLabel(hit),
            threadTs: hit.threadTs ?? hit.ts,
            back: { anchorTs: hit.threadTs ?? hit.ts },
          })
        }
      >
        <Text bold color="suggestion" hover={MESSAGE_HOVER}>
          {channel}
        </Text>
        <Text dimColor hover={MESSAGE_HOVER}>
          {padWidth('', cells - displayWidth(channel) - displayWidth(time))}
          {time}
        </Text>
        <Text dimColor hover={MESSAGE_HOVER}>{`\n${author}`}</Text>
        <Text hover={MESSAGE_HOVER}>{padWidth(text, cells - displayWidth(author))}</Text>
      </Button>
      <Text> </Text>
    </Box>
  )
}
