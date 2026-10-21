# Section 0: foundation (integrated)

Run locally (no Postgres / Redis needed):

1. API: `cd backend && pnpm dev:local` (real app on in-process PostgreSQL, http://localhost:3000, docs at /docs).
   Demo logins: `admin@nova.test` / `Demo-Password-123` (owner, onboarding complete), `staff@nova.test` and `viewer@nova.test` / `staff-password-123`.
2. Frontend: `cd frontend && npm ci && npm run dev` (http://localhost:5173; Vite proxies `/api` to the API).

What is real now: sign in, sign up (then the onboarding wizard), forgot / reset password, email verification (page + banner + resend),
sign out, session restore on reload, route guards, permissions from `GET /me`, the shell (`/workspace/shell`: user, business, badges,
feature flags), notifications panel (`/notifications`, mark read), global search (`/search`). Every other screen still runs on its mocks
(MSW passes unmocked requests through to the API) until its section is integrated.

Conventions the next sections build on (see `frontend/src/api`, `frontend/src/lib`):
- `client` is the only HTTP client; `ENDPOINTS` carry the `/api/v1` base; errors are `ApiError` (`code`, `status`, `fields`, `rule`, `requestId`); `errorMessage(e)` for text.
- Tokens: access in memory, refresh token rotated on every refresh with ONE shared in-flight refresh (`lib/tokens.ts`, `refreshSession`).
- `useCan("products:write")`, `useCanAny(...)`, `useFeature("ai.enabled")` read what the server granted; default is deny.
- `toAppPath(href)` turns API deep links into app routes.
