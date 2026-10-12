# Phoenix Cross Dock WMS

Warehouse management system for Phoenix Cross Dock — receive, store, ship, yard jobs, bookings, billing, and customer portal.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | Next.js + TypeScript |
| Backend | Express.js + TypeScript |
| Database | MongoDB |
| Auth | JWT (admin / staff / customer) |

## Local development

### Prerequisites

- Node 20+
- MongoDB available locally or via a connection string in `backend/.env`

### Backend

```bash
cd backend
npm install
cp .env.example .env   # fill values locally — never commit .env
npm run seed           # optional demo data
npm run dev
```

API health check defaults to `http://localhost:4000/api/health` (or the port in your `.env`).

Seed users are created from `backend` seed scripts for local use only. Change all passwords before any shared or production environment.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

App defaults to `http://localhost:3000`. Set `NEXT_PUBLIC_API_URL` if the API is not on the default local URL.

## Production notes

- Keep secrets in server `.env` / CI secret stores only — never in git.
- Production frontend should call the API via same-origin `/api` (see `frontend/.env.production`).
- Deploy runbooks live under `deploy/` for operators with server access.

## Repo layout

| Path | Purpose |
| --- | --- |
| `backend/` | Express API |
| `frontend/` | Next.js app |
| `deploy/` | Operator deploy notes (no credentials) |
| `docs/` | Internal planning / reference materials |
