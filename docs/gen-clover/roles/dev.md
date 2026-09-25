# Role guide: Dev

You own **Build**: the code change, its unit tests, its docs, and its test cases in the QA repo.

**Main repo:** the code repo. **Also open:** the QA repo.

## Steps (`/start #n` … `/finish`)

1. **Check the item.** The issue must be status **Approved** (or a Defect the PM prioritised). If not,
   stop and ask the PM.
2. **Branch** from `dev`: `feature/<issue>-<slug>` or `fix/<issue>-<slug>`. In Claude Code on the web, use the session's assigned `claude/<slug>` branch instead; the PR title still starts with the work ID.
3. **Build** following the project's own rules in `CLAUDE.md` (below the Gen Clover header).
4. **Test**: add or update unit tests in the code repo; run the project's checks (test, typecheck,
   lint) and fix failures before opening the PR.
5. **QA cases**: in the QA repo, add or update the test cases and end-to-end tests the item needs,
   tagged `Covers: <work ID>`, on a branch with the same name. Open that PR too.
6. **Docs**: update `CHANGELOG.md` (under *Unreleased*) and any docs the change touches (data contract,
   cutover checklist, README).
7. **PR** into `dev`: title starts with the work ID, body uses the template (`Fixes #<issue>`,
   acceptance criteria checklist, tests run, QA PR link). CI must be green; review by the code owner.
8. **Hours**: log your time on the issue number.

## Checklist

- [ ] Item Approved · branch named · unit tests · QA cases updated (link) · docs + changelog · CI green · hours logged
