# Phoenix Cross Dock WMS

Platform rebuild of the browser-only prototype into a production stack.

**Location:** `D:\phoenix-wms`  
**Kickoff:** Thu Sep 24, 2026  
**Target delivery:** before Oct 1, 2026 (weekdays only)

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js + TypeScript |
| Backend | Express.js + TypeScript |
| Database | MongoDB |
| Auth | JWT (admin / staff / customer) |

## Timeline (working days)

| Date | Focus |
|---|---|
| **Thu Sep 24** | Repo, schema, auth | **Done** |
| **Fri Sep 25** | Core APIs + receive/ship, LPNs, warehouse, invoicing | **Done** |
| **Mon Sep 28** | Frontend parity: customer detail, fee schedule, expected, portal, inventory | **Done** |
| **Tue Sep 29** | Feature verify + QuickBooks if ready | Next |
| **Wed Sep 30** | AWS deploy + handover | — |

**Fallback if Sep 29–30 slips:** core WMS (Phases 1–2) live; QuickBooks + production polish early October.

## MVP assumptions (locked for speed — confirm/override anytime)

1. Live warehouse = **Suite 5, 5,700 SF** at 3550 W Clarendon Ave (not Suite 6/7 from old prototype seed).
2. **SBA** customer: contract **$7,500/mo** (2,500 SF), handling **$20/pallet** (IN+OUT flat), optional **$520 FTL**, no dwell inside dedicated SF; overflow uses Phoenix fee schedule.
3. Staff app first; **customer portal** included as basic (agreement §10 target).
4. Rebuild feature parity with prototype screens; polish secondary to working persistence + billing.
5. QuickBooks deferred to Tue Sep 29 / early Oct if credentials not ready.
6. Official invoices come from QuickBooks; WMS shows the register and print/export reports.

## Quick start

### Prerequisites
- Node 20+
- MongoDB running locally (`mongodb://127.0.0.1:27017`)

### Backend

```bash
cd backend
npm install
cp .env.example .env   # already present for local
npm run seed
npm run dev
```

API: `http://localhost:4000/api/health`

**Seed logins** (change before production):
- `admin@phoenixcrossdock.com` / `ChangeMe123!`
- `david@phoenixcrossdock.com` / `ChangeMe123!` (owner)
- `cesar@phoenixcrossdock.com` / `ChangeMe123!` (staff)
- `sba@sbasite.com` / `ChangeMe123!` (customer portal)

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App: `http://localhost:3000`

## Docs in repo

- `docs/Phoenix_WMS_Rebuild_Plan (3).pdf`
- `docs/contracts/SBA_Warehouse_Handling_Agreement_PDCsigned.pdf`
- `docs/CT_Warehouse_Lease_Proforma_14.xlsx`
- `docs/Marketing project plan1.xlsx`
- `docs/reference/index_33.html` — UI/workflow source of truth
- `assets/phoenix_crossdock_logo.png`

## Day 3 UI (prototype parity)

Staff: Customer detail, Fee Schedule, Shipments, Expected In/Out, inventory detail panel, request approve/cancel.  
Portal (`sba@sbasite.com`): submit inbound/outbound requests + My pallets.

## API surface

- `POST /api/auth/login` · `GET /api/auth/me`
- `GET/POST/PATCH /api/customers` · `GET /api/customers/:id` (summary + pallets/charges/requests)
- `GET/POST/PATCH /api/pallets` (list populates location)
- `GET/POST/PATCH /api/requests`
- `GET /api/shipments` · `POST /api/shipments/receive|ship|expected`
- `GET /api/company/fee-schedule`
- `GET /api/dashboard` · `GET /api/warehouses` · `GET /api/locations` · `GET/POST /api/lpns`
- `GET /api/invoices` (register; QuickBooks sync later) · print/export reports from UI
- `GET /api/customers/:id/billing-report`
