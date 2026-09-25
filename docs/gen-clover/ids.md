# Codes and IDs

Every ID starts with the **project key**; every work item's number **is its GitHub issue number**, so
there is no separate counter.

## Codes

| Level | Rule | Example |
|---|---|---|
| Client | 3 letters, fixed for life | `ABR` (Abrams) |
| Project | 3–4 letters, unique per client | `SEG` |
| Sub-project (optional) | 3–6 letters, only for separate streams | `CHAT` (Ask Abrams) |

**Project key** = `CLIENT-PROJ` (`ABR-SEG`), or `CLIENT-PROJ-SUB` (`ABR-SEG-CHAT`) for sub-project work.
Codes are defined in [`registry/`](registry/) and copied into each project repo's `CLAUDE.md` header.

## `#42`

GitHub numbers issues automatically per repo. Work IDs reuse that number: `ABR-SEG-CR-42` **is** issue
`#42` in the project's code repo. `Fixes #42` in a PR closes it on merge.

## Formats

| Artefact | Lives in | Format | Example |
|---|---|---|---|
| Project | Registry | `GC-<key>` | `GC-ABR-SEG` |
| Requirement | Code repo issue | `<key>-REQ-<issue>` | `ABR-SEG-REQ-51` |
| Change request | Code repo issue | `<key>-CR-<issue>` | `ABR-SEG-CHAT-CR-42` |
| Defect | Code repo issue | `<key>-BUG-<issue>` | `ABR-SEG-BUG-57` |
| Task | Code repo issue | `<key>-TASK-<issue>` | `ABR-SEG-TASK-61` |
| Branch | Code repo | `feature/<issue>-<slug>` or `fix/<issue>-<slug>`; Claude Code on the web uses its own `claude/<slug>` session branch, which is accepted (the PR title carries the work ID) | `fix/42-room-preview` |
| Pull request | Code repo | Title starts with the work ID; body has `Fixes #<issue>` | `ABR-SEG-CHAT-CR-42: room preview after delete` |
| Test case | QA repo | `TC-<MODULE>-<nnn>` (reports: `<key>-TC-…`) | `TC-CHAT-012` |
| QA run report | QA repo | `<key>-QA-<version or date>` | `ABR-SEG-QA-v1.1.0-uat.1` |
| Phase documents | Delivery repo | `<key>-<TYPE>-<nn or version or yyyy-mm>`; TYPE = DISC, SCOPE, ADR, UAT, SO, REL, PACK, MR | `ABR-SEG-DISC-01`, `ABR-SEG-SO-v1.1.0`, `ABR-SEG-PACK-2026-10` |
| Release | Code repo tag | `v<major>.<minor>.<patch>` | `v1.1.0` |
| UAT build | Code repo tag (pre-release) | `v<version>-uat.<n>` | `v1.1.0-uat.1` |
| Invoice | Accounting tool | `GC-INV-<year>-<nnn>` | `GC-INV-2026-007` |

IDs never change and are never reused; cancelled items keep their ID with status *Cancelled*.

## Versions

- **Major** `v2.0.0` — a new contract phase, or a change the client must plan for.
- **Minor** `v1.1.0` — a planned release (one milestone).
- **Patch** `v1.1.1` — fixes only.
- **UAT build** `v1.1.0-uat.1` — the first build of v1.1.0 given to the client for acceptance. Problems
  found → fixes → `v1.1.0-uat.2`. The build the client signs off is tagged `v1.1.0` **unchanged** and
  released to production.
