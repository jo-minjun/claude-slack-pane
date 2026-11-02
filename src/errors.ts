import type { EngineInterface } from 'claude-code'

import { SlackError } from './slack/client'
import { updateBanner } from './state'

const NOT_CONNECTED = 'Slack MCP not connected'
// The reason shown after it, its first line cut to fit a banner.
const MAX_REASON = 120

// Returns the line to show where the failed call's result would have been.
export async function reportError($: EngineInterface, error: unknown): Promise<string> {
  if (error instanceof SlackError && error.kind === 'not-connected') {
    $.ui.log(`slack-pane: ${error.message}`, { to: 'debug' })
    const line = `${NOT_CONNECTED}: ${(error.message.split('\n')[0] ?? '').slice(0, MAX_REASON)}`
    await updateBanner($, () => line)
    return line
  }
  if (error instanceof SlackError && error.kind === 'parse') {
    $.ui.log(`slack-pane: ${error.message.slice(0, 200)}`, { to: 'debug' })
    return 'Unrecognized Slack response'
  }
  return error instanceof Error ? error.message : String(error)
}

export async function clearBanner($: EngineInterface): Promise<void> {
  await updateBanner($, () => null)
}
