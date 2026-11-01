import type { ElementTable, EngineInterface } from 'claude-code'

import type { ChannelsState, LeftState, SearchHit, View } from '../../types'
import { loadChannels, myUserId, runSearch } from '../actions'
import { splitQuery } from '../commands'
import { channelLabel, firstLine } from '../format'
import { openView } from '../poller'
import type { SlackClient } from '../slack/client'
import { updateChannels, updateLeft } from '../state'

const HEADER_ROWS = 5
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
  const pageSize = Math.max(1, rows - HEADER_ROWS)
  const isSearch = left.mode === 'search'
  const list = isSearch ? left.results : channels
  const page = isSearch ? left.page : channels.page
  const shown = list.items.slice(page * pageSize, (page + 1) * pageSize)
  const hasMoreLoaded = (page + 1) * pageSize < list.items.length
  const setPage = (next: number) =>
    isSearch ? updateLeft($, l => ({ ...l, page: next })) : updateChannels($, c => ({ ...c, page: next }))
  const pressMoreDown = async () => {
    if (!hasMoreLoaded && list.cursor !== undefined) {
      if (isSearch) {
        const { keywords } = splitQuery(left.query)
        await runSearch($, client, left.query, keywords, left.filters, list.cursor)
      } else {
        await loadChannels($, client, list.cursor)
      }
    }
    await setPage(page + 1)
  }
  const search = async (query: string, filters?: string) => {
    const split = splitQuery(query)
    await runSearch($, client, query, split.keywords, filters ?? split.filters)
  }

  return (
    <Box key="left" flexDirection="column" width={width} paddingRight={1}>
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
          <Button key="clear" label="× Clear" onPress={() => void updateLeft($, l => ({ ...l, mode: 'channels' as const, page: 0 }))} />
        )}
      </Box>
      {page > 0 && <Button key="more-up" label="▲ More" onPress={() => void setPage(page - 1)} />}
      {list.isLoading && <Text dimColor>Loading…</Text>}
      {list.error !== undefined && <Text color="red">⚠ {list.error}</Text>}
      {isSearch && !list.isLoading && list.items.length === 0 && list.error === undefined && <Text dimColor>No results</Text>}
      {isSearch
        ? (shown as SearchHit[]).map(hit => (
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
        : channels.items.slice(page * pageSize, (page + 1) * pageSize).map(channel => (
            <Button
              key={`ch:${channel.id}`}
              label={firstLine(`${view?.channelId === channel.id ? '> ' : ''}${channelLabel(channel)}`, width - BUTTON_CHROME)}
              onPress={() => void openView($, client, { kind: 'channel', channelId: channel.id, label: channelLabel(channel) })}
            />
          ))}
      {(hasMoreLoaded || list.cursor !== undefined) && <Button key="more-down" label="▼ More" onPress={() => void pressMoreDown()} />}
    </Box>
  )
}
