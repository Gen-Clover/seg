---
name: bug-sheet
description: Gen Clover QA — build the bug sheet for a version or UAT build from the Defect issues.
---
Follow `docs/gen-clover/roles/qa.md`. List Defect issues in the code repo for the milestone/version given: work ID, title, severity, status, test case, found in (build), fixed in (PR/version). Save as `reports/<key>-BUGS-<version>.md` in the QA repo (and a copy under `<PROJ>/03-uat/` in the delivery repo when it's for UAT). The issues remain the source of truth.
