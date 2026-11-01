import type { EngineInterface } from 'claude-code'

import type { View } from '../types'
import { reportError } from './errors'
import { refreshNow } from './poller'
import type { SlackClient } from './slack/client'
import { readComposer, updateComposer } from './state'
import { prepareClipboard, prepareFile, removeTemp, sendWithImage, UploadError } from './upload'

// Module-level so a second Enter in another dispatch sees the first one.
let isSending = false

export function threadTsOf(view: View): string | undefined {
  return view.kind === 'thread' ? view.threadTs : undefined
}

export function destination(view: View): string {
  return view.kind === 'thread' ? `Reply in thread · ${view.label}` : `To ${view.label}`
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
