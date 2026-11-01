import type { McpToolResult, On } from 'claude-code'
import type { Engine } from 'claude-code/testing'
import { mock } from 'claude-code/testing'

import { mcpResult } from './fixtures/mcp'

export type Sent = { tool: string; args: Record<string, unknown> }
export type McpAnswer = (tool: string, args: Record<string, unknown>) => McpToolResult | Promise<McpToolResult>

export const NOW = 1793337289_000 + 60 * 60 * 1000

export function engine(on: On, mcp: McpAnswer, store: Record<string, unknown> = {}) {
  const sent: Sent[] = []
  const toasts: string[] = []
  const filled: { text: string; mode?: string }[] = []
  const copied: string[] = []
  const registered: Record<string, unknown>[] = []
  const states: Record<string, unknown> = {}
  on('state.set', (_, e, next) => {
    const write = e as unknown as { plugin: string; key: string; value: unknown }
    const shaped = write.value as { shape?: unknown; value?: unknown } | null
    const value = shaped !== null && typeof shaped === 'object' && 'shape' in shaped ? shaped.value : write.value
    if (write.plugin === 'slack-pane') states[write.key] = value
    return next(e)
  })
  on('command.register', (_, e) => {
    registered.push({ ...e })
    return { value: { command: e.name } }
  })
  const logs: string[] = []
  on('ui.log', (_, e) => {
    logs.push(e.text)
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('prompt.fill', (_, e) => {
    filled.push({ text: e.text, mode: e.mode })
    return { isFilled: true }
  })
  on('ui.copy', (_, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('mcp.call', async (_, e) => {
    sent.push({ tool: e.tool, args: e.args })
    return { value: await mcp(e.tool, e.args) }
  })
  mock.store(on, store)
  mock.env(on, { HOME: '/Users/test' })
  const clock = mock.clock(on, { now: NOW })
  return { sent, toasts, filled, copied, registered, states, logs, clock }
}

export const count = (sent: Sent[], tool: string) => sent.filter(s => s.tool === tool).length

export const ok = (payload: Record<string, string>) => mcpResult(payload)

export async function start($: Engine): Promise<void> {
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
}

export async function run($: Engine, command: string, args = ''): Promise<string | undefined> {
  const result = await $.command.run({
    command,
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 200 },
  })
  return (result as { text?: string }).text
}
