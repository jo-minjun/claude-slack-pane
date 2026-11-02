import type { ElementTable, EngineInterface } from 'claude-code'

import type { ChannelsState, LeftState, SearchHit, View } from '../../types'
import { searchMessages } from '../commands'
import { channelLabel, firstLine } from '../format'
import { openView } from '../poller'
import { channelRows, leftItemRows, leftList, leftPageSize, scrollLeft } from '../scroll'
import type { SlackClient } from '../slack/client'
import { updateLeft } from '../state'

// A button draws `[ ` and ` ]` around its label; the column keeps one cell of padding.
const BUTTON_CHROME = 5

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
        ? left.results.items.slice(top, top + pageSize).map(hit => (
            <Button
              key={`hit:${hit.channelId}:${hit.ts}`}
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
              <Text dimColor>{firstLine(`${hitLabel(hit)} ${hit.userName}`, width - BUTTON_CHROME)}</Text>
              <Text>{`\n${firstLine(hit.text, width - BUTTON_CHROME)}`}</Text>
            </Button>
          ))
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
