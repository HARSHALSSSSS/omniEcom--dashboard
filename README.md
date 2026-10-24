# Unified Dashboard

Multi-vendor commerce operating platform: vendors connect their marketplace accounts (Amazon India, Flipkart, Myntra, Snapdeal) and manage catalogue, inventory, orders, fulfilment, returns, pricing, reports and more from one dashboard.

| Folder | Contents |
| --- | --- |
| `backend/` | Fastify API, background workers, scheduler, PostgreSQL (row-level security per vendor), BullMQ queues, docs, Docker and Kubernetes manifests |
| `frontend/` | React 18 + Vite + TypeScript web app (the dashboard), served by nginx in production |
| `docs/` | Repository-level docs, e.g. [GitHub branch-protection checklist](docs/BRANCH-PROTECTION.md) |
| `.github/` | CI (`ci.yml`), deployment (`deploy.yml`, gated on green CI), CODEOWNERS, Dependabot, PR template |

## Run it locally

Prerequisites: Node 22, pnpm 10 (backend), npm (frontend), Docker (optional: Postgres, Redis, MinIO).

```bash
# backend: API on http://localhost:3000
cd backend
pnpm install
cp .env.example .env
pnpm infra:up && pnpm db:migrate && pnpm db:seed
pnpm dev

# frontend: http://localhost:5173 (Vite proxies /api to the backend)
cd frontend
npm ci
npm run dev
```

No Docker? `cd backend && pnpm test` runs the whole backend suite against an in-process Postgres with the real migrations.

## Checks (what CI runs)

| | Command |
| --- | --- |
| Backend | `pnpm typecheck`, `pnpm lint`, `pnpm check:modules`, `pnpm test`, `pnpm openapi:export` (the committed `backend/docs/api/openapi.json` must be current), `pnpm build` |
| Frontend | `npx tsc -b`, `npm run lint`, `npx vitest run`, `npm run build`, `npm audit --omit=dev` |

## Deploying

Pushing to `main` runs CI, and only if it is green builds immutable images (tag = git SHA) for `api`, `worker`, `scheduler`, `webhook-worker`, `migrate` and `frontend`, then deploys to staging and, after a reviewer's approval, production (migrate job first, then rolling update, then smoke test). Details, the production boot guards, and the go-live checklist of things that need real hosts and credentials: [backend/docs/deployment/DEPLOYMENT.md](backend/docs/deployment/DEPLOYMENT.md). GitHub repository settings the owner must enable: [docs/BRANCH-PROTECTION.md](docs/BRANCH-PROTECTION.md).

## Documentation

- Backend overview and architecture: [backend/README.md](backend/README.md), [backend/docs/README.md](backend/docs/README.md)
- API contract: [backend/docs/api/openapi.json](backend/docs/api/openapi.json), endpoint list [backend/docs/api/ENDPOINTS.md](backend/docs/api/ENDPOINTS.md)
- Frontend integration notes: [backend/docs/integration](backend/docs/integration)
- Frontend app: [frontend/README.md](frontend/README.md)
