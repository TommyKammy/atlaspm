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

## 2026-02-23 - Asana-like UX Sprint (Sidebar, Cache Fixes, Rules Edit, Assignee Picker)
- What changed:
  - Core API:
    - Added `Rule.definition` JSON field (Prisma schema + migration).
    - Added rule definition validation/parsing (`task.progress.changed`, progress conditions, status/completedAt actions).
    - Extended `PATCH /rules/:id` to edit `name`, `cooldownSec`, and `definition`.
    - Updated default template creation to persist validated `definition`.
    - Updated task rule execution to evaluate persisted rule definitions.
    - Enhanced `GET /projects/:id/members` response to include minimal `user` profile (`id`, `email`, `displayName` fallback).
    - Added integration coverage for rule update + outbox and member profile payload.
  - Web UI:
    - Introduced TanStack Query provider and project-scoped query keys.
    - Added persistent app shell sidebar with project navigation.
    - Reworked home/project/rules flows to query + mutation patterns with targeted cache updates.
    - Fixed “Add Section” to appear immediately without refresh.
    - Implemented section quick-add task UX (`+ Add task`, Enter for rapid create) without refresh.
    - Added assignee autocomplete picker from project members with search and persisted PATCH updates.
    - Added rules editor UI (name + trigger/condition/action definition) with save/cancel and enable/disable.
    - Improved board visuals (section headers, counts, hover states, empty states, consistent controls).
  - E2E:
    - Replaced old flow with Asana-like UX assertions:
      - sidebar project navigation
      - add section/task immediate reflection + persistence
      - DnD reorder within section
      - assignee autocomplete persistence
      - progress rule transitions (50 => IN_PROGRESS, 100 => DONE/completedAt)
      - rule edit persistence
      - audit/outbox checks
- Why:
  - Address critical UX complaints (no-refresh correctness, editability gaps, navigation, and assignee UX) while preserving strict core/UI API boundaries.
- How tested:
  - `pnpm install --no-frozen-lockfile`
  - `pnpm lint`
  - `docker compose -f infra/docker/docker-compose.yml up -d postgres && pnpm test`
  - `pnpm e2e`
  - `pnpm e2e:rebuild`
- Risks/known gaps:
  - Cross-section task move remains API-covered in E2E for deterministic stability; UI drag between sections needs further hardening to be fully deterministic in Playwright.

## 2026-02-23 - Modern Dark UI Refresh (Linear/Vercel-inspired)
- What changed:
  - Added dark design tokens and global styling defaults in `/apps/web-ui/src/app/globals.css`:
    - required color tokens, Inter font usage, base font size 14px.
  - Introduced persistent shell component at `/apps/web-ui/src/components/layout/AppShell.tsx`:
    - 240px sidebar, active project highlight, sticky header with project context/actions.
    - mobile drawer slide animation with subtle motion.
  - Modernized task list UI in `/apps/web-ui/src/components/project-board.tsx`:
    - 44px rows, muted hover, thin borders, compact controls.
    - progress bar (4px) with accent/success fill.
    - section header uppercase styling + task count badge.
    - assignee avatar trigger (24px), hover tooltip, dark combobox dropdown.
  - Restyled rules page in `/apps/web-ui/src/app/projects/[id]/rules/page.tsx`:
    - surface-muted cards, enabled accent rail, compact editor form.
  - Added UI design reference doc `/docs/ui-design.md`.
- Why:
  - Align AtlasPM UI with modern startup visual language while preserving API-driven architecture and existing behavior.
- How tested:
  - `pnpm lint`
  - `pnpm test`
  - `pnpm e2e`
- Risks/known gaps:
  - Style refresh introduces broader visual change; final fit/finish should still be validated in manual browser QA across desktop/mobile breakpoints.

## 2026-02-23 - shadcn Tasks-style UX + Theme Persistence
- What changed:
  - Adopted shadcn token/theming baseline:
    - `next-themes` provider with class-based dark mode
    - Tailwind `darkMode: [\"class\"]`
    - shadcn-style `:root/.dark` HSL tokens in `globals.css`
  - Added/used shadcn-style UI primitives (`button`, `input`, `badge`, `table`, `popover`, `command`, `tooltip`, `dropdown-menu`, `sheet`, `scroll-area`, `separator`).
  - Rebuilt persistent app shell with project sidebar + top header and theme toggle.
  - Refined project page toward shadcn Tasks structure:
    - toolbar (search/status/priority/view/add)
    - dense table rows grouped by sections
    - section header + count badge + inline quick add
  - Updated assignee picker to Popover + Command combobox pattern with member suggestions.
  - Kept rules editing available with compact card/editor style.
  - Standardized query key conventions to project-scoped keys (`['project', id, ...]`).
  - Extended Playwright E2E with theme toggle persistence (dark/light survives reload).
- Why:
  - Align AtlasPM UX with shadcn Tasks aesthetics while preserving existing behavior, API boundaries, and no-refresh interactions.
- How tested:
  - `pnpm lint`
  - `docker compose -f infra/docker/docker-compose.yml up -d postgres && pnpm test`
  - `pnpm e2e:rebuild`
  - `pnpm e2e`
- Risks/known gaps:
  - The table/toolbar are intentionally minimal; additional task-view controls can be expanded later without changing API contracts.
