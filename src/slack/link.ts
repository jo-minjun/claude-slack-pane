export function messageLink(domain: string, channelId: string, ts: string, threadTs?: string): string {
  const base = `https://${domain}/archives/${channelId}/p${ts.replace('.', '')}`
  return threadTs === undefined ? base : `${base}?thread_ts=${threadTs}&cid=${channelId}`
}

export function domainFromPermalink(permalink: string): string | undefined {
  return /^https:\/\/([^/]+)\/archives\//.exec(permalink)?.[1]
}
