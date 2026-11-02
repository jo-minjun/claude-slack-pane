import type { ElementTable, EngineInterface } from 'claude-code'

import type { ChannelsState, LeftState, SearchHit, View } from '../../types'
import { myUserId, runSearch } from '../actions'
import { splitQuery } from '../commands'
import { channelLabel, firstLine } from '../format'
import { openView } from '../poller'
import { leftPageSize, scrollLeft } from '../scroll'
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
  const isSearch = left.mode === 'search'
  const pageSize = leftPageSize(rows, isSearch)
  const list = isSearch ? left.results : channels
  const top = isSearch ? left.top : channels.top
  const hasMoreLoaded = top + pageSize < list.items.length
  const search = async (query: string, filters?: string) => {
    const split = splitQuery(query)
    await runSearch($, client, query, split.keywords, filters ?? split.filters)
  }

  return (
    <Box key="left" flexDirection="column" width={width} height={rows} overflow="hidden" paddingRight={1}>
      <Text bold>Channels</Text>
      {Input && (
        <Input key="search" placeholder="Search messages" value={left.query} submitLabel="search" onSubmit={(value: string) => void search(value.trim())} />
      )}
      <Box flexDirection="row" gap={1}>
        <Button
          key="from-me"
          label="From me"
          onPress={async () => {
            const id = await myUserId($, client)
            if (id !== undefined) await search(left.query, `from:<@${id}>`)
          }}
        />
        {isSearch && (
          <Button key="clear" label="× Clear" onPress={() => void updateLeft($, l => ({ ...l, mode: 'channels' as const, top: 0 }))} />
        )}
      </Box>
      {top > 0 && <Button key="more-up" label="▲ More" onPress={() => void scrollLeft($, client, -pageSize)} />}
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
        : channels.items.slice(top, top + pageSize).map(channel => (
            <Button
              key={`ch:${channel.id}`}
              label={firstLine(`${view?.channelId === channel.id ? '> ' : ''}${channelLabel(channel)}`, width - BUTTON_CHROME)}
              onPress={() => void openView($, client, { kind: 'channel', channelId: channel.id, label: channelLabel(channel) })}
            />
          ))}
      {(hasMoreLoaded || list.cursor !== undefined) && <Button key="more-down" label="▼ More" onPress={() => void scrollLeft($, client, pageSize)} />}
    </Box>
  )
}
