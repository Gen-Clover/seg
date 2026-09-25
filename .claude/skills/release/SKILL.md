---
name: release
description: Gen Clover DevOps — release a signed-off version to production (tag vX.Y.Z, notes, changelog, release pack, register row).
---
Follow `docs/gen-clover/roles/devops.md`. Require the sign-off ID `<key>-SO-v<X.Y.Z>` (file in the delivery repo). Open a PR `uat` → `main` titled `Release v<X.Y.Z>`, containing exactly the signed-off commit. After merge: tag `v<X.Y.Z>`, move `CHANGELOG.md` *Unreleased* under the version, publish release notes (items, sign-off ID, known issues, rollback), run the production smoke suite, draft `<PROJ>/05-releases/<key>-REL-v<X.Y.Z>.md`, and give the row for the deliverables register. Ask for confirmation before each outward step (merge, tag, deploy).
