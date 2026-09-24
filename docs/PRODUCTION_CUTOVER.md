# Production cutover checklist

Everything that differs between the Vercel demo and the client's servers.
Items marked **(config)** are environment changes only; **(code)** needs a small implementation.

## 1. Data sources

- [ ] **(config)** `GCP_PROJECT_ID` → client project (legacy: `abrams-books-403613`).
- [ ] **(config)** `BQ_SOURCE_DATASET=BUSINESS_INTELLIGENCE_LAYER_PROD`,
      `BQ_APP_DATASET=BUSINESS_INTELLIGENCE_WEBAPP_LAYER_PROD` (or a new dataset for SEG tables).
- [ ] Compare the live source schemas with `SOURCE_TABLES` in `packages/data/src/bigquery.ts` and
      update `docs/data-contract.md`. Known legacy differences to check: `BIL_MF_FACT_SD` vs
      `BIL_MF_FACT_SALES` (legacy used both), date column formats, `PAPER_CUT_OFF`/`LDC` location.
- [ ] Run `buildFactsSql` / `buildStatsSql` against live data; compare a sample of titles with the
      legacy app's numbers.
- [ ] Schedule ingestion nightly (client scheduler or BigQuery scheduled query + app job).
- [ ] **(config)** `WRITEBACK=bigquery`; create `SEG_ESTIMATE_EVENTS` and the `SEG_ESTIMATES_CURRENT` view.
      (`SEG_COMMENTS`, `SEG_CHAT_ROOMS` and `SEG_CHAT_MESSAGES` are created by the app on first use; the service account needs table-create rights
      on the app dataset, or create it up front from `COMMENTS_SCHEMA`.)
- [ ] `SEG_SETTINGS` (admin settings versions) and `SEG_USERS` (users and roles, no passwords) are created by
      the app on first write-back, like the tables above.
- [ ] Schedule `/api/jobs/trends` (or rely on the nightly ingestion, which also refreshes the dashboard trends).
- [ ] If existing Power BI reports read the legacy `BIL_SEG_ESTIMATES` table, add a compatibility view
      with its column names (`Laydown Goal`, `Laydown Estimate`, `6-month Estimate`, `sales notes`, …).
- [ ] Title covers: the workspace shows `https://tme.firebrandtech.com/hna/hnafiles/covers/{isbn}.jpg` (the Firebrand/TMM
      address the Abrams Title app uses; set in **Admin console → Branding and text → Title covers**). The live
      `BIL_BOOKATTRIBUTES.IMAGE_URL` column holds the same addresses: confirm the pattern matches, or switch to
      that column (add it to `SOURCE_TABLES` and the title documents). Missing covers show a "No cover available" panel.
- [ ] **(config)** `MONGODB_URI` → client cluster (network access restricted to the app servers).

## 2. Migrating existing estimates

- [ ] **(code)** Migration script: legacy `dc_ots` documents (`SEGOTISRecords` → `main_*`, `org_*`,
      account fields; `Title`, `eanSelectedValue`) → `estimates`, `titles.plan`, and history events.
      Map `main_pubgoal/org_pub_goal/pub_goal` → `laydownGoal`, `*current_estimate/currEst` →
      `laydownEstimate`, `*supplemental_estimate/suppEst` → `sixMonthEstimate`; legacy `0`/`""` → null.
      `eanSelectedValue` holds a book `_id` — resolve it to the comp ISBN.
- [ ] Dry run on a copy, compare totals per title with the legacy summary page, then run for real.

## 3. Sign-in

- [ ] **(config)** `AUTH_PROVIDER=entra`.
- [ ] **(code)** Entra ID (OIDC) sign-in routes: `/api/auth/entra/start` and `/callback`; on success,
      look up the user's role in `users` (same as today) and call `startSession()`.
- [ ] Register redirect URIs in the client's Azure AD app registration.
- [ ] Add real users and roles in **Admin console → Users** (at least one non-demo admin first), then turn
      demo logins off in **Admin console → Demo accounts**. With `AUTH_PROVIDER=entra` demo users can't sign in anyway.
- [ ] Everyone signs in once more after this release (sessions now carry a session id; older cookies are refused).

## 4. Hosting

- [ ] Build a Docker image (`next build` with `output: "standalone"`), run behind the client's proxy with HTTPS.
- [ ] Set `CRON_SECRET` and call `/api/jobs/writeback` every few minutes and ingestion nightly.
- [ ] **(config)** `MAIN_MENU_URL` → BI landing page (or set it in **Admin console → Branding and text**).

## 5. Demo-only items to remove

- [ ] Demo accounts panel on the sign-in page (`app/login/login-form.tsx`, `DEMO_PASSWORD`) — can be
      switched off in **Admin console → Demo accounts**.
- [ ] **Admin console → Demo reset** exists only with `AUTH_PROVIDER=credentials`; it disappears in production.
- [ ] `packages/seed` is not deployed (keep for development and tests).
