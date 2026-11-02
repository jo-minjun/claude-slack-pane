export function messageLink(domain: string, channelId: string, ts: string, threadTs?: string): string {
  const base = `https://${domain}/archives/${channelId}/p${ts.replace('.', '')}`
  return threadTs === undefined ? base : `${base}?thread_ts=${threadTs}&cid=${channelId}`
}

export type MessageLink = { channelId: string; ts: string; threadTs?: string }

// A Slack message link: `/archives/<channel>/p<ts without its dot>`, a reply's with `thread_ts`.
export function parseMessageLink(text: string): MessageLink | undefined {
  const match = /^https:\/\/[^/\s]+\/archives\/([CDG][A-Z0-9]+)\/p(\d+)(\d{6})(?:\?(\S*))?$/.exec(text)
  if (!match) return undefined
  const [, channelId, seconds, micros, query] = match
  const threadTs = /(?:^|&)thread_ts=(\d+\.\d+)/.exec(query ?? '')?.[1]
  const link = { channelId: channelId!, ts: `${seconds}.${micros}` }
  return threadTs === undefined ? link : { ...link, threadTs }
}

export function domainFromPermalink(permalink: string): string | undefined {
  return /^https:\/\/([^/]+)\/archives\//.exec(permalink)?.[1]
}
