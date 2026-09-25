# Role guide: QA

You own **QA**: confirm every acceptance criterion, find defects before the client does, and produce
the QA report and bug sheet for each release.

**Main repo:** the QA repo (e.g. `gen-clover/seg-qa`). **Also open:** the code repo (to file defects).

## Steps

1. **After each merge to `dev`** — read the automatic run posted on the issue (smoke + affected
   modules). Failures → defect or test fix.
2. **QA round per release** (`/qa-run vX.Y.Z`) — run the regression suite on dev, then the manual checks
   in the test cases and anything automation can't cover (look and feel, phones, copy). Record results
   in `runs/vX.Y.Z.md` (`templates/qa-run.md`).
3. **Defects** (`/bug`) — one Defect issue per problem in the **code repo**: steps, expected, actual,
   test case ID, build, severity, screenshot.
4. **Verify fixes** — when a defect's PR is merged, re-test and close it (or reopen with a note).
5. **Before UAT** — full regression on the UAT build; report `<key>-QA-vX.Y.Z-uat.n`; bug sheet
   (`/bug-sheet vX.Y.Z-uat.n`) for the UAT pack.

## Checklist

- [ ] Every acceptance criterion has a test case · automated report read · manual results recorded ·
      defects filed with test case IDs · fixes verified · bug sheet for UAT · hours logged (QA Task issue)
