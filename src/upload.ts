import type { EngineInterface } from 'claude-code'

import type { Attachment, View } from '../types'
import type { SlackClient } from './slack/client'

const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
}
const CLIPBOARD_FILE = 'clipboard.png'

export function isImageName(name: string): boolean {
  return MIME[name.split('.').pop()?.toLowerCase() ?? ''] !== undefined
}

export class UploadError extends Error {}

export function normalizePath(raw: string, home: string): string {
  let path = raw.trim()
  if (/^(['"]).*\1$/.test(path)) path = path.slice(1, -1)
  path = path.replace(/\\(.)/g, '$1')
  if (path === '~') return home
  return path.startsWith('~/') ? `${home}${path.slice(1)}` : path
}

async function fileSize($: EngineInterface, path: string): Promise<number | undefined> {
  const result = await $.process.run(['wc', '-c', path])
  if (result.exitCode !== 0) return undefined
  const size = Number(result.stdout.trim().split(/\s+/)[0])
  return Number.isFinite(size) && size > 0 ? size : undefined
}

export async function prepareFile($: EngineInterface, rawPath: string): Promise<Attachment> {
  const home = (await $.env.get('HOME')) ?? ''
  const path = normalizePath(rawPath, home)
  const name = path.split('/').pop() ?? path
  const mime = MIME[name.split('.').pop()?.toLowerCase() ?? '']
  if (mime === undefined) throw new UploadError(`Not an image: ${name}`)
  const size = await fileSize($, path)
  if (size === undefined) throw new UploadError(`File not found: ${rawPath.trim()}`)
  return { path, name, size, mime }
}

export async function removeTemp($: EngineInterface, attachment: Attachment | undefined): Promise<void> {
  if (attachment?.tempDir !== undefined) await $.process.run(['rm', '-rf', attachment.tempDir])
}

export async function prepareClipboard($: EngineInterface): Promise<Attachment> {
  const tempDir = (await $.process.run(['mktemp', '-d'])).stdout.trim()
  const path = `${tempDir}/${CLIPBOARD_FILE}`
  const written = await $.process.run([
    'osascript',
    '-e',
    `set f to open for access POSIX file "${path}" with write permission`,
    '-e',
    'write (the clipboard as «class PNGf») to f',
    '-e',
    'close access f',
  ])
  const size = written.exitCode === 0 ? await fileSize($, path) : undefined
  if (size === undefined) {
    await $.process.run(['rm', '-rf', tempDir])
    throw new UploadError('No image in clipboard')
  }
  return { path, name: CLIPBOARD_FILE, size, mime: MIME.png!, tempDir }
}

export async function sendWithImage(
  $: EngineInterface,
  client: SlackClient,
  view: View,
  text: string,
  attachment: Attachment,
): Promise<void> {
  let ticket
  try {
    ticket = await client.createUpload(attachment.name, attachment.size)
  } catch {
    throw new UploadError('⚠ Upload failed: get URL')
  }
  const posted = await $.process.run([
    'curl',
    '-sS',
    '-f',
    '-X',
    'POST',
    ticket.uploadUrl,
    '-H',
    `Content-Type: ${attachment.mime}`,
    '--data-binary',
    `@${attachment.path}`,
  ])
  if (posted.exitCode !== 0) throw new UploadError('⚠ Upload failed: upload')
  try {
    await client.completeUpload(ticket.fileId, view.channelId, text, view.kind === 'thread' ? view.threadTs : undefined)
  } catch {
    throw new UploadError('⚠ Upload failed: share')
  }
  await removeTemp($, attachment)
}
