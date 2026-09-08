#!/usr/bin/env bash
# Deploy the NIP-05 directory worker (`solidarity-id`) into the Cloudflare
# account that owns the solidarity.gg zone. Idempotent:
#   1. find or create the D1 database `solidarity_id` in that account,
#   2. write its id into wrangler.nip05.jsonc (commit that afterwards),
#   3. apply the `drizzle/` migrations to it,
#   4. deploy the worker onto the solidarity.gg routes,
#   5. probe the three public endpoints.
# Needs a `wrangler login` session with access to that account.
set -euo pipefail

cd "$(dirname "$0")/.."

CONFIG="wrangler.nip05.jsonc"
DB_NAME="solidarity_id"
export CLOUDFLARE_ACCOUNT_ID="$(grep -oE '"account_id":\s*"[0-9a-f]+"' "$CONFIG" | grep -oE '[0-9a-f]{32}')"
UUID_RE='[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

echo "▸ account ${CLOUDFLARE_ACCOUNT_ID}"

# 1. D1 — reuse if it exists, otherwise create it.
db_id="$(bun x wrangler d1 list --json 2>/dev/null \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const rows=JSON.parse(s);const hit=rows.find(r=>r.name===process.argv[1]);process.stdout.write(hit?hit.uuid:"")})' "$DB_NAME")"
if [ -z "$db_id" ]; then
  echo "▸ creating D1 ${DB_NAME}"
  db_id="$(bun x wrangler d1 create "$DB_NAME" 2>&1 | grep -oE "$UUID_RE" | head -1)"
  [ -n "$db_id" ] || { echo "✘ could not read the new database id from wrangler output" >&2; exit 1; }
fi
echo "▸ D1 ${DB_NAME} = ${db_id}"

# 2. Pin the id in the config (the placeholder on first run, or a stale id).
sed -E -i '' "s/(\"database_id\": \")${UUID_RE}(\")/\1${db_id}\2/" "$CONFIG"
grep -q "\"database_id\": \"${db_id}\"" "$CONFIG" || { echo "✘ failed to write database_id into ${CONFIG}" >&2; exit 1; }

# 3. Schema.
bun x wrangler d1 migrations apply "$DB_NAME" --remote -c "$CONFIG"

# 4. Worker + routes.
bun x wrangler deploy --minify -c "$CONFIG"

# 5. Smoke test — every answer must be JSON from the directory, never the
#    landing page's 404.
echo "▸ probing solidarity.gg"
for path in '/.well-known/nostr.json?name=_' '/id/availability?name=probe' '/id/history?name=probe'; do
  printf '  %-40s ' "$path"
  curl -sS -m 20 -o /dev/null -w '%{http_code} %{content_type}\n' "https://solidarity.gg${path}"
done
echo "▸ done — commit ${CONFIG} if the database id changed"
