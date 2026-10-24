# Frontend (Omni Ecom Dashboard)

React 18, TypeScript, Vite, Tailwind, Radix UI, TanStack Query/Table, React Router 6, Zustand, Zod, Vitest + Testing Library + MSW.

## Develop

```bash
npm ci
npm run dev          # http://localhost:5173
```

The browser talks to the API on its own origin (`/api/v1`). In development Vite forwards `/api` to `VITE_PROXY_TARGET` (default `http://localhost:3000`), so there is no CORS to configure. Start the backend first (`cd ../backend && pnpm dev`).

## Scripts

| | |
| --- | --- |
| `npm run dev` | dev server |
| `npx tsc -b` | typecheck (app + node tsconfigs). Note: `npm run type-check` uses the root solution tsconfig and checks nothing; `npm run build` runs `tsc -b` |
| `npm run lint` | ESLint, zero warnings allowed |
| `npx vitest run` | unit and component tests (`npm test` starts watch mode) |
| `npm run build` | type check, then production bundle in `dist/` |

## Configuration

`VITE_*` variables are compiled into the bundle (public, never put secrets here). Files: `.env.development`, `.env.staging`, `.env.production`.

| Variable | Meaning |
| --- | --- |
| `VITE_API_BASE_URL` | API base path, `/api/v1` (same origin). Production uses the same-origin path |
| `VITE_USE_MOCKS` | `true` serves MSW mocks instead of the API; must be `false` in production |
| `VITE_PROXY_TARGET` | dev server only: where Vite forwards `/api` |
| `VITE_ENABLE_AI`, `VITE_ENABLE_AUTOMATION`, `VITE_APP_NAME` | UI feature switches and branding |

## Production image

`Dockerfile` builds the app and serves it with `nginx-unprivileged` (non-root, port 8080): SPA fallback, gzip, long cache for hashed assets, `index.html` never cached, security headers (CSP, nosniff, referrer policy, permissions policy, no framing) and a same-origin `/api/` proxy to `API_UPSTREAM`.

```bash
docker build -t oms-frontend .
docker run --rm -p 8080:8080 -e API_UPSTREAM=http://host.docker.internal:3000 oms-frontend
```

Kubernetes manifests live in `../backend/infrastructure/k8s/base/frontend.yaml`; see `../backend/docs/deployment/DEPLOYMENT.md` ("Web app").

## API contract

- `../backend/docs/api/openapi.json`
- `../backend/docs/api/ENDPOINTS.md`
