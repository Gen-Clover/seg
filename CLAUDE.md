<!-- gen-clover:start — managed by gen-clover/playbook (scripts/sync.mjs). Edit the playbook, not this block. -->
# Gen Clover project: ABR-SEG (Abrams · Seasonal Estimate Grid)

- **Project key:** `ABR-SEG` · sub-projects: CHAT (Ask Abrams chat and assistant) · this repo: **code repo**
- **Playbook:** v1.0.1 — rules in `docs/gen-clover/` (`WORKFLOW.md`, `ids.md`, `roles/`, `templates/`)
- **Repos:** code `Gen-Clover/seg` · QA `Gen-Clover/seg-qa` · delivery `Gen-Clover/abr-delivery`

## Every session starts with a check-in
Before any other action, confirm three things: **role** (PM, Dev, QA or DevOps), **person** (their
name, for hours and records), and **work ID or task** (e.g. `#42`, `v1.1.0 UAT`). If the first message
already gives them (e.g. `ABR-SEG · Dev · Sam · #42`), confirm in one line and start. Then read
`docs/gen-clover/roles/<role>.md` and follow it. Ask once per session, not on every message.

## Rules that always apply
- Build work only on items with status **Approved** (or a Defect the PM prioritised). Otherwise stop and say so.
- Branches `feature/<issue>-<slug>` or `fix/<issue>-<slug>` from `dev` (in Claude Code on the web, the assigned `claude/<slug>` session branch). Never push to `dev`, `uat` or `main` directly.
- PR titles start with the work ID (`ABR-SEG-CR-42: …`); bodies use the template and `Fixes #<issue>`.
- Update `CHANGELOG.md` (*Unreleased*) and affected docs in the same PR; update the QA repo's test cases for the item.
- Never commit secrets, `.env` files, client data or exports, rates or invoices.
- Remind the person to log hours against the issue number.
- If a Gen Clover rule is unclear or doesn't fit, say so and offer to open a *Playbook feedback* issue in `Gen-Clover/playbook`.
<!-- gen-clover:end -->

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
