import type { ElementTable, EngineInterface } from 'claude-code'

import type { ComposerState, View } from '../../types'
import { attachFromClipboard, attachFromPath, destination, removeAttachment, sendComposer } from '../send'
import { updateComposer } from '../state'
import type { SlackClient } from '../slack/client'

export function composerBox(
  $: EngineInterface,
  client: SlackClient,
  els: ElementTable,
  view: View,
  composer: ComposerState,
) {
  const { Box, Text, Button } = els
  const Input = 'Input' in els ? (els as ElementTable<'terminal'>).Input : undefined
  if (!Input) return <Text dimColor>{destination(view)}</Text>
  return (
    <Box flexDirection="column">
      <Text dimColor>{destination(view)}</Text>
      {composer.error !== undefined && <Text color="red">{composer.error}</Text>}
      {composer.isSending && <Text dimColor>sending…</Text>}
      <Box key="composer-frame" borderStyle="round" borderColor="promptBorder" paddingX={1}>
        <Input
          key="composer"
          rows={3}
          submitLabel="send"
          placeholder={view.kind === 'thread' ? 'Reply in thread' : `Message ${view.label}`}
          value={composer.draft ?? ''}
          onSubmit={(value: string) => void sendComposer($, client, view, value)}
        />
      </Box>
      {composer.isPathMode ? (
        <Box flexDirection="row" columnGap={1}>
          <Input key="attach-path" placeholder="/path/to/image.png" submitLabel="attach" autoFocus onSubmit={(value: string) => void attachFromPath($, value)} />
          <Button key="cancel-attach" label="Cancel" onPress={() => void updateComposer($, c => ({ ...c, isPathMode: false }))} />
        </Box>
      ) : (
        <Box flexDirection="row" columnGap={1}>
          <Button key="attach-file" label="Attach file" onPress={() => void updateComposer($, c => ({ ...c, isPathMode: true, error: undefined }))} />
          <Button key="paste-image" label="Paste image" onPress={() => void attachFromClipboard($)} />
          {composer.attachment !== undefined && <Text>{composer.attachment.name}</Text>}
          {composer.attachment !== undefined && <Button key="remove-attachment" label="×" onPress={() => void removeAttachment($)} />}
        </Box>
      )}
    </Box>
  )
}
