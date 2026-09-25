---
name: uat-build
description: Gen Clover DevOps — promote dev to uat, tag vX.Y.Z-uat.n, deploy and run the regression suite on UAT.
---
Follow `docs/gen-clover/roles/devops.md`. Confirm QA passed for the version (QA run file and no open P1 defects). Open a PR `dev` → `uat` titled `Release v<X.Y.Z>-uat.<n>`; after merge, tag the merge commit `v<X.Y.Z>-uat.<n>` and create a GitHub pre-release with the item list. Check the UAT deployment, trigger the QA regression suite against UAT, and give the PM the report link. Never tag or deploy without the person's confirmation.
