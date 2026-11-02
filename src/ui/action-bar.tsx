import type { ElementTable, EngineInterface } from 'claude-code'

import type { Message, View } from '../../types'
import { copyLink, openInSlack, quoteMessage } from '../actions'
import { displayWidth, packedRows } from '../format'
import { openView } from '../poller'
import type { SlackClient } from '../slack/client'

const LABEL = {
  quoteMessage: 'Quote message',
  quoteThread: 'Quote thread',
  openThread: 'Open thread',
  copyLink: 'Copy link',
  openInSlack: 'Open in Slack',
} as const
// The terminal draws a Button as `[ label ]`.
const BUTTON_CHROME = 4

function labels(view: View): string[] {
  return [LABEL.quoteMessage, LABEL.quoteThread, ...(view.kind === 'channel' ? [LABEL.openThread] : []), LABEL.copyLink, LABEL.openInSlack]
}

export function actionBarRows(view: View, width: number): number {
  return packedRows(labels(view).map(label => displayWidth(label) + BUTTON_CHROME), Math.max(1, width))
}

export function actionBar(
  $: EngineInterface,
  client: SlackClient,
  els: ElementTable,
  view: View,
  selected: Message,
) {
  const { Box, Button } = els
  return (
    <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
      <Button key="quote-message" label={LABEL.quoteMessage} onPress={() => void quoteMessage($, 'message', view, selected)} />
      <Button key="quote-thread" label={LABEL.quoteThread} onPress={() => void quoteMessage($, 'thread', view, selected)} />
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
      <Button key="copy-link" label={LABEL.copyLink} onPress={press => void copyLink($, client, view, selected, press.surface)} />
      <Button key="open-in-slack" label={LABEL.openInSlack} onPress={() => void openInSlack($, client, view, selected)} />
    </Box>
  )
}
