# WORKLOG

## 2026-02-23 - Initial Monorepo Scaffold
- What changed:
  - Created workspace layout (`apps`, `packages`, `infra/docker`, `e2e/playwright`, `docs`).
  - Added root pnpm workspace, TypeScript strict base config, ESLint, Prettier, README, and gitignore.
- Why:
  - Establish required architecture and tooling baseline before feature implementation.
- How tested:
  - File structure verification via shell listing.
- Risks/known gaps:
  - App-level implementation and tests not yet added.

## 2026-02-23 - Core API MVP (NestJS + Prisma)
- What changed:
  - Implemented `apps/core-api` with auth (OIDC JWT verify + dev auth mode), project/membership, sections, tasks, rules, audit, outbox, and webhooks endpoints.
  - Added Prisma schema for MVP entities and initial SQL migration.
  - Added correlation ID middleware, structured request logging, and consistent error response filter.
  - Implemented sparse-position manual ordering and reorder endpoint for same-section/cross-section task moves.
  - Added integration test skeleton (`vitest + supertest`) for required MVP flow coverage.
- Why:
  - Deliver the headless core API boundary with authorization, ordering, auditability, and rule automation.
- How tested:
  - Static code inspection and endpoint/test flow review.
  - Runtime tests were not executed in this environment because Node.js/pnpm are unavailable.
- Risks/known gaps:
  - Runtime verification (`pnpm lint`, `pnpm test`, migrations) is pending.
  - OpenAPI decorators are minimal; endpoint schemas are generated but not deeply annotated.

## 2026-02-23 - Web UI MVP + Playwright E2E
- What changed:
  - Implemented `apps/web-ui` with login, workspace/projects list, project detail board grouped by sections, rules page, inline task edits, and dnd-kit drag/drop reorder/move.
  - Added Playwright project (`e2e/playwright`) with MVP flow test including login, project/section/task creation, reorder/move persistence, progress rules, and audit/outbox checks.
  - Added `scripts/run-e2e.sh` and root `pnpm e2e` workflow to run docker-compose stack and execute Playwright.
- Why:
  - Provide end-to-end demonstrable UI behavior using core API only, with dockerized execution path for Mac + Colima.
- How tested:
  - Static test and script validation by file inspection.
  - Runtime Playwright execution is pending until Node.js/pnpm are available.
- Risks/known gaps:
  - Drag-and-drop behavior can vary by browser/runtime and needs live execution validation.
  - UI currently prioritizes MVP function over final UX polish.

## 2026-02-23 - Host Setup + Runtime Verification
- What changed:
  - Installed host prerequisites: Node.js 22 (Homebrew), pnpm 9.15.4 (Corepack), Playwright Chromium runtime.
  - Updated Docker/runtime compatibility:
    - `apps/core-api/Dockerfile` switched to `node:20-bookworm-slim` and installs `openssl`.
    - `infra/docker/docker-compose.yml` Postgres host port changed to `55432`.
    - `apps/web-ui/src/lib/api.ts` request init typing fixed for strict TS build.
  - Stabilized test/runtime scripts and defaults for local execution.
- Why:
  - Ensure Mac + Colima environment can actually execute lint/test/e2e workflows.
- How tested:
  - `pnpm lint` (pass)
  - `pnpm test` (pass)
  - `pnpm e2e` (infrastructure and app containers start; Playwright currently hangs in drag-and-drop phase and was terminated for investigation)
- Risks/known gaps:
  - Playwright flow is still flaky around drag-and-drop interactions and needs deterministic test strategy (or test utility) for final green e2e.

## 2026-02-23 - DnD Stabilization and E2E Green
- What changed:
  - Added dedicated drag handle in task rows for deterministic dnd-kit interaction.
  - Reworked Playwright DnD from `dragAndDrop` to pointer-based drag helper with reorder API response wait.
  - Stabilized E2E setup by creating sections/tasks via API and keeping DnD verification in UI.
  - Fixed stale optimistic-lock version usage in E2E by reloading moved task version before progress updates.
  - Updated core-api Docker runtime to include OpenSSL dependency for Prisma migration startup in containers.
- Why:
  - Eliminate Playwright drag hangs and make `pnpm e2e` consistently pass under Mac + Colima.
- How tested:
  - `pnpm lint` (pass)
  - `pnpm e2e` (pass)
- Risks/known gaps:
  - Docker builds are still relatively heavy in local e2e loop; build caching or slimmer images can be optimized later.

## 2026-02-23 - E2E Loop Speed Optimization
- What changed:
  - Added root `.dockerignore` to reduce Docker build context size (ignores `node_modules`, `.next`, coverage/test artifacts, logs, etc.).
  - Updated `scripts/run-e2e.sh`:
    - default path no longer forces rebuild (`docker compose up -d` only),
    - optional rebuild mode via `E2E_REBUILD=1`,
    - optional keep-containers-up mode via `E2E_KEEP_UP=1`.
  - Added root script `pnpm e2e:rebuild`.
  - Documented fast-loop usage in `README.md`.
- Why:
  - Cut local feedback time by avoiding unnecessary image rebuilds in repeated E2E runs.
- How tested:
  - `pnpm e2e` (pass, 1 test passed).
- Risks/known gaps:
  - `pnpm e2e` without rebuild may use stale images after code changes; use `pnpm e2e:rebuild` when changing backend/frontend code.
