# slack-pane

A Claude Code mod that puts Slack in a pane beside the conversation. Read channels and threads, send messages and images, and quote a Slack message or a whole thread into your next prompt so Claude can read it — without leaving the terminal.

It talks to Slack through the Slack MCP server you already connected to Claude Code. It needs no Slack app and no token of its own.

## Features

- **Two columns.** Left: every channel, private channel, DM and group DM you are in, plus message search. Right: the open channel or thread.
- **Separate scrolling.** Each column scrolls on its own. The mouse wheel moves the column under the pointer. The scroll keys move the messages. When you scroll up, new messages do not move the view; scroll to the bottom to follow the latest again.
- **Search.** Type a query and press Enter. Slack search modifiers work (`in:`, `from:`, `after:`). `☐ From me` is a filter: turn it on (`☑`) to search only your own messages, alone or with a query. A result opens as a thread view; `← #channel` goes to the message's place in the channel.
- **Live view.** Only the open channel or thread is re-read, every 10 seconds by default. The header shows the refresh state (`↻ 10s · 14:05:12`, `↻ updating…`, `⏸ paused`, `⚠ failed …`).
- **Send.** The line above the input says where a message goes (`To #general`, `Reply in thread · #general`). Enter sends at once.
- **Images.** `Attach file` takes a path (dragging a file onto the terminal types its path). `Paste image` sends the image on the clipboard (macOS only).
- **Quote into Claude.** Select a message, then `Quote message` or `Quote thread`. A short reference goes into the prompt box; when you send the prompt, the mod attaches the message or the whole thread as context. Quoted text is marked as untrusted data.
- **Copy link.** Copies the message's Slack link.

## Requirements

- Claude Code 2.1.316 or later.
- The Slack MCP server connected (`/mcp` lists it, by default as `plugin:slack:slack`).
- For the pane beside the conversation: fullscreen mode and a terminal at least 110 columns wide. Narrower, the pane sits above the prompt.
- `curl` for image upload; `osascript` (macOS) for `Paste image`.

## Install

```
/plugin install slack-pane --marketplace jo-minjun/claude-slack-pane
```

Answer `y` to add the marketplace, then pick a scope.

To run it from a clone instead:

```
claude --plugin-dir /path/to/claude-slack-pane
```

## Commands

| Command | What it does |
| --- | --- |
| `/slack-pane [#channel \| @user \| channel ID]` | Without an argument, opens or closes the pane. With one, opens the pane on that channel or DM. |
| `/slack-pane-refresh [seconds]` | Shows the refresh interval, or sets it (5–300 seconds). The value is kept across sessions. |
| `/slack-pane-search <query>` | Opens the pane and searches messages. |

## Settings

| Option | Default | Meaning |
| --- | --- | --- |
| `mcpServer` | `plugin:slack:slack` | The Slack MCP server's name as `/mcp` lists it. |

## Limits

- The Slack MCP returns human-readable text. The mod parses it; a change in that text format can break parsing. The pane then says `Unrecognized Slack response`, and the debug log (`claude --debug`) holds the start of the response.
- No unread markers, no emoji rendering, no reactions.
- Sending has no confirmation step. Check the destination line before pressing Enter.

## Development

```
claude plugin validate .
claude plugin test .
```

`tsconfig.json` extends the types Claude Code writes into `.claude-plugin/types/` once it has loaded the mod; run `tsc -p .` after a first `claude --plugin-dir .` session.

## License

MIT
