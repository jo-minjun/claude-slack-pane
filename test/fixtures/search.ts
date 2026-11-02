export const SEARCH = `# Search Results for: 

## Messages (2 results)
### Result 1 of 2
Channel: #backend (ID: C0FAKE0002)
From: Alice Kim <alice@example.com> (ID: U0FAKE0001) 
Time: 2026-10-30 14:49:51 KST
Message_ts: 1793339391.207789
Permalink: [link](https://acme.slack.com/archives/C0FAKE0002/p1793339391207789?thread_ts=1793089818.196009&cid=C0FAKE0002)
Text: 
Reply in a thread
second line

---

### Result 2 of 2
Channel: #general (ID: C0FAKE0001)
From: Bob Lee <bob@example.com> (ID: U0FAKE0002) 
Time: 2026-10-29 09:00:00 KST
Message_ts: 1793232000.000100
Permalink: [link](https://acme.slack.com/archives/C0FAKE0001/p1793232000000100)
Text: 
Top level message

---

`

export const SEARCH_CURSOR = 'For the next page of results use cursor `Q1VSLTI=`\n'

// Assumed: an empty search was not observed.
export const SEARCH_EMPTY = '# Search Results for: nothing\n\n## Messages (0 results)\n'

// Bot authors as observed 2026-11-02: a `  [BOT]` tag, and sometimes no name before the ID.
export const SEARCH_BOTS = `# Search Results for: 

## Messages (2 results)
### Result 1 of 2
Channel: #general (ID: C0FAKE0001)
From: deploy-bot (ID: U0FAKEBOT1)  [BOT]
Time: 2026-10-30 14:49:51 KST
Message_ts: 1793339391.207789
Permalink: [link](https://acme.slack.com/archives/C0FAKE0001/p1793339391207789)
Text: 
Deploy finished

---

### Result 2 of 2
Channel: #general (ID: C0FAKE0001)
From: (ID: U00)  [BOT]
Time: 2026-10-30 14:40:00 KST
Message_ts: 1793338800.000100
Permalink: [link](https://acme.slack.com/archives/C0FAKE0001/p1793338800000100)
Text: 
Nightly report

---

`
