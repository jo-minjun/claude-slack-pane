import type { EngineInterface, Timer } from 'claude-code'

import type { ComposerState, Message, SlackUser } from '../types'
import { COMPOSER_KEY, myUserId, PANE_ID } from './actions'
import type { SlackClient } from './slack/client'
import { readComposer, readMessages, updateComposer } from './state'

// The field tells no cursor, so only an `@query` the text ends in is read. One space may follow a
// query: a Korean syllable reaches the field only once a space ends its composing.
const TRAILING_MENTION = /(?:^|\s)(@([^\s@<>]{0,40}))( ?)$/
const MAX_CANDIDATES = 5
// Typing on within this wait starts no search for the word in between.
const SEARCH_WAIT_MS = 300

export function trailingMention(text: string): { start: number; query: string } | undefined {
  const match = TRAILING_MENTION.exec(text)
  const [whole = '', word = '', query = '', space = ''] = match ?? []
  if (!match || (query === '' && space !== '')) return undefined
  return { start: match.index + whole.length - word.length - space.length, query }
}

// The authors of the open view but me, newest first: whom a reply most likely means.
export function authorsMatching(items: Message[], query: string, me?: string): SlackUser[] {
  const wanted = query.toLowerCase()
  const seen = new Set<string>()
  const users: SlackUser[] = []
  for (const m of [...items].reverse()) {
    // A bot's ID starts with B; a mention names a person.
    if (!/^[UW]/.test(m.userId) || m.userId === me || seen.has(m.userId)) continue
    seen.add(m.userId)
    if (m.userName.toLowerCase().includes(wanted)) users.push({ id: m.userId, name: m.userName })
  }
  return users
}

const withoutMention = ({ mention: _, ...rest }: ComposerState): ComposerState => rest

let searchTimer: Timer | undefined
// Bumped by every new query and pick, so a search that comes back late is dropped.
let generation = 0

function stopSearch() {
  searchTimer?.cancel()
  searchTimer = undefined
  generation += 1
}

export async function trackMention($: EngineInterface, client: SlackClient, text: string): Promise<void> {
  const found = trailingMention(text)
  const current = (await readComposer($)).mention
  if (found === undefined) {
    if (current === undefined) return
    stopSearch()
    await updateComposer($, withoutMention)
    return
  }
  if (current?.query === found.query) {
    if (current.text !== text) await updateComposer($, c => (c.mention ? { ...c, mention: { ...c.mention, text } } : c))
    return
  }
  stopSearch()
  const [messages, me] = await Promise.all([readMessages($), myUserId($, client)])
  const local = authorsMatching(messages.items, found.query, me).slice(0, MAX_CANDIDATES)
  const isSearching = found.query !== ''
  await updateComposer($, c => ({ ...c, mention: { text, query: found.query, candidates: local, isLoading: isSearching } }))
  if (!isSearching) return
  const mine = generation
  searchTimer = $.clock.after(SEARCH_WAIT_MS, () => void searchPeople($, client, found.query, mine))
}

async function searchPeople($: EngineInterface, client: SlackClient, query: string, mine: number): Promise<void> {
  let found: SlackUser[] = []
  try {
    found = await client.searchUsers(query, MAX_CANDIDATES)
  } catch {
    // The view's authors stay the choice when the search fails.
  }
  if (mine !== generation) return
  await updateComposer($, c => {
    if (c.mention?.query !== query) return c
    const shown = new Set(c.mention.candidates.map(u => u.id))
    const candidates = [...c.mention.candidates, ...found.filter(u => !shown.has(u.id))].slice(0, MAX_CANDIDATES)
    return { ...c, mention: { ...c.mention, candidates, isLoading: false } }
  })
}

export async function pickMention($: EngineInterface, user: SlackUser): Promise<void> {
  const mention = (await readComposer($)).mention
  const found = mention === undefined ? undefined : trailingMention(mention.text)
  if (mention === undefined || found === undefined) return
  stopSearch()
  // Slack's own form goes in, so the draft is what is sent and a name of wide characters does not
  // throw the drawn caret off.
  const draft = `${mention.text.slice(0, found.start)}<@${user.id}> `
  // The field shows the drawn draft only when it changes: hold the text as typed, so the picked one is a change.
  await updateComposer($, c => ({ ...c, draft: mention.text }))
  await updateComposer($, c => ({ ...withoutMention(c), draft }))
  // A pick leaves the keys on the pressed button: give them back to the field to type on.
  // Only a convenience: the name is in either way.
  await $.ui.focus({ requestId: PANE_ID, key: COMPOSER_KEY }).catch(() => undefined)
}
