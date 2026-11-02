import type { ElementTable, EngineInterface } from 'claude-code'

import type { Message, View } from '../../types'
import { copyLink, openInSlack, quoteMessage } from '../actions'
import { displayWidth, packedRows } from '../format'
import { openView } from '../poller'
import type { SlackClient } from '../slack/client'

const LABEL = {
  quote: 'Quote',
  openThread: 'Open thread',
  copyLink: 'Copy link',
  openInSlack: 'Slack ↗',
} as const
// The terminal draws a Button as `[ label ]`.
const BUTTON_CHROME = 4
const LINK_SEPARATOR = ' · '
// Cells the link buttons take at the end of the selected message's header.
export const HEADER_LINKS_WIDTH = displayWidth(`${LABEL.copyLink}${LINK_SEPARATOR}${LABEL.openInSlack}`)

function labels(view: View): string[] {
  return [LABEL.quote, ...(view.kind === 'channel' ? [LABEL.openThread] : [])]
}

export function actionBarRows(view: View, width: number, withLinks: boolean): number {
  const buttons = labels(view).map(label => displayWidth(label) + BUTTON_CHROME)
  return packedRows([...buttons, ...(withLinks ? [HEADER_LINKS_WIDTH] : [])], Math.max(1, width))
}

export function actionBar(
  $: EngineInterface,
  client: SlackClient,
  els: ElementTable,
  view: View,
  selected: Message,
  withLinks: boolean,
) {
  const { Box, Button } = els
  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
      <Button key="quote" label={LABEL.quote} onPress={() => void quoteMessage($, view, selected)} />
      {view.kind === 'channel' && (
        <Button
          key="open-thread"
          label={LABEL.openThread}
          onPress={() =>
            void openView($, client, {
              kind: 'thread',
              channelId: view.channelId,
              label: view.label,
              threadTs: selected.ts,
              back: view.anchorTs === undefined ? {} : { anchorTs: view.anchorTs },
            })
          }
        />
      )}
      {/* After the buttons, wrapping to the start of a row as they do: right-aligned, a wrapped row stood apart. */}
      {withLinks && (
        <Box key="bar-links" flexDirection="row">
          {headerLinks($, client, els, view, selected)}
        </Box>
      )}
    </Box>
  )
}

// The link controls at the right end of the selected message's header, bold as the action bar's labels.
export function headerLinks($: EngineInterface, client: SlackClient, els: ElementTable, view: View, selected: Message) {
  const { Box, Text, Button } = els
  return (
    <Box flexDirection="row" flexShrink={0}>
      <Button key="copy-link" plain onPress={press => void copyLink($, client, view, selected, press.surface)}>
        <Text bold>{LABEL.copyLink}</Text>
      </Button>
      <Text dimColor>{LINK_SEPARATOR}</Text>
      <Button key="open-in-slack" plain onPress={() => void openInSlack($, client, view, selected)}>
        <Text bold>{LABEL.openInSlack}</Text>
      </Button>
    </Box>
  )
}
