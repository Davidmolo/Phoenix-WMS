#!/usr/bin/env bash
# Deploy / reload Phoenix WMS on this server.
# Does not restart or modify other PM2 processes.
set -euo pipefail

APP_ROOT="/var/www/phoenix-wms"
BRANCH="${BRANCH:-master}"

cd "${APP_ROOT}"

echo "[phoenix-wms] fetching ${BRANCH}"
git fetch origin "${BRANCH}"
git checkout "${BRANCH}"
git reset --hard "origin/${BRANCH}"

echo "[phoenix-wms] install + build API"
cd "${APP_ROOT}/backend"
npm ci
npm run build

echo "[phoenix-wms] install + build Web"
cd "${APP_ROOT}/frontend"
npm ci
# Same-origin /api via nginx when domain is live; works with relative API base
NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-/api}" npm run build

echo "[phoenix-wms] reload PM2 (phoenix apps only)"
mkdir -p "${APP_ROOT}/logs"
cd "${APP_ROOT}"
pm2 startOrReload deploy/ecosystem.config.cjs --update-env
pm2 save

echo "[phoenix-wms] health checks"
sleep 2
curl -fsS "http://127.0.0.1:4020/api/health" || (echo "API health failed" && exit 1)
curl -fsS -o /dev/null -w "web:%{http_code}\n" "http://127.0.0.1:3030/" || true

echo "[phoenix-wms] deploy complete"
pm2 list | grep phoenix || true
