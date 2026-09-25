---
name: finish
description: Gen Clover Dev — finish a work item: run checks, update changelog/docs/QA cases, open the PRs with the template.
---
Follow `docs/gen-clover/roles/dev.md`.
1. Run the project's checks (tests, typecheck, lint — see `CLAUDE.md`); fix failures.
2. Confirm `CHANGELOG.md` has a line under *Unreleased* with the work ID, and affected docs are updated.
3. Confirm the QA repo has test cases/tests tagged `Covers: <work ID>`; open that PR if not yet open.
4. Open the code PR into `dev`: title `<work ID>: <summary>`, body from `.github/pull_request_template.md` with `Fixes #<n>`, the acceptance checklist, tests run, and the QA PR link.
5. Report the PR links and remind the person to log hours on #<n>.
