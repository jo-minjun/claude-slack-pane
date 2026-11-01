import type { EngineInterface, McpToolResult } from 'claude-code'

import { type ReadChannelOptions, type SlackClient, SlackError } from './client'
import {
  parseChannelList,
  parseChannelMessages,
  parseChannelSearch,
  parseProfile,
  parseSearch,
  parseThread,
  parseUploadTicket,
  unwrap,
} from './parse'

export type McpCall = (tool: string, args: Record<string, unknown>) => Promise<McpToolResult>
export type ReadFile = (path: string) => Promise<string>

// Claude Code swaps a result too large for the model for a notice naming the
// file it saved the result to; the mod reads that file instead.
const SAVED_TO = /saved to (\/\S+?\.(?:txt|json))(?=[.\s]|$)/

async function fromSavedFile(result: McpToolResult, readFile?: ReadFile): Promise<McpToolResult> {
  if (result.isError || readFile === undefined) return result
  const text = result.content.map(block => (block.type === 'text' ? block.text : '')).join('')
  const path = SAVED_TO.exec(text)?.[1]
  if (path === undefined || text.trimStart().startsWith('{')) return result
  const saved = await readFile(path)
  let parsed: unknown
  try {
    parsed = JSON.parse(saved)
  } catch {
    return { content: [{ type: 'text', text: saved }], isError: false }
  }
  if (Array.isArray(parsed)) {
    const inner = parsed.map(block => (block?.type === 'text' ? String(block.text) : '')).join('')
    return { content: [{ type: 'text', text: inner }], isError: false }
  }
  return { content: [{ type: 'text', text: saved }], isError: false }
}

const CHANNEL_TYPES = 'public_channel,private_channel,im,mpim'
const CHANNEL_PAGE_SIZE = 200
const SEARCH_PAGE_SIZE = 20
const DETAILED = 'detailed'

const defined = (args: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(args).filter(([, value]) => value !== undefined))

export function createMcpClient(call: McpCall, readFile?: ReadFile): SlackClient {
  const fields = async (tool: string, args: Record<string, unknown>) => {
    let result: McpToolResult
    try {
      result = await call(tool, defined(args))
    } catch (error) {
      throw new SlackError('not-connected', error instanceof Error ? error.message : String(error))
    }
    try {
      result = await fromSavedFile(result, readFile)
    } catch {
      throw new SlackError('parse', 'Unrecognized Slack response: saved result unreadable')
    }
    return unwrap(result)
  }

  return {
    async me() {
      const { result = '' } = await fields('slack_read_user_profile', { response_format: DETAILED })
      return parseProfile(result)
    },
    async listChannels(cursor) {
      const { result = '' } = await fields('slack_list_user_channels', {
        types: CHANNEL_TYPES,
        exclude_archived: true,
        limit: CHANNEL_PAGE_SIZE,
        cursor,
      })
      return parseChannelList(result)
    },
    async findChannel(name) {
      const { results = '', pagination_info = '' } = await fields('slack_search_channels', {
        keywords: [name],
        natural_language_query: '',
        channel_types: 'public_channel,private_channel',
        limit: SEARCH_PAGE_SIZE,
      })
      return parseChannelSearch(results, pagination_info).items.find(channel => channel.name === name)
    },
    async readChannel(channelId, options: ReadChannelOptions) {
      const { messages = '', pagination_info = '' } = await fields('slack_read_channel', {
        channel_id: channelId,
        limit: options.limit,
        latest: options.latest,
        oldest: options.oldest,
        cursor: options.cursor,
        response_format: DETAILED,
      })
      return parseChannelMessages(messages, pagination_info)
    },
    async readThread(channelId, threadTs, cursor) {
      const { messages = '', pagination_info = '' } = await fields('slack_read_thread', {
        channel_id: channelId,
        message_ts: threadTs,
        cursor,
        response_format: DETAILED,
      })
      return parseThread(messages, pagination_info, threadTs)
    },
    async search(keywords, filters, cursor) {
      const { results = '', pagination_info = '' } = await fields('slack_search_public_and_private', {
        keywords,
        filters,
        sort: 'timestamp',
        limit: SEARCH_PAGE_SIZE,
        include_context: false,
        natural_language_query: '',
        cursor,
        response_format: DETAILED,
      })
      return parseSearch(results, pagination_info)
    },
    async send(channelId, text, threadTs) {
      await fields('slack_send_message', { channel_id: channelId, message: text, thread_ts: threadTs })
    },
    async createUpload(filename, size) {
      const answer = await fields('slack_get_file_upload_url', { filename, content_length: size })
      return parseUploadTicket(Object.values(answer).join('\n'))
    },
    async completeUpload(fileId, channelId, comment, threadTs) {
      await fields('slack_complete_file_upload', {
        file_id: fileId,
        channel_id: channelId,
        initial_comment: comment,
        thread_ts: threadTs,
      })
    },
  }
}

export function slackClient($: EngineInterface, server: string): SlackClient {
  return createMcpClient(
    (tool, args) => $.mcp.call(server, tool, args),
    async path => String(await $.fs.read(path)),
  )
}
