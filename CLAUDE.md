# SEG — notes for contributors and AI assistants

- Monorepo (npm workspaces): `apps/web` (Next.js 16), `packages/domain`, `packages/data`, `packages/seed`.
- Next.js 16 has breaking changes (e.g. `proxy.ts` instead of middleware, async `params`/`cookies`).
  Read `apps/web/AGENTS.md` and the bundled docs in `node_modules/next/dist/docs/` before changing Next code.
- **Business rules belong in `packages/domain`** (with tests), never duplicated in UI or API code.
- **Storage shapes and SQL belong in `packages/data`.** BigQuery source table/column names mirror the
  legacy client tables — see `docs/data-contract.md`.
- Every API route uses `route()` from `apps/web/src/server/http.ts` (session + role checks).
- Demo-only behaviour must be switchable by config and listed in `docs/PRODUCTION_CUTOVER.md`.
- `old/` holds legacy production code (reference only) and is never committed.
- The admin **Product guide** (`apps/web/src/features/admin/guide/content.ts`) is written by hand and
  updated **only when the product owner asks** — never automatically with releases.
- Checks: `npm test`, `npm run typecheck`, `npm run lint`.
