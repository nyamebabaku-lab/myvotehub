#!/usr/bin/env bash
# Sets up a NEW, empty Supabase project for MyVoteHub (schema, functions, USSD gateway, auth settings)
# and points the GitHub builds at it. Data is copied separately at move time (see docs/LAUNCH.md).
#
#   NEW_REF=abcd1234 bash scripts/new-project.sh
set -euo pipefail
: "${NEW_REF:?Set NEW_REF to the reference id of the new project}"
TOKEN="${SUPABASE_ACCESS_TOKEN:-$(cat ~/.supabase/access-token)}"
API="https://api.supabase.com/v1/projects/$NEW_REF"
cd "$(dirname "$0")/.."
for f in supabase/migrations/*.sql; do
  echo "→ $f"
  python3 -c "import json,sys; print(json.dumps({'query': open(sys.argv[1]).read()}))" "$f" |
    curl -sf -X POST -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" "$API/database/query" --data @- > /dev/null
done
curl -sf -X PATCH -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" "$API/config/auth" \
  -d '{"mailer_autoconfirm":true,"site_url":"https://nyamebabaku-lab.github.io/myvotehub/"}' > /dev/null
SUPABASE_ACCESS_TOKEN="$TOKEN" npx -y supabase@latest secrets set --env-file supabase/functions/.env --project-ref "$NEW_REF"
SUPABASE_ACCESS_TOKEN="$TOKEN" npx -y supabase@latest functions deploy ussd --project-ref "$NEW_REF" --no-verify-jwt --use-api
ANON=$(curl -sf -H "Authorization: Bearer $TOKEN" "$API/api-keys" | python3 -c 'import sys,json; print(next(k["api_key"] for k in json.load(sys.stdin) if k["name"]=="anon"))')
gh variable set SUPABASE_URL --body "https://$NEW_REF.supabase.co"
gh variable set SUPABASE_ANON_KEY --body "$ANON"
printf 'VITE_SUPABASE_URL=https://%s.supabase.co\nVITE_SUPABASE_ANON_KEY=%s\n' "$NEW_REF" "$ANON" > .env.local
echo "New project ready. Next: copy data, run scripts/setup-email.sh with SUPABASE_REF=$NEW_REF, give the USSD provider the new URL, push to rebuild."
