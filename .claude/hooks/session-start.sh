#!/bin/bash
# Gen Clover session check-in (managed by gen-clover/playbook). Output is added to Claude's context.
set -euo pipefail
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
conf="$root/.claude/gen-clover.env"
KEY="(unknown project)"; PLAYBOOK_VERSION="?"; REPO_ROLE="?"
# shellcheck disable=SC1090
[ -f "$conf" ] && . "$conf"
input="$(cat 2>/dev/null || true)"
source_kind="$(sed -n 's/.*"source" *: *"\([a-z]*\)".*/\1/p' <<<"$input" | head -1)"
if [ "$source_kind" = "resume" ] || [ "$source_kind" = "compact" ]; then
  echo "Gen Clover: resumed session on $KEY — keep the role and work ID already confirmed."
  exit 0
fi
cat <<MSG
Gen Clover session check-in — project $KEY, playbook v$PLAYBOOK_VERSION, this is the $REPO_ROLE repo.
Before doing anything else in this session, confirm: (1) role — PM, Dev, QA or DevOps; (2) person — their name;
(3) work ID or task — e.g. #42 or "v1.1.0 UAT". If the user's first message already gives these
(e.g. "$KEY · Dev · Sam · #42"), confirm in one line and continue. Then read docs/gen-clover/roles/<role>.md
and follow it, together with the rules at the top of CLAUDE.md.
MSG
