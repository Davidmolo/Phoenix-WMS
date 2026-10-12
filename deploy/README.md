# Phoenix WMS — deploy notes (operators)

Private runbook for people who already have server and CI access.  
**Do not put passwords, API keys, SSH keys, or connection strings in this file.**

## Isolation

Phoenix WMS runs as its own PM2 apps and ports so it does not collide with other services on the same host.

| App | Role |
| --- | --- |
| `phoenix-wms-web` | Next.js frontend |
| `phoenix-wms-api` | Express API |

App root on the server is under `/var/www/phoenix-wms`. Exact ports and nginx config live on the server only.

## One-time setup (high level)

1. Create the app directory and log folder (owned by the deploy user).
2. Copy backend env from `.env.example` → server `backend/.env` and fill secrets there.
3. Set frontend production API base to same-origin `/api` (`NEXT_PUBLIC_API_URL=/api`).
4. Configure nginx + TLS for the public hostname.
5. Start `phoenix-wms-api` and `phoenix-wms-web` with PM2.

## CI / GitHub Actions

Workflow: `.github/workflows/deploy.yml`

Required Actions secrets (names only — values stay in GitHub):

- `PHOENIX_WMS_HOST`
- `PHOENIX_WMS_USER`
- `PHOENIX_WMS_SSH_KEY`

Triggers: push to `master`, or manual **Actions → Deploy Phoenix WMS**.

## Public booking API

Documented for the marketing site (no auth). Paths under `/api/public/bookings` and OpenAPI at `/api/docs`.

Service types: `crossdock` · `drop_and_store` · `trailer_rework` · `pickup`

## QuickBooks Online

OAuth redirect URI (sandbox and production):

`https://wms.phoenixcrossdocks.com/api/quickbooks/callback`

Cutover checklist (secrets only on the server / Intuit console):

1. Create Production keys in Intuit Developer and register the redirect URI.
2. Set `QUICKBOOKS_*` values in server `backend/.env` (`QUICKBOOKS_ENV=production`). Never commit them.
3. Restart `phoenix-wms-api` with updated env.
4. In WMS **Billing**: Disconnect any sandbox connection → Connect live company → Sync invoices.
5. Match customers by name/email; cron can refresh invoices on an interval once configured.

Staff can always run **Billing → Sync invoices** manually.
