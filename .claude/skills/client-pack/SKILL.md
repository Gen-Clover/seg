---
name: client-pack
description: Gen Clover PM — build the client pack (<key>-PACK-yyyy-mm) for a billing period from the time-sheet CSV and the GitHub board.
---
Follow `docs/gen-clover/roles/pm.md`. Inputs: the month (`$ARGUMENTS`, e.g. 2026-10) and the time-sheet CSV export (ask for it). Filter rows by project key. Sum hours by role and by issue; read each issue's title and status from GitHub; list releases in the period (tags + sign-off IDs from the delivery repo). Fill `templates/client-pack.md` and save as `<PROJ>/06-client-packs/<key>-PACK-<yyyy-mm>.md`. Flag rows without an issue number and items marked Released with no hours. Never include rates or amounts.
