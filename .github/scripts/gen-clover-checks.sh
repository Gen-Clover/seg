#!/bin/bash
# Gen Clover PR checks (managed by gen-clover/playbook). Inputs come from the workflow's env.
set -uo pipefail
REPO_ROLE=code
[ -f .claude/gen-clover.env ] && . .claude/gen-clover.env
fail=0
bad() { echo "::error::$1"; fail=1; }
ok() { echo "ok: $1"; }

# Promotion PRs (dev -> uat, uat -> main) are releases, not work items.
if { [ "$HEAD" = "dev" ] && [ "$BASE" = "uat" ]; } || { [ "$HEAD" = "uat" ] && [ "$BASE" = "main" ]; }; then
  if [[ "$TITLE" =~ ^Release\ v[0-9]+\.[0-9]+\.[0-9]+(-uat\.[0-9]+)?$ ]]; then ok "release title"; else bad "Promotion PR title must be 'Release vX.Y.Z' or 'Release vX.Y.Z-uat.N'"; fi
  exit $fail
fi

# Playbook sync PRs (scripts/sync.mjs in gen-clover/playbook) carry no work item.
if [[ "$TITLE" =~ ^Playbook\ v[0-9]+\.[0-9]+\.[0-9]+\ sync$ ]]; then
  if [[ "$HEAD" =~ ^(chore/gen-clover-playbook-v[0-9.]+|claude/[A-Za-z0-9._-]+)$ ]]; then ok "playbook sync PR"; else bad "Playbook sync PRs come from chore/gen-clover-playbook-vX.Y.Z or a claude/* session branch"; fi
  exit $fail
fi

if [[ "$TITLE" =~ ^[A-Z]{3}-[A-Z]{3,4}(-[A-Z]{2,6})?-(REQ|CR|BUG|TASK)-[0-9]+:\  ]]; then ok "work ID in title"
else bad "PR title must start with the work ID, e.g. 'ABR-SEG-CR-42: short summary'"; fi

# Claude Code on the web names its own session branches claude/<slug>; the PR title carries the work ID.
if [[ "$HEAD" =~ ^(feature|fix)/[0-9]+-[a-z0-9-]+$ ]] || [[ "$HEAD" =~ ^(chore|docs)/[a-z0-9.-]+$ ]] || [[ "$HEAD" =~ ^claude/[A-Za-z0-9._-]+$ ]]; then ok "branch name"
else bad "Branch must be feature/<issue>-<slug>, fix/<issue>-<slug>, or a claude/* session branch (got '$HEAD')"; fi

if [ "$REPO_ROLE" = "code" ]; then
  if grep -Eiq '(fixes|closes|resolves|refs) #[0-9]+' <<<"$BODY"; then ok "issue link"; else bad "PR body needs 'Fixes #<issue>'"; fi
  if [[ ",$LABELS," == *",no-changelog,"* ]]; then ok "changelog skipped by label"
  elif git diff --name-only "$BASE_SHA" "$HEAD_SHA" | grep -qx 'CHANGELOG.md'; then ok "CHANGELOG.md updated"
  else bad "Update CHANGELOG.md under 'Unreleased' (or add the 'no-changelog' label with a reason in the PR)"; fi
  if grep -Eiq '^- \[x\] QA repo test cases updated' <<<"$BODY" || grep -Eiq 'QA repo test cases updated:.*N/A' <<<"$BODY"; then ok "QA cases"
  else bad "Tick 'QA repo test cases updated' with a link to the QA PR, or write 'N/A — reason'"; fi
else
  if grep -Eq '#[0-9]+' <<<"$BODY"; then ok "work item link"; else bad "PR body must reference the work item, e.g. 'Refs Gen-Clover/seg#42'"; fi
fi
exit $fail
