import type { EngineInterface } from 'claude-code'
import { atom, read, update } from 'claude-code'

import type { ChannelsState, ComposerState, LeftState, Loadable, Message, RefreshState, View } from '../types'

// Bump a shape tag when that value's fields change: a reload keeps old values.
const SHAPE = { shape: 'v1' } as const

const emptyChannels: ChannelsState = { items: [], isLoading: false, top: 0 }
const emptyLeft: LeftState = {
  mode: 'channels',
  query: '',
  filters: '',
  fromMe: false,
  top: 0,
  results: { items: [], isLoading: false },
}
const emptyMessages: Loadable<Message> = { items: [], isLoading: false }
const emptyComposer: ComposerState = { isPathMode: false, isSending: false }
const idle: RefreshState = { status: 'idle' }

const channels = atom({ plugin: 'slack-pane', key: 'channels' } as const, emptyChannels, { shape: 'v2' } as const)
const left = atom({ plugin: 'slack-pane', key: 'left' } as const, emptyLeft, { shape: 'v3' } as const)
const view = atom({ plugin: 'slack-pane', key: 'view' } as const, null as View | null, SHAPE)
const messages = atom({ plugin: 'slack-pane', key: 'messages' } as const, emptyMessages, SHAPE)
const selectedTs = atom({ plugin: 'slack-pane', key: 'selectedTs' } as const, null as string | null)
// The newest message the right column shows at its bottom; null follows the latest.
const messageBottomTs = atom({ plugin: 'slack-pane', key: 'messageBottomTs' } as const, null as string | null)
const composer = atom({ plugin: 'slack-pane', key: 'composer' } as const, emptyComposer, SHAPE)
const refresh = atom({ plugin: 'slack-pane', key: 'refresh' } as const, idle, SHAPE)
const intervalSeconds = atom({ plugin: 'slack-pane', key: 'intervalSeconds' } as const, 10)
const paneOpen = atom({ plugin: 'slack-pane', key: 'paneOpen' } as const, false)
const banner = atom({ plugin: 'slack-pane', key: 'banner' } as const, null as string | null)

// The engine's scan only accepts atoms declared in the calling file, so every
// read and write of these values goes through the functions below.
type $ = EngineInterface
export function readChannels($: $) {
  return read($, channels)
}
export function updateChannels($: $, fn: (value: ChannelsState) => ChannelsState) {
  return update($, channels, fn)
}
export function readLeft($: $) {
  return read($, left)
}
export function updateLeft($: $, fn: (value: LeftState) => LeftState) {
  return update($, left, fn)
}
export function readView($: $) {
  return read($, view)
}
export function updateView($: $, fn: (value: View | null) => View | null) {
  return update($, view, fn)
}
export function readMessages($: $) {
  return read($, messages)
}
export function updateMessages($: $, fn: (value: Loadable<Message>) => Loadable<Message>) {
  return update($, messages, fn)
}
export function readSelectedTs($: $) {
  return read($, selectedTs)
}
export function updateSelectedTs($: $, fn: (value: string | null) => string | null) {
  return update($, selectedTs, fn)
}
export function readMessageBottomTs($: $) {
  return read($, messageBottomTs)
}
export function updateMessageBottomTs($: $, fn: (value: string | null) => string | null) {
  return update($, messageBottomTs, fn)
}
export function readComposer($: $) {
  return read($, composer)
}
export function updateComposer($: $, fn: (value: ComposerState) => ComposerState) {
  return update($, composer, fn)
}
export function readRefresh($: $) {
  return read($, refresh)
}
export function updateRefresh($: $, fn: (value: RefreshState) => RefreshState) {
  return update($, refresh, fn)
}
export function readIntervalSeconds($: $) {
  return read($, intervalSeconds)
}
export function updateIntervalSeconds($: $, fn: (value: number) => number) {
  return update($, intervalSeconds, fn)
}
export function readPaneOpen($: $) {
  return read($, paneOpen)
}
export function updatePaneOpen($: $, fn: (value: boolean) => boolean) {
  return update($, paneOpen, fn)
}
export function readBanner($: $) {
  return read($, banner)
}
export function updateBanner($: $, fn: (value: string | null) => string | null) {
  return update($, banner, fn)
}
