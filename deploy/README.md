# Phoenix WMS — production deploy notes

## Isolation (do not disturb other apps)

| App | Web port | API port |
|---|---|---|
| retention-module | 3000 | — |
| trailhead | 3010 | 4010 |
| fuel-optimizer | 3020 | 5000 |
| fuel-staging | — | 4000 |
| **phoenix-wms** | **3030** | **4020** |

App root: `/var/www/phoenix-wms`  
PM2 names: `phoenix-wms-api`, `phoenix-wms-web` only.

## One-time server setup

```bash
# as ubuntu@3.146.118.154
sudo mkdir -p /var/www/phoenix-wms /var/www/phoenix-wms/logs
sudo chown -R ubuntu:ubuntu /var/www/phoenix-wms
```

Fill `/var/www/phoenix-wms/backend/.env` (Mongo Atlas `phoenix_wms` DB, JWT, SMTP).  
Frontend production API base is `/api` (same origin through nginx).

## GitHub Actions secrets

| Secret | Value |
|---|---|
| `PHOENIX_WMS_HOST` | `3.146.118.154` |
| `PHOENIX_WMS_USER` | `ubuntu` |
| `PHOENIX_WMS_SSH_KEY` | private key for deploy user |

Workflow: `.github/workflows/deploy.yml`  
Triggers: push to `master`, or **Actions → Deploy Phoenix WMS → Run workflow**.

## Domain (live)

**https://wms.phoenixcrossdocks.com**

- nginx site: `phoenix-wms` (enabled) · TLS via certbot  
- `CORS_ORIGIN` / `APP_URL` on server: `https://wms.phoenixcrossdocks.com`  
- Deploys do **not** overwrite the live nginx vhost once certbot has configured it  

## Public booking APIs (Darya / marketing site)

**Swagger UI:** https://wms.phoenixcrossdocks.com/api/docs  
**OpenAPI JSON:** https://wms.phoenixcrossdocks.com/api/docs/openapi.json  

No auth. CORS reflects the caller origin (works from phoenixcrossdocks.com).

| Method | Path | Use |
|---|---|---|
| GET | `/api/public/bookings` | Index + quick start |
| GET | `/api/public/bookings/config` | Hours + service types |
| GET | `/api/public/bookings/calendar?year=&month=&serviceType=` | Month availability |
| GET | `/api/public/bookings/slots?date=YYYY-MM-DD&serviceType=` | Day grid — `status: available` = free |
| POST | `/api/public/bookings` | Create website booking |

`serviceType`: `crossdock` (45m) · `drop_and_store` (45m) · `trailer_rework` (60m)

## QuickBooks (Development / sandbox first)

Server env (never commit secrets):

- `QUICKBOOKS_CLIENT_ID`
- `QUICKBOOKS_CLIENT_SECRET`
- `QUICKBOOKS_REDIRECT_URI=https://wms.phoenixcrossdocks.com/api/quickbooks/callback`
- `QUICKBOOKS_ENV=sandbox`
- `QUICKBOOKS_SYNC_ENABLED=true` (default) — background cron pulls invoices into Mongo
- `QUICKBOOKS_SYNC_CRON=*/15 * * * *` — every 15 minutes (override if needed)
- `QUICKBOOKS_SYNC_ON_BOOT=true` — one sync ~15s after API start

In Intuit Developer → app → Keys (Development) → Redirect URIs, add the callback URL above.

Staff flow: **Billing → Connect QuickBooks**. Invoices sync on the cron schedule; **Sync invoices** is always available for an immediate refresh.
