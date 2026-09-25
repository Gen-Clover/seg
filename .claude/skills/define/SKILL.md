---
name: define
description: Gen Clover PM — turn requests into typed, estimated work items (GitHub issues) and a scope/estimate document for client approval.
---
Follow `docs/gen-clover/roles/pm.md` and the classification rule in `docs/gen-clover/WORKFLOW.md`.
1. For each request, decide Requirement / Change request / Defect / Task and say why in one line.
2. Draft each issue with the matching template: problem or goal, acceptance criteria, estimate (hours, with a range if unsure), priority, milestone (release version). Show the drafts; create the issues in the code repo only after the PM confirms.
3. Write `<PROJ>/02-scope/<key>-SCOPE-<nn>.md` from `templates/scope.md` listing the items with their work IDs and estimates, for the client's approval.
4. When the PM reports approval, record it in each issue (who, when, how) and set the status to Approved.
