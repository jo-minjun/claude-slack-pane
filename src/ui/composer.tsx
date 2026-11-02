import type { ElementTable, EngineInterface } from 'claude-code'

import type { ComposerState, View } from '../../types'
import { COMPOSER_KEY } from '../actions'
import { pickMention, trackMention } from '../mention'
import { attachFromClipboard, attachFromPath, attachPastedPath, destination, removeAttachment, sendComposer } from '../send'
import { updateComposer } from '../state'
import type { SlackClient } from '../slack/client'

const COMPOSER_ROWS = 3

// After the candidates: an empty query searches no one, so it asks for a name.
function mentionStatus(mention: NonNullable<ComposerState['mention']>): string {
  if (mention.query === '') return 'type a name to search'
  if (mention.isLoading) return 'searching…'
  return mention.candidates.length === 0 ? 'No one found' : ''
}

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
      {composer.error !== undefined && <Text color="red">{composer.error}</Text>}
      {composer.isSending && <Text dimColor>sending…</Text>}
      <Box key="composer-frame" borderStyle="round" borderColor="promptBorder" paddingX={1}>
        <Input
          key={COMPOSER_KEY}
          rows={COMPOSER_ROWS}
          submitLabel="send"
          placeholder={destination(view)}
          value={composer.draft ?? ''}
          onInput={(value: string) => {
            void attachPastedPath($, value)
            void trackMention($, client, value)
          }}
          onSubmit={(value: string) => void sendComposer($, client, view, value)}
        />
      </Box>
      {composer.mention !== undefined && !composer.isPathMode ? (
        // In the attach buttons' row, so the column keeps its height.
        <Box key="mention-row" flexDirection="row" columnGap={1} height={1} overflow="hidden">
          {composer.mention.candidates.map(user => (
            <Button key={`mention:${user.id}`} label={`@${user.name}`} onPress={() => void pickMention($, user)} />
          ))}
          <Text dimColor>{mentionStatus(composer.mention)}</Text>
        </Box>
      ) : composer.isPathMode ? (
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
