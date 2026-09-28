#!/usr/bin/env bash
# Run ON the VPS after unzipping a new deploy:
#   bash scripts/vps-reload.sh
set -eu
cd /var/www/ioorganize

# Studio is local-dev only — remove if an older deploy left it on the server
rm -rf src/studio

# Local-only ledger dumps / one-shot scripts from older zips (unzip -o does not delete extras)
rm -rf scripts/once
rm -f scripts/*.csv
rm -f \
  scripts/reattach-personal-to-saint-louis.js \
  scripts/fix-dobrakovo-expense.js \
  scripts/convert-isplata-to-expenses.js \
  scripts/convert-prevoz-to-expenses.js
rm -f \
  scripts/fix-*.js \
  scripts/debug-*.js \
  scripts/compare-*.js \
  scripts/patch-*.js \
  scripts/inspect-*.js \
  scripts/held-diff-*.js \
  scripts/simulate-*.js \
  scripts/query-audit-recent.js \
  scripts/audit-claim-breakdown.js \
  scripts/audit-spreadsheet-vs-app.js \
  scripts/check-my-roles.js \
  scripts/cleanup-smoke.js \
  scripts/clear-band-name-notes.js \
  scripts/reassign-events-by-note.js \
  scripts/seed-group-bands.js \
  scripts/send-mock-invite.js \
  scripts/smoke-auth-bands.js \
  scripts/test-finance-math.js

if ! grep -q '^VITE_SUPABASE_ANON_KEY=.\+' .env 2>/dev/null; then
  echo "ERROR: VITE_SUPABASE_ANON_KEY missing/empty in .env"
  echo "Add SUPABASE_URL, SUPABASE_ANON_KEY, VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY then re-run."
  exit 1
fi

if ! grep -q '^SUPABASE_ANON_KEY=.\+' .env 2>/dev/null; then
  echo "ERROR: SUPABASE_ANON_KEY missing/empty in .env"
  exit 1
fi

npm install
npm run build
mkdir -p logs
pm2 reload ioorganize || pm2 start deploy/ecosystem.config.cjs
pm2 save
curl -s http://127.0.0.1:3001/api/health || true
echo
echo "Deploy reload done. Test https://chabar.rs in an incognito window (should show login)."