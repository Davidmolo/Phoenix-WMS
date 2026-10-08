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

## QuickBooks

Redirect URI (same for sandbox and production):

`https://wms.phoenixcrossdocks.com/api/quickbooks/callback`

### Sandbox (already used)

- Intuit Developer → app → **Keys → Development**
- Server: `QUICKBOOKS_ENV=sandbox` + Development Client ID / Secret

### Live / Production cutover

1. Intuit Developer → your app → **Keys → Production**
   - Copy **Client ID** and **Client Secret** (Production)
   - Under Redirect URIs, add the same callback URL above (Production keys do not share Dev redirect list)
2. On the API server `.env` (never commit):
   ```
   QUICKBOOKS_CLIENT_ID=<Production Client ID>
   QUICKBOOKS_CLIENT_SECRET=<Production Client Secret>
   QUICKBOOKS_REDIRECT_URI=https://wms.phoenixcrossdocks.com/api/quickbooks/callback
   QUICKBOOKS_ENV=production
   QUICKBOOKS_SYNC_ENABLED=true
   QUICKBOOKS_SYNC_CRON=*/15 * * * *
   QUICKBOOKS_SYNC_ON_BOOT=true
   ```
3. Restart the API (PM2): `pm2 restart phoenix-wms-api` (or your process name)
4. In WMS **Billing**:
   - **Disconnect** the old sandbox connection (if still connected)
   - **Connect QuickBooks** — sign in with the **real** Phoenix QuickBooks Online company
   - **Sync invoices** once; confirm a known live invoice (total vs balance due)
5. Customer matching: same **name** and/or **email** in WMS and QB links accounts; after first sync, `quickbooksCustomerId` holds the link

Optional: keep sandbox invoices in Mongo — they stay until overwritten by matching DocNumbers from live, or clear QB-synced invoices if you want a clean live register.

Staff flow anytime: **Billing → Sync invoices**. Cron keeps Mongo updated every 15 minutes.
