export type ChannelKind = 'public' | 'private' | 'im' | 'mpim'
export type Channel = { id: string; name: string; kind: ChannelKind }
export type Message = {
  ts: string
  userId: string
  userName: string
  text: string
  replyCount: number
  threadTs?: string
  hasFile: boolean
}
export type SearchHit = {
  channelId: string
  channelName: string
  ts: string
  threadTs?: string
  userName: string
  text: string
  permalink: string
}
export type Page<T> = { items: T[]; nextCursor?: string }
export type UploadTicket = { uploadUrl: string; fileId: string }
export type View =
  | { kind: 'channel'; channelId: string; label: string; anchorTs?: string }
  | {
      kind: 'thread'
      channelId: string
      label: string
      threadTs: string
      back: { anchorTs?: string }
    }
// The first message row the right column shows: `skip` rows into message `ts`.
export type MessageAnchor = { ts: string; skip: number }
export type Loadable<T> = {
  items: T[]
  cursor?: string
  isLoading: boolean
  error?: string
}
// `top`: index of the first item the column shows.
export type ChannelsState = Loadable<Channel> & { top: number }
export type LeftState = {
  mode: 'channels' | 'search'
  query: string
  filters: string
  fromMe: boolean
  top: number
  results: Loadable<SearchHit>
}
export type Attachment = {
  path: string
  name: string
  size: number
  mime: string
  tempDir?: string
}
export type ComposerState = {
  draft?: string
  isPathMode: boolean
  attachment?: Attachment
  isSending: boolean
  error?: string
}
export type RefreshState = {
  status: 'idle' | 'refreshing' | 'paused' | 'error'
  lastSuccessAt?: number
  failedAt?: number
}

declare module 'claude-code' {
  interface PluginState {
    'slack-pane': {
      channels: Shaped<ChannelsState>
      left: Shaped<LeftState>
      view: Shaped<View | null>
      messages: Shaped<Loadable<Message>>
      selectedTs: string | null
      messageTop: Shaped<MessageAnchor | null>
      composer: Shaped<ComposerState>
      refresh: Shaped<RefreshState>
      intervalSeconds: number
      paneOpen: boolean
      banner: string | null
    }
  }
}
