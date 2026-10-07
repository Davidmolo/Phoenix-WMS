#!/usr/bin/env bash
# One-time server bootstrap for Phoenix WMS.
# Safe: creates isolated dirs/ports; does not modify other PM2 apps or nginx sites.
set -euo pipefail

APP_ROOT="/var/www/phoenix-wms"
REPO_URL="${REPO_URL:-https://github.com/Davidmolo/Phoenix-WMS.git}"
BRANCH="${BRANCH:-master}"

echo "[phoenix-wms] bootstrap → ${APP_ROOT}"

sudo mkdir -p "${APP_ROOT}" /var/www/phoenix-wms/logs
sudo chown -R ubuntu:ubuntu /var/www/phoenix-wms

if [[ ! -d "${APP_ROOT}/.git" ]]; then
  git clone --branch "${BRANCH}" --single-branch "${REPO_URL}" "${APP_ROOT}"
else
  echo "[phoenix-wms] repo already present"
fi

mkdir -p "${APP_ROOT}/backend" "${APP_ROOT}/frontend" "${APP_ROOT}/logs" "${APP_ROOT}/deploy"

# Nginx template (not enabled until domain is set)
if [[ -f "${APP_ROOT}/deploy/nginx.phoenix-wms.conf" ]]; then
  sudo cp "${APP_ROOT}/deploy/nginx.phoenix-wms.conf" /etc/nginx/sites-available/phoenix-wms
  echo "[phoenix-wms] nginx site installed to sites-available (not enabled — domain pending)"
fi

# Env templates if missing
if [[ ! -f "${APP_ROOT}/backend/.env" ]]; then
  cat > "${APP_ROOT}/backend/.env" <<'EOF'
PORT=4020
NODE_ENV=production
MONGODB_URI=REPLACE_ME
JWT_SECRET=REPLACE_ME_WITH_LONG_RANDOM_SECRET
JWT_EXPIRES_IN=7d
CORS_ORIGIN=https://PHOENIX_WMS_DOMAIN
APP_URL=https://PHOENIX_WMS_DOMAIN
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
MAIL_FROM=Phoenix Cross Dock <notifications@phoenixcrossdocks.com>
EOF
  echo "[phoenix-wms] wrote backend/.env template — fill secrets before first start"
fi

if [[ ! -f "${APP_ROOT}/frontend/.env.production" ]]; then
  cat > "${APP_ROOT}/frontend/.env.production" <<'EOF'
NEXT_PUBLIC_API_URL=/api
EOF
fi

echo "[phoenix-wms] bootstrap done"
echo "Next: fill ${APP_ROOT}/backend/.env then run deploy/deploy.sh"
