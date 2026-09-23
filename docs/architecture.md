# Architecture

## Goals

1. **Speed.** Every click and keystroke must feel instant with real data volumes.
2. **BigQuery is the single source of truth** — for reference data *and* for user-entered estimates
   (the data team reports on them in Power BI).
3. **Demo now, client servers later** with the same code: demo-only pieces sit behind configuration.
4. **Easy to change.** Business rules live in one tested package; the UI and server only call them.

## Data flow

### Reference data (BigQuery → app)

The legacy app ran a very large BigQuery query per title when a user opened it (if the title had not
been refreshed that day). That is the main reason it felt slow.

Now one scheduled SQL pass computes figures for **all** titles:

| Table (app dataset) | Built by | Contents |
|---|---|---|
| `SEG_TITLE_ACCOUNT_FACTS` | `buildFactsSql()` | Per title × account: initial orders, gross, net, ReaderLink POS, membership flags |
| `SEG_TITLE_STATS` | `buildStatsSql()` | Per title: LTD gross units, BookScan LTD, eBook units |

The ingestion job loads these (plus the catalog and valid account combinations) into MongoDB.
The SQL is a faithful port of the legacy per-ISBN queries (`packages/data/src/bigquery.ts`), and a
JavaScript port of the same rules (`packages/seed/src/derive.ts`) is used to cross-check it.

### User edits (app → BigQuery)

1. A cell edit is saved to MongoDB with a **field-level upsert** (`$set` of one field), so two users
   editing different cells never overwrite each other.
2. The same request appends an event to `estimate_events` with `syncedAt: null` — this collection
   is both the **audit history** and the **outbox**.
3. Right after the response, and on a schedule as a safety net, pending events are **appended** to
   BigQuery `SEG_ESTIMATE_EVENTS` (streaming insert with `insertId` = event id, so retries never
   duplicate). Appends avoid BigQuery's DML concurrency limits entirely.
4. The view `SEG_ESTIMATES_CURRENT` exposes the latest value per title / level / account / field for
   Power BI.

MongoDB is therefore a disposable working store: it can be rebuilt from BigQuery at any time.

## MongoDB collections

| Collection | Owner | Notes |
|---|---|---|
| `titles` | ingestion (+ app-owned `plan`, `totals`) | `_id` = ISBN. `inScope` marks summary titles. `totals` are recomputed on every save. |
| `title_account_facts` | ingestion | Index `{isbn, channelId, orgId, accountId}` |
| `accounts` | ingestion | Valid combinations for "Add account" and upload validation |
| `estimates` | app | One doc per title × level × combination; `_id` = `estimateId()` |
| `estimate_events` | app | Append-only history + BigQuery outbox |
| `comments` | app | Comments on a title or a row (`threadKey` = the row's `estimateId`, or `<isbn>|title`). Also the outbox for `SEG_COMMENTS` |
| `chat_rooms` | app | Team chat rooms: `everyone`, groups (`grp:<uuid>`), direct (`dm:<a>|<b>`). Outbox for `SEG_CHAT_ROOMS` |
| `chat_messages` | app | Chat messages (mentions, ISBN links, edits, deletions). Outbox for `SEG_CHAT_MESSAGES` |
| `chat_reads` | app (operational) | When each person last read each room (unread counts) |
| `users` | app | Demo credentials; production uses Entra ID but keeps roles here |
| `notifications` | app (operational) | @mentions and replies per person; not written to BigQuery |
| `presence` | app (operational) | Who has a title open; heartbeat every 5 s, TTL-expired |
| `title_visits` | app (operational) | When each person last opened each title ("changed since your last visit") |
| `trends` | derived | Weekly goal / estimate / 6-month totals per title for the dashboard; recomputed nightly |
| `job_runs` | jobs | Ingestion / write-back / seed runs |

## Business rules (packages/domain)

| Rule | Where |
|---|---|
| Identity: channel, organization and account are identified by **id + name** together | `identity.ts` |
| Roll-up: a level's own value wins; otherwise the sum of the level below | `grid.ts` `rollUp()` |
| Grid rows = title's accounts ∪ comparable-title accounts ∪ any level with a saved estimate | `grid.ts` |
| Only MASSMER and RETINDEP expand to individual accounts (configurable) | `config.ts` |
| Catalog scope: Spring/Fall seasons from 2025, HC/PB/BB, not ARC/Catalog/Display | `config.ts` |
| Estimates are whole, non-negative numbers | `numbers.ts` |
| Upload: totals rows → channel, "All Accounts" → organization, blanks keep values | `upload.ts` |
| Export layout (re-uploadable) | `export.ts` |
| Meeting report rows (channel rows, combined notes) | `report.ts` |
| My Desk lists: due soon, below goal, no comparable | `desk.ts` |
| Past weekly totals, rebuilt from history with the same roll-up | `trends.ts` |

### Deliberate differences from the legacy app

1. **Mixed roll-ups are summed per branch.** Legacy: if *any* organization in a channel had an
   org-level value, all account-level values in that channel were ignored. Now each organization
   contributes its own value, or its accounts' sum if it has none. When every org is set (or none is),
   the result is identical.
2. **An explicit 0 is a value.** Legacy stored "cleared" as 0 and treated 0 as empty, so a planner could
   not enter a real zero. Now a cleared cell is `null`; typing 0 sets 0.
3. **Row membership is derived, not stored.** Legacy kept status flags (0/1/2) on accounts and mutated
   them on each refresh. Now rows are computed from facts + comp facts + estimates on every read.

## Performance design

| Where | How |
|---|---|
| Summary page | The whole in-scope catalog (≈570 demo titles, ~270 KB, gzip ~40 KB) loads once; filtering, cascading facet counts and sorting run in the browser |
| Tables | Virtualized rows (TanStack Virtual) — only visible rows render |
| Title page | One API call, 4 parallel indexed queries (~20–50 ms); grid built in the browser with the shared domain code, so totals update as you type |
| Navigation | Next/previous titles and hovered summary rows are prefetched |
| Saves | Batched after 600 ms; only changed cells are sent; failures retry without losing input |
| Server | One pooled Mongo connection per process; no per-request BigQuery calls |

## Collaboration

| Feature | How |
|---|---|
| **Conflicts** | Every save carries the value the user saw (`expected`). The server writes a cell only if it still holds that value — checked inside the write itself — otherwise it returns a conflict (who / when / their value) and the user chooses *Keep mine* or *Use theirs*. Uploads work the same way, with an "overwrite these cells" option. |
| **Live teamwork** | While a title is open and visible, the browser calls `POST /api/titles/:isbn/live` every 5 s: it records presence (and the cell being edited), records the visit, and returns other viewers plus everything others saved since the last call (read from the history log). Polling needs no extra service and works on serverless hosting; on dedicated servers it can be swapped for WebSockets. |
| **Undo / redo / restore** | Undo replays earlier values as normal edits, so they autosave, show in history and are conflict-checked. History entries can be restored the same way. |
| **Comments** | Title and row threads with @mentions; notifications for mentions and replies. Comments are written back to `SEG_COMMENTS` (append-only versions) and restored by the ingestion job into an empty database. |
| **Team chat** | Messages page: Everyone, groups and direct messages, polled every 3 s while open (no third-party service). @mentions go to the same notification bell; ISBNs in a message link to the title. Title comment threads you're part of are listed under *Title conversations*, so there is one inbox while comments stay attached to their data. Written back to `SEG_CHAT_ROOMS` / `SEG_CHAT_MESSAGES` and restored by ingestion. |
| **Ask Abrams dock** | Round robot launcher on every page (bottom-right, Alt+A) with the unread count; panel with conversations; up to two conversation windows beside it; open windows remembered per browser; "Share" on a title page pre-fills a message; optional desktop alerts via the browser's own Notification API. |
| **Abrams Assistant** | `POST /api/assistant`: `parseAssistantQuery()` (packages/domain, tested) turns a question into an intent — due soon, below goal, no comparable, changed, mentions, a title / ISBN, its history, a season / division / imprint / format, or a title search — answered from MongoDB with the same rules as My Desk. No AI model; nothing leaves the system. |
| **No third-party APIs** | Everything runs on the app, MongoDB and BigQuery. Fonts are bundled at build time. Adding any external service (e-mail, AI, push) needs explicit approval. |

## Security

- Every API route runs through `route()` (`apps/web/src/server/http.ts`): valid session required,
  role checked on the server (viewers cannot write).
- Sessions are signed (HS256) httpOnly cookies. The proxy only does an optimistic redirect for pages.
- Secrets live in environment variables; `.env*`, `.secrets/` and `old/` are git-ignored.
