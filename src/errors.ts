import type { EngineInterface } from 'claude-code'

import { SlackError } from './slack/client'
import { updateBanner } from './state'

const NOT_CONNECTED = 'Slack MCP not connected'

// Returns the line to show where the failed call's result would have been.
export async function reportError($: EngineInterface, error: unknown): Promise<string> {
  if (error instanceof SlackError && error.kind === 'not-connected') {
    await updateBanner($, () => NOT_CONNECTED)
    return NOT_CONNECTED
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
