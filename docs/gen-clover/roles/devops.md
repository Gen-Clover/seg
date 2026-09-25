# Role guide: DevOps

You own **environments, UAT builds, production releases and maintenance**.

**Main repo:** the code repo. **Also open:** the QA repo and the delivery repo (release pack).

## Steps

1. **UAT build** (`/uat-build vX.Y.Z`) — when QA has passed on `dev`: merge `dev` → `uat` by PR, tag
   `vX.Y.Z-uat.n` (pre-release), deploy to UAT, run the full regression suite against UAT, hand the
   report to the PM. Next UAT round → `-uat.n+1`.
2. **Production release** (`/release vX.Y.Z`) — only with a sign-off ID. Merge the signed-off `uat`
   commit → `main` by PR, tag `vX.Y.Z` on that exact commit, deploy, run the production smoke suite,
   move `CHANGELOG.md` *Unreleased* to the version, publish GitHub release notes (with the sign-off
   ID), draft the release pack `<key>-REL-vX.Y.Z`, add a row to the deliverables register.
3. **Cutover and rollback** — every release notes its config changes, data migrations and the rollback
   step (previous tag + how to restore data).
4. **Maintain** — monthly: dependency updates, backups checked, error logs reviewed, incident log.

## Checklist

- [ ] UAT build tagged + deployed + regression run · sign-off ID present before prod · tag on the
      signed-off commit · smoke test · release notes + changelog · rollback noted · register row · hours logged
