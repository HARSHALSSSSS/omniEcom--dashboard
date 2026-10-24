## What and why
<!-- One or two sentences. Link the issue / ticket. -->

## Type
- [ ] Feature   - [ ] Fix   - [ ] Refactor   - [ ] Infra / CI   - [ ] Docs   - [ ] Dependencies

## Checklist
- [ ] CI is green (backend verify + integration, frontend, docker builds)
- [ ] Tests added or updated for the change
- [ ] **Database**: new tables with `vendor_id` have RLS enabled + forced + a policy (`tests/database/rls-coverage.test.ts` passes); migrations are expand/contract (the previous version must still run against the new schema)
- [ ] **API**: new routes declare `config.access`, a summary, tags and a 2xx schema; `backend/docs/api/openapi.json` is regenerated (`pnpm openapi:export`)
- [ ] **Config**: new environment variables are in `backend/.env.example`, `backend/packages/config`, and the deployment docs; no secrets in git
- [ ] No personal data or secrets are written to logs
- [ ] Docs updated where behaviour changed

## How it was tested
<!-- Commands run, screenshots for UI changes. -->

## Rollout / rollback notes
<!-- Migrations, feature flags, anything the deployer must know. Rollback = redeploy the previous image tag. -->
