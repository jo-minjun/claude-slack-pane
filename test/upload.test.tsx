import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'

import { parseUploadTicket } from '../src/slack/parse'
import { SlackError } from '../src/slack/client'
import { CHANNEL } from './fixtures/channel'
import { CHANNEL_LIST } from './fixtures/channel-list'
import { mcpError } from './fixtures/mcp'
import { PROFILE } from './fixtures/profile'
import { count, engine, ok, run, start, type McpAnswer } from './harness'

const UPLOAD_URL = 'https://files.slack.com/upload/v1/ABC?sig=x%2By'
const slack: McpAnswer = tool => {
  if (tool === 'slack_list_user_channels') return ok({ result: CHANNEL_LIST })
  if (tool === 'slack_read_user_profile') return ok({ result: PROFILE })
  if (tool === 'slack_read_channel') return ok({ messages: CHANNEL, pagination_info: '' })
  if (tool === 'slack_get_file_upload_url') return ok({ result: `Upload URL: ${UPLOAD_URL}\nFile ID: F0FAKE0001\n` })
  return ok({ result: 'ok' })
}

type Run = { argv: readonly string[] }
const processes = (on: On, answer: (argv: readonly string[]) => { exitCode: number; stdout?: string }) => {
  const runs: Run[] = []
  on('process.run', (_, e) => {
    runs.push({ argv: e.argv })
    const { exitCode, stdout = '' } = answer(e.argv)
    return { value: { exitCode, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  return runs
}

const fileSystem = (argv: readonly string[]) => {
  if (argv[0] === 'wc') return argv[2]?.includes('missing') ? { exitCode: 1 } : { exitCode: 0, stdout: `    2048 ${argv[2]}\n` }
  if (argv[0] === 'mktemp') return { exitCode: 0, stdout: '/tmp/slack-pane.X1\n' }
  return { exitCode: 0 }
}

const PANE = {
  plugin: 'slack-pane',
  component: 'Pane',
  requestId: 'slack',
  surface: 'terminal',
  props: { title: 'Slack', isFocused: true, bodyColumns: 120, placement: 'dock', scroll: { offset: 0, bodyRows: 60 }, view: {} },
} as const

test('parseUploadTicket finds url and file id', () => {
  expect(parseUploadTicket(`Upload URL: ${UPLOAD_URL}\nFile ID: F0FAKE0001`)).toEqual({ uploadUrl: UPLOAD_URL, fileId: 'F0FAKE0001' })
  expect(parseUploadTicket(`{"upload_url":"${UPLOAD_URL}","file_id":"F0FAKE0001"}`)).toEqual({ uploadUrl: UPLOAD_URL, fileId: 'F0FAKE0001' })
  let kind = 'none'
  try {
    parseUploadTicket('nothing')
  } catch (error) {
    kind = error instanceof SlackError ? error.kind : 'other'
  }
  expect(kind).toBe('parse')
})

test('attach file expands tilde, keeps spaces and shows the file', async ($, on) => {
  engine(on, slack)
  const runs = processes(on, fileSystem)
  await start($)
  await run($, 'slack-pane', '#general')
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'attach-file' })
  await ui.input({ key: 'attach-path', text: '~/My Pics/a.png' })
  expect(runs[0]?.argv).toEqual(['wc', '-c', '/Users/test/My Pics/a.png'])
  expect(await ui.find({ type: 'Text', text: /a\.png/ })).toBeDefined()
  await ui.press({ key: 'remove-attachment' })
  expect(await ui.find({ key: 'remove-attachment' })).toBeUndefined()
  await ui.unmount()
})

test('dragged paths lose quotes and escapes', async ($, on) => {
  engine(on, slack)
  const runs = processes(on, fileSystem)
  await start($)
  await run($, 'slack-pane', '#general')
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'attach-file' })
  await ui.input({ key: 'attach-path', text: "'/Users/test/My\\ Pics/b.JPG' " })
  expect(runs[0]?.argv).toEqual(['wc', '-c', '/Users/test/My Pics/b.JPG'])
  await ui.unmount()
})

test('missing or non image files are refused before upload', async ($, on) => {
  const { sent } = engine(on, slack)
  processes(on, fileSystem)
  await start($)
  await run($, 'slack-pane', '#general')
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'attach-file' })
  await ui.input({ key: 'attach-path', text: '~/missing.png' })
  expect(await ui.find({ type: 'Text', text: /File not found: ~\/missing\.png/ })).toBeDefined()
  await ui.press({ key: 'attach-file' })
  await ui.input({ key: 'attach-path', text: '/x/a.pdf' })
  expect(await ui.find({ type: 'Text', text: /Not an image: a\.pdf/ })).toBeDefined()
  expect(count(sent, 'slack_get_file_upload_url')).toBe(0)
  await ui.unmount()
})

test('paste image writes clipboard png to a temp dir', async ($, on) => {
  engine(on, slack)
  const runs = processes(on, fileSystem)
  await start($)
  await run($, 'slack-pane', '#general')
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'paste-image' })
  const osa = runs.find(r => r.argv[0] === 'osascript')
  expect(osa?.argv.join(' ')).toContain('«class PNGf»')
  expect(osa?.argv.join(' ')).toContain('/tmp/slack-pane.X1/clipboard.png')
  expect(await ui.find({ type: 'Text', text: /clipboard\.png/ })).toBeDefined()
  await ui.press({ key: 'remove-attachment' })
  expect(runs.some(r => r.argv.join(' ') === 'rm -rf /tmp/slack-pane.X1')).toBe(true)
  await ui.unmount()
})

test('empty clipboard says so and cleans up', async ($, on) => {
  engine(on, slack)
  const runs = processes(on, argv => (argv[0] === 'osascript' ? { exitCode: 1 } : fileSystem(argv)))
  await start($)
  await run($, 'slack-pane', '#general')
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'paste-image' })
  expect(await ui.find({ type: 'Text', text: /No image in clipboard/ })).toBeDefined()
  expect(runs.some(r => r.argv.join(' ') === 'rm -rf /tmp/slack-pane.X1')).toBe(true)
  await ui.unmount()
})

test('sending with an image runs three steps in order', async ($, on) => {
  const { sent } = engine(on, slack)
  const runs = processes(on, fileSystem)
  await start($)
  await run($, 'slack-pane', '#general')
  const ui = await $.ui.mount(PANE)
  await ui.press({ key: 'paste-image' })
  await ui.input({ key: 'composer', text: 'look' })
  const tools = sent.map(s => s.tool).filter(t => t.includes('file_upload') || t === 'slack_send_message')
  expect(tools).toEqual(['slack_get_file_upload_url', 'slack_complete_file_upload'])
  expect(sent.find(s => s.tool === 'slack_get_file_upload_url')?.args).toEqual({ filename: 'clipboard.png', content_length: 2048 })
  expect(runs.find(r => r.argv[0] === 'curl')?.argv).toEqual([
    'curl', '-sS', '-f', '-X', 'POST', UPLOAD_URL, '-H', 'Content-Type: image/png', '--data-binary', '@/tmp/slack-pane.X1/clipboard.png',
  ])
  expect(sent.find(s => s.tool === 'slack_complete_file_upload')?.args).toEqual({
    file_id: 'F0FAKE0001',
    channel_id: 'C0FAKE0001',
    initial_comment: 'look',
  })
  expect(runs.some(r => r.argv.join(' ') === 'rm -rf /tmp/slack-pane.X1')).toBe(true)
  expect(await ui.find({ key: 'remove-attachment' })).toBeUndefined()
  await ui.unmount()
})

for (const [step, setup] of [
  ['get URL', { mcp: 'slack_get_file_upload_url' }],
  ['upload', { curl: true }],
  ['share', { mcp: 'slack_complete_file_upload' }],
] as const) {
  test(`upload failure at ${step} is named and keeps the attachment`, async ($, on) => {
    engine(on, (tool, args) => ('mcp' in setup && tool === setup.mcp ? mcpError('failed') : slack(tool, args)))
    const runs = processes(on, argv => ('curl' in setup && argv[0] === 'curl' ? { exitCode: 22 } : fileSystem(argv)))
    await start($)
    await run($, 'slack-pane', '#general')
    const ui = await $.ui.mount(PANE)
    await ui.press({ key: 'paste-image' })
    await ui.input({ key: 'composer', text: 'look' })
    expect(await ui.find({ type: 'Text', text: new RegExp(`⚠ Upload failed: ${step}`) })).toBeDefined()
    expect(await ui.find({ key: 'remove-attachment' })).toBeDefined()
    expect(runs.some(r => r.argv[0] === 'rm')).toBe(false)
    await ui.unmount()
  })
}
