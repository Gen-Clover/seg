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
  changed by others since your last visit, and your @mentions.
- **Summary**: filterable catalog with a **Dashboard** view (goal vs estimate by season / division /
  imprint / format, coverage, week-by-week trend), exports, upload with preview, meeting report PDF.
- **Title workspace**: spreadsheet-style grid with autosave, conflict handling, undo / redo,
  live updates and presence, comments on the title or any row, and full change history with restore.
- **Messages**: team chat — Everyone, groups and direct messages with @mentions and ISBN links —
  plus the title comment threads you're part of, in one inbox.

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
