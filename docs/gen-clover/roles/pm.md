# Role guide: PM

You own **Discover, Define, UAT, Measure** and the client relationship: scope, approvals, sign-offs,
reports and the client pack before each invoice.

**Main repo:** the client's delivery repo (e.g. `gen-clover/abr-delivery`). **Also open:** the code repo
(to create and read issues).

## Steps

1. **Discover** (`/discover`) — kick-off call, then a discovery brief `<key>-DISC-nn` from
   `templates/discovery-brief.md` in `<PROJ>/01-discovery/`. Send it; file the client's written
   confirmation next to it. Log time on the discovery Task issue.
2. **Define** (`/define`) — for each piece of work, open a code-repo issue with the right template
   (Requirement, Change request, Defect or Task — see WORKFLOW.md for how to choose), with acceptance
   criteria and an estimate. Group approved items into a milestone (the release, e.g. `v1.1.0`).
   Send the list and estimates to the client; record approval (date, who, how) in each issue and set
   status **Approved**. Nothing is built before this.
3. **During build** — answer questions in the issues; keep the board current; raise risks early.
4. **UAT** (`/uat-notes`) — once DevOps has deployed `vX.Y.Z-uat.n`, run the UAT call; write
   `<key>-UAT-vX.Y.Z-uat.n` from `templates/uat-notes.md`; classify every point (defect / CR / REQ /
   no action). When accepted, file the sign-off `<key>-SO-vX.Y.Z` (`templates/signoff.md`) in
   `04-signoffs/`.
5. **After release** — release pack `<key>-REL-vX.Y.Z` in `05-releases/` (DevOps drafts it).
6. **Billing period** (`/client-pack yyyy-mm`) — export hours from the time sheet, build
   `<key>-PACK-yyyy-mm`, review, export to PDF, raise the invoice quoting the pack ID.
7. **Monthly** — monthly report `<key>-MR-yyyy-mm` (usage, issues, feedback, plan).

## Checklist

- [ ] Brief confirmed by the client in writing
- [ ] Every work item typed, estimated, with acceptance criteria, and **Approved** before build
- [ ] Every UAT point classified; sign-off filed before production
- [ ] Client pack sent with every invoice
- [ ] Your own hours logged daily (PM Task issue for the month)
