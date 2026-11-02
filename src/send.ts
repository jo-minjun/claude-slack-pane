import type { EngineInterface } from 'claude-code'

import type { View } from '../types'
import { reportError } from './errors'
import { refreshNow } from './poller'
import type { SlackClient } from './slack/client'
import { readComposer, updateComposer } from './state'
import { isImageName, prepareClipboard, prepareFile, removeTemp, sendWithImage, UploadError } from './upload'

// Module-level so a second Enter in another dispatch sees the first one.
let isSending = false

export function threadTsOf(view: View): string | undefined {
  return view.kind === 'thread' ? view.threadTs : undefined
}

// Where Enter sends, as the composer's placeholder says it.
export function destination(view: View): string {
  return view.kind === 'thread' ? `Reply in thread · ${view.label}` : `Message ${view.label}`
}

export async function sendComposer(
  $: EngineInterface,
  client: SlackClient,
  view: View,
  text: string,
): Promise<void> {
  const composer = await readComposer($)
  if (isSending || (text.trim() === '' && composer.attachment === undefined)) return
  isSending = true
  await updateComposer($, c => ({ ...c, draft: text, isSending: true, error: undefined }))
  try {
    if (composer.attachment === undefined) {
      await client.send(view.channelId, text, threadTsOf(view))
    } else {
      await sendWithImage($, client, view, text, composer.attachment)
    }
    await updateComposer($, () => ({ draft: '', isPathMode: false, isSending: false }))
    isSending = false
    await refreshNow($, client)
  } catch (error) {
    const line = error instanceof UploadError ? error.message : '⚠ Send failed'
    if (!(error instanceof UploadError)) await reportError($, error)
    await updateComposer($, c => ({ ...c, draft: text, isSending: false, error: line }))
  } finally {
    isSending = false
  }
}

export async function attachFromPath($: EngineInterface, rawPath: string): Promise<void> {
  try {
    const attachment = await prepareFile($, rawPath)
    await removeTemp($, (await readComposer($)).attachment)
    await updateComposer($, c => ({ ...c, attachment, isPathMode: false, error: undefined }))
  } catch (error) {
    const line = error instanceof Error ? error.message : String(error)
    await updateComposer($, c => ({ ...c, isPathMode: false, error: line }))
  }
}

// A word of the text, quoted or with escaped spaces as a terminal pastes a path.
const WORD = /'[^']*'|"[^"]*"|(?:\\.|[^\s\\'"])+/g
const unquote = (word: string) => (/^(['"]).*\1$/.test(word) ? word.slice(1, -1) : word)

// The first word that names an image file by an absolute or home path.
export function findImagePath(text: string): { word: string; index: number } | undefined {
  for (const match of text.matchAll(WORD)) {
    const path = unquote(match[0])
    if (/^(\/|~\/)/.test(path) && isImageName(path)) return { word: match[0], index: match.index }
  }
  return undefined
}

// The last path word found to be no image file, so the keystrokes after it do not look again.
let notAFile: string | undefined

// A terminal pastes a clipboard image as the path of a file it saved: such a path, of an image that
// exists, becomes the attachment, as `Paste image` makes one, and leaves the text.
export async function attachPastedPath($: EngineInterface, text: string): Promise<void> {
  const found = findImagePath(text)
  if (found === undefined || found.word === notAFile) return
  // The field shows the drawn draft only when it changes: hold the text as typed, so the one without the path is a change.
  await updateComposer($, c => ({ ...c, draft: text }))
  let attachment
  try {
    attachment = await prepareFile($, found.word)
  } catch {
    notAFile = found.word
    return
  }
  const rest = `${text.slice(0, found.index)}${text.slice(found.index + found.word.length)}`.replace(/ {2,}/g, ' ').trim()
  await removeTemp($, (await readComposer($)).attachment)
  await updateComposer($, c => ({ ...c, draft: rest, attachment, isPathMode: false, error: undefined }))
}

export async function attachFromClipboard($: EngineInterface): Promise<void> {
  try {
    const attachment = await prepareClipboard($)
    await removeTemp($, (await readComposer($)).attachment)
    await updateComposer($, c => ({ ...c, attachment, isPathMode: false, error: undefined }))
  } catch (error) {
    const line = error instanceof Error ? error.message : String(error)
    await updateComposer($, c => ({ ...c, error: line }))
  }
}

export async function removeAttachment($: EngineInterface): Promise<void> {
  await removeTemp($, (await readComposer($)).attachment)
  await updateComposer($, c => ({ isPathMode: c.isPathMode, isSending: c.isSending, ...(c.draft === undefined ? {} : { draft: c.draft }) }))
}
