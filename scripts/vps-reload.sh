#!/usr/bin/env bash
# Run ON the VPS after unzipping a new deploy:
#   bash scripts/vps-reload.sh
set -eu
cd /var/www/ioorganize

# Studio is local-dev only — remove if an older deploy left it on the server
rm -rf src/studio

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