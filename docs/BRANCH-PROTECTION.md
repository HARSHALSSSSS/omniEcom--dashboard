# GitHub settings checklist (repository owner)

Everything that cannot be committed as code. Do this once, in the GitHub UI, after the first CI run on the default branch
(status checks only appear in the picker after they have run once).

## 1. Branch protection (Settings > Branches > Add rule, branch name pattern `main`)

- [ ] **Require a pull request before merging**
  - [ ] Require approvals: **1** (2 once there is a second maintainer)
  - [ ] Dismiss stale pull request approvals when new commits are pushed
  - [ ] **Require review from Code Owners** (see `.github/CODEOWNERS`)
  - [ ] Require approval of the most recent reviewable push
- [ ] **Require status checks to pass before merging**, and **Require branches to be up to date**. Select these checks:
  - `verify` (backend: typecheck, lint, module graph, tests, OpenAPI is committed, build)
  - `integration` (backend against real Postgres + Redis)
  - `docker` (all four backend images build)
  - `frontend` (typecheck, lint, tests, build, audit)
  - `frontend-docker` (frontend image builds)
- [ ] **Require conversation resolution before merging**
- [ ] **Require linear history** (squash or rebase merges)
- [ ] **Do not allow bypassing the above settings** (applies to admins too)
- [ ] **Restrict force pushes**: leave "Allow force pushes" OFF
- [ ] **Do not allow deletions**: leave "Allow deletions" OFF
- [ ] (Optional, recommended) Require signed commits

Apply the same rule to any long-lived release branch (`release/*`).

## 2. Environments (Settings > Environments)

The deploy workflow (`.github/workflows/deploy.yml`) uses two environments. Create them with exactly these names.

- [ ] `staging`: deployment branch `main`; secrets `KUBECONFIG_STAGING`; variable `STAGING_BASE_URL` (e.g. `https://api.staging.yourdomain.com`)
- [ ] `production`: **Required reviewers** = you (and a second person if available); deployment branch `main` only; secrets `KUBECONFIG_PRODUCTION`; variable `PRODUCTION_BASE_URL`
- [ ] Repository variable `REGISTRY` (e.g. `ghcr.io/<owner>`) and secrets `REGISTRY_USER`, `REGISTRY_TOKEN`
- [ ] Kubernetes: create the `oms-secrets` and `oms-migration-secrets` Secrets, the TLS secrets `oms-api-tls` and `oms-web-tls`, and set real hostnames in the overlays (see `backend/docs/deployment/DEPLOYMENT.md`, "Go-live checklist")

## 3. Actions (Settings > Actions > General)

- [ ] Actions permissions: allow GitHub-authored and verified-creator actions only (or pin the list)
- [ ] Workflow permissions: **Read repository contents** by default (workflows request more explicitly where needed)
- [ ] "Require approval for first-time contributors / all outside collaborators" for pull requests from forks

## 4. Security (Settings > Code security)

- [ ] Dependency graph: ON
- [ ] Dependabot alerts and **Dependabot security updates**: ON (version updates are configured in `.github/dependabot.yml`)
- [ ] Secret scanning and **push protection**: ON
- [ ] Code scanning (CodeQL default setup): ON for JavaScript/TypeScript
- [ ] Private vulnerability reporting: ON

## 5. Pull request hygiene (Settings > General > Pull Requests)

- [ ] Allow squash merging only (or squash + rebase); disable merge commits
- [ ] Automatically delete head branches
- [ ] Default commit message: pull request title and description

## 6. Verify

- [ ] Open a throwaway PR that breaks a test: the merge button must be blocked.
- [ ] Try `git push --force origin main` from a clone: it must be rejected.
- [ ] Merge a trivial PR: `deploy` runs CI first, then images, then staging, then waits for production approval.
