# slack-pane

English | [한국어](README.ko.md)

A Claude Code mod that puts Slack in a pane beside the conversation. Read channels and threads, send messages and images, and quote a Slack message, with its thread, into your next prompt so Claude can read it — without leaving the terminal.

It talks to Slack through the Slack MCP server you already connected to Claude Code. It needs no Slack app and no token of its own.

![The Slack pane: channels and DMs on the left, the open channel on the right, a selected message with its actions](docs/images/pane.png)

## Features

- **Two columns.** Left: every channel, private channel, DM and group DM you are in, channels then DMs, each by name, the open one marked `>` in the accent color, plus message search. Right: the open channel or thread.
- **Separate scrolling.** Each column scrolls on its own. The mouse wheel moves the column under the pointer. The scroll keys move the messages. When you scroll up, new messages do not move the view; `▼ Latest · N newer` above the input goes back to the newest and follows them again.
- **Search.** Type a query and press Enter. Slack search modifiers work (`in:`, `from:`, `after:`). `☐ From me` is a filter: turn it on (`☑`) to search only your own messages, alone or with a query. Each result shows its channel and time, then its author and text; it opens as a thread view, and `← #channel` goes to the message's place in the channel.
- **Slack formatting.** `*bold*`, `_italic_`, `~strike~`, `` `code` ``, code blocks and `>` quotes are drawn as styles, without their markers. A user mention shows the name.
- **Live view.** Only the open channel or thread is re-read, every 10 seconds by default. The header shows the refresh state (`↻ 10s · 14:05:12`, `↻ updating…`, `⏸ paused`, `⚠ failed …`).
- **Send.** The empty input says where a message goes (`Message #general`, `Reply in thread · #general`), and the header names the channel while you type. Enter sends at once.
- **Images.** `Attach file` takes a path (dragging a file onto the terminal types its path). `Paste image` sends the image on the clipboard (macOS only). A path to an existing image file (`/…` or `~/…`, png, jpg, gif, webp) typed or pasted into the message input becomes the attachment and leaves the text, so a terminal that pastes a clipboard image as a saved file's path attaches it too.
- **Quote into Claude.** Select a message (press it again to let it go), then `Quote`. A short reference goes into the prompt box; when you send the prompt, the mod attaches the message's whole thread as context, the quoted message marked `▶`. Quoted text is marked as untrusted data.
- **Copy link · Slack ↗.** At the right of the selected message's header. `Copy link` copies the message's Slack link; `Slack ↗` opens the message in Slack (macOS `open`). Edit or delete a message there: the Slack MCP cannot do either.

## Screenshots

**Quote into Claude.** `Quote` puts a reference into the prompt; Claude reads the whole thread when the prompt is sent.

![A quoted thread in the prompt and Claude's summary of it](docs/images/quote.png)

**Search.** `☑ From me` keeps your own messages; a DM shows whom it is with.

![Search results for "release" with From me on](docs/images/search.png)

**Images.** A pasted image becomes the attachment under the input, and is sent with the message.

![An image attached under the message input](docs/images/attach.png)

![The message and its image in Slack](docs/images/attach-slack.png)

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
| `/slack-pane [#channel \| @user \| channel ID \| message link]` | Without an argument, opens or closes the pane. With a channel or DM, opens the pane on it. With a Slack message link, opens the message at its place in the channel, or a reply in its thread. |
| `/slack-pane-refresh [seconds]` | Shows the refresh interval, or sets it (5–300 seconds). The value is kept across sessions. |
| `/slack-pane-search <query>` | Opens the pane and searches messages. |

## Settings

| Option | Default | Meaning |
| --- | --- | --- |
| `mcpServer` | `plugin:slack:slack` | The Slack MCP server's name as `/mcp` lists it. |

## Limits

- The Slack MCP returns human-readable text. The mod parses it; a change in that text format can break parsing. The pane then says `Unrecognized Slack response`, and the debug log (`claude --debug`) holds the start of the response.
- No unread markers, no emoji rendering, no reactions.
- A user mention shows the name Slack sends with it. A user-group mention, or a user mention sent without a name, shows its ID (`@subteam^S…`, `@U…`): the Slack MCP cannot look up group names.
- A line longer than the message or search input is cut with `…` and does not wrap, and the cursor can show past the field: Claude Code's input field draws it so.
- No editing or deleting messages in the pane; `Slack ↗` takes you to the message.
- Sending has no confirmation step. Check the header before pressing Enter.

## Development

```
claude plugin validate .
claude plugin test .
```

`tsconfig.json` extends the types Claude Code writes into `.claude-plugin/types/` once it has loaded the mod; run `tsc -p .` after a first `claude --plugin-dir .` session.

## License

MIT
