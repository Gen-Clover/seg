---
name: start
description: Gen Clover Dev — start work on an approved work item (e.g. "/start 42"). Checks approval, creates the branch, plans the change and its tests.
---
Follow `docs/gen-clover/roles/dev.md`.
1. Read issue #$ARGUMENTS in the code repo (use the GitHub tools). Work out the work ID: `<key>-<TYPE>-<number>` from the key in `CLAUDE.md` and the issue's type label.
2. Stop unless the issue is **Approved** (label `status:approved` or the board status), or is a Defect the PM prioritised. Say what's missing.
3. Create `feature/<n>-<slug>` (or `fix/<n>-<slug>` for defects) from the latest `dev` — or, in Claude Code on the web, use the session's assigned `claude/<slug>` branch based on the latest `dev`.
4. Summarise the acceptance criteria and your plan: code changes, unit tests, QA repo test cases (`Covers: <work ID>`), docs and `CHANGELOG.md`. Then build.
5. Remind the person to log time on #<n>.
