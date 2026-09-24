# SEG — Sales Estimates

Web app for planning front-list titles: initial orders, comparable-title sales and laydown
estimates by **distribution channel → organization → account**.

This is a full rebuild of the legacy SEG app (Express + React), redesigned for speed:
the UI never waits on BigQuery, the whole summary is filtered in the browser, and edits autosave
field by field.

## Architecture in one picture

```
            BigQuery (source of truth)
   ┌────────────────────────────────────────────┐
   │ source tables (BIL_*, DIL_*, DTL_*)        │
   │ SEG_TITLE_ACCOUNT_FACTS / SEG_TITLE_STATS  │◄── nightly ingestion SQL (one pass, all titles)
   │ SEG_ESTIMATE_EVENTS  ──► SEG_ESTIMATES_CURRENT (Power BI)
   └───────────────▲───────────────────┬────────┘
     append edits  │                   │ load read model
     (outbox)      │                   ▼
   ┌───────────────┴──────────────────────────────┐
   │ MongoDB — fast, disposable working store      │
   │ titles · title_account_facts · accounts       │
   │ estimates · estimate_events (history+outbox)  │
   └───────────────▲──────────────────────────────┘
                   │  ~20–50 ms queries
   ┌───────────────┴──────────────────────────────┐
   │ Next.js app (apps/web) — UI + API routes      │
   └──────────────────────────────────────────────┘
```

See [docs/architecture.md](docs/architecture.md) for details and decisions.

## Repository

| Path | What |
|---|---|
| `apps/web` | Next.js 16 app: pages, API route handlers (`src/app/api`), server services (`src/server`) |
| `packages/domain` | Business rules — identity keys, roll-up totals, grid building, upload/export rules. Pure TS, unit-tested |
| `packages/data` | Storage contract — Mongo collections/indexes, BigQuery tables and ingestion SQL, row mapping |
| `packages/seed` | Demo data generator (legacy BigQuery layout) and loaders for BigQuery and MongoDB |
| `docs/` | Architecture, data contract, demo data, production cutover |

## Run locally

Requires Node 20.9+.

```bash
npm install
cp .env.example .env.local        # then fill in AUTH_SECRET (and Atlas/GCP when available)

npm run db:local                   # terminal 1: local MongoDB on :27018 (no Atlas needed)
npm run seed:generate -- 2026-09-23  # demo data "as of" a date (reproducible)
npm run seed:mongo                 # load it
npm run dev                        # terminal 2: http://localhost:3000
```

Demo users (password = `DEMO_PASSWORD`): `admin@seg-demo.com`, `editor@seg-demo.com`, `viewer@seg-demo.com`.

## Checks

```bash
npm test          # domain rules
npm run typecheck # all workspaces
npm run lint
```

## Features

- **My Desk** (home): titles due soon without estimates, below goal, without a comparable title,
  changed by others since your last visit, and your @mentions — plus **work group** tabs an admin assigns
  (titles picked by rules). Each person drags tabs into their own order, saved to their account; arrows
  scroll the tabs when there are more than fit.
- **Summary**: filterable catalog with a **Dashboard** view (goal vs estimate by season / division /
  imprint / format, coverage, week-by-week trend), exports, upload with preview, meeting report PDF.
- **Title workspace**: the title's cover image (Firebrand/TMM, with a "No cover available" fallback), spreadsheet-style grid with autosave, conflict handling, undo / redo,
  live updates and presence, comments on the title or any row, and full change history with restore.
- **Ask Abrams**: team chat — Everyone, groups and direct messages with @mentions and ISBN links —
  plus the title comment threads you're part of, in one inbox. Available on every page from the round
  robot button (bottom-right, Alt+A), with the **Abrams Assistant**: ask about deadlines, gaps, a title,
  an ISBN or a season/division and it answers from SEG's own data (rule-based; no AI service).

- **Admin console** (`/admin`, admins only), grouped by module:
  - *People and access* — users, roles, deactivate/reactivate, access by division/imprint (everyone sees all by
    default; restricted people see and change only their divisions/imprints), sessions
    (sign out one device or everywhere, session length), demo accounts on/off.
  - *Planning controls* — season/title locks, **business rules** (switches, checkbox lists and dropdowns
    of real values, with a "preview the effect" count; defaults are exactly the original SEG rules),
    work groups (named My Desk tabs for chosen people, built from rules on any title field), My Desk
    defaults, account catalog, bulk clear/copy with preview.
  - *Data and jobs* — data refresh with Run now, BigQuery sync health, job history and retention, demo reset.
  - *Audit and oversight* — activity log with filters and CSV export, upload log, sign-in log, admin changes.
  - *Ask Abrams and communication* — chat moderation and reports, announcements (banner or post to
    Everyone), assistant settings and unanswered questions, notification defaults.
  - *System* — **product guide** (full user guide with search and PDF download; updated only on request),
    feature switches, maintenance mode (read-only except admins), branding and text, health.

SEG stands for **Seasonal Estimate Grid**. The look follows abramsbooks.com (Abrams red, warm greys);
no third-party APIs are used.

## Branches and environments

| Branch | Vercel environment | MongoDB database | Writes to BigQuery |
|---|---|---|---|
| `main` | Production (client demo) | `seg` | yes (`WRITEBACK=bigquery`) |
| `dev` | Preview (testing before release) | `seg_dev` | no (`WRITEBACK=none`) |
| `feature/*` | Preview | `seg_dev` | no |

Work happens on `feature/*` branches, is merged into `dev` for testing, and reaches `main` once approved.
A new database is filled from BigQuery by calling `/api/jobs/ingest` with `Authorization: Bearer $CRON_SECRET`
(the nightly cron does this for production only).

## Demo vs production

Everything that differs is behind configuration — see [docs/PRODUCTION_CUTOVER.md](docs/PRODUCTION_CUTOVER.md).
