import type { Channel, Message, Page, SearchHit, UploadTicket } from '../../types'

export type SlackErrorKind = 'not-connected' | 'tool-error' | 'parse'

export class SlackError extends Error {
  readonly kind: SlackErrorKind

  constructor(kind: SlackErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

export type ReadChannelOptions = {
  latest?: string
  oldest?: string
  cursor?: string
  limit: number
}

export interface SlackClient {
  me(): Promise<string>
  listChannels(cursor?: string): Promise<Page<Channel>>
  findChannel(name: string): Promise<Channel | undefined>
  readChannel(channelId: string, options: ReadChannelOptions): Promise<Page<Message>>
  readThread(channelId: string, threadTs: string, cursor?: string): Promise<Page<Message>>
  search(keywords: string[], filters: string, cursor?: string): Promise<Page<SearchHit>>
  send(channelId: string, text: string, threadTs?: string): Promise<void>
  createUpload(filename: string, size: number): Promise<UploadTicket>
  completeUpload(fileId: string, channelId: string, comment: string, threadTs?: string): Promise<void>
}
