---
name: qa-run
description: Gen Clover QA — run a QA round for a version (automated + manual) and record results in runs/<version>.md.
---
Follow `docs/gen-clover/roles/qa.md`. Run the QA repo's regression suite against the named environment (see the QA repo README), collect the results, list the manual checks from the test cases covering this version's work items (`Covers:` lines), and create `runs/<version>.md` from `templates/qa-run.md` for the tester to complete. Summarise failures and suggest which are defects vs. test fixes.
