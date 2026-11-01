import type { Register } from 'claude-code'

import { attachPromptQuotes, PANE_ID } from '../src/actions'
import { runPaneCommand, runRefreshCommand, runSearchCommand } from '../src/commands'
import { restartTimer, stopTimer } from '../src/poller'
import { slackClient } from '../src/slack/mcp-client'
import { renderPane } from '../src/ui/pane'
import { updateIntervalSeconds, updatePaneOpen } from '../src/state'

const DEFAULT_SERVER = 'plugin:slack:slack'

export const register: Register = (on, options) => {
  const server = typeof options.mcpServer === 'string' ? options.mcpServer : DEFAULT_SERVER

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await $.command.register({
      name: 'slack-pane',
      description: 'Open or close the Slack pane, or open a channel in it',
      argumentHint: '[#channel | @user | channel ID]',
      immediate: true,
    })
    await $.command.register({
      name: 'slack-pane-refresh',
      description: 'Show or set the Slack pane refresh interval in seconds',
      argumentHint: '[seconds]',
      immediate: true,
    })
    await $.command.register({
      name: 'slack-pane-search',
      description: 'Search Slack messages in the Slack pane',
      argumentHint: '<query>',
      immediate: true,
    })
    const stored = await $.store.get('refreshSeconds')
    if (typeof stored === 'number') await updateIntervalSeconds($, () => stored)
    // A reload drops the old module's timers; resume polling for a pane left open.
    await restartTimer($, slackClient($, server))
    return started
  })

  on('command.run', { command: 'slack-pane' }, async ($, e) => ({
    text: await runPaneCommand($, slackClient($, server), e.args),
  }))
  on('command.run', { command: 'slack-pane-refresh' }, async ($, e) => ({
    text: await runRefreshCommand($, slackClient($, server), e.args),
  }))
  on('command.run', { command: 'slack-pane-search' }, async ($, e) => ({
    text: await runSearchCommand($, slackClient($, server), e.args),
  }))

  on('ui.render', { component: 'Pane', requestId: PANE_ID }, ($, e) => renderPane($, e, slackClient($, server)))

  on('prompt.submit', async ($, e, next) => {
    if (e.command !== undefined) return next(e)
    const context = await attachPromptQuotes($, slackClient($, server), e.text)
    return context.length === 0 ? next(e) : next({ ...e, context: [...(e.context ?? []), ...context] })
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE_ID) {
      stopTimer()
      await updatePaneOpen($, () => false)
    }
    return next(e)
  })
}
