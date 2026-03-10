# Issue #349: P2: Add regression coverage for follower subscriptions and notifications

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/349
- Branch: codex/reopen-issue-349
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-349
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-349/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: 20b460b228350a9d8daa19e9009094ccc9bc54a7
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-10T15:16:43.943Z

## Latest Codex Summary
- Added focused follower regression coverage in Playwright and confirmed the existing follower integration tests still pass locally. The new browser spec exposed a real UI permission leak: non-members could still see project/task follower controls because the web layer rendered `FollowerToggle` even when no authorized project/task record had resolved.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: Integration coverage for follower APIs/notifications was already present on this branch; the missing regression surface was the UI, especially reload persistence plus hiding follower controls from unauthorized users.
- Primary failure or risk: The focused Playwright regression is now passing after hiding follower toggles until authorized project/task data resolves. Remaining work is broadening local confidence only if needed.
- Last focused command: `SEARCH_ENABLED=${SEARCH_ENABLED:-false} DATABASE_URL=${DATABASE_URL:-postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public} pnpm --filter @atlaspm/core-api exec vitest run test/core.integration.test.ts --testNamePattern='task and project followers expose follow state, prevent duplicates, and enforce authorization|task comments and project status updates notify followers without duplicate delivery|project status updates fan out mention notifications and include mention context for reminder hooks'`
- Files changed: `apps/web-ui/src/app/projects/[id]/page.tsx`, `apps/web-ui/src/components/task-detail-drawer.tsx`, and `e2e/playwright/tests/followers.spec.ts`
- Next 1-3 actions:
  1. Commit the follower UI regression coverage and permission-boundary fix on `codex/reopen-issue-349`.
  2. Open or update the draft PR for issue #349 with the focused verification summary.
  3. Run broader web/E2E verification only if required by CI or review.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Focused reproduction:
  - Added `e2e/playwright/tests/followers.spec.ts` to cover project/task follow and unfollow flows, reload persistence, and outsider permission boundaries.
  - First focused E2E behavior failure after `pnpm install` was `expect(locator).toHaveCount(expected)` with `getByTestId('project-follow-toggle')` returning `1` for a non-member visiting `/projects/:id`.
  - Direct API spot-check showed the outsider was correctly blocked (`GET /projects` returned `[]`; `GET /projects/:id/sections` returned `404`), so the leak was isolated to web-ui rendering defaults rather than backend auth.
- Failure signature:
  - `followers-ui-outsider-toggle-visible`
- Current focused verification:
  - `pnpm install`
  - `pnpm --filter @atlaspm/core-api exec prisma generate`
  - `pnpm --filter @atlaspm/domain build`
  - `docker compose -f infra/docker/docker-compose.yml up -d postgres core-api collab-server web-ui`
  - `pnpm --filter @atlaspm/playwright exec playwright test tests/followers.spec.ts`
  - `SEARCH_ENABLED=${SEARCH_ENABLED:-false} DATABASE_URL=${DATABASE_URL:-postgresql://atlaspm:atlaspm@localhost:55432/atlaspm?schema=public} pnpm --filter @atlaspm/core-api exec vitest run test/core.integration.test.ts --testNamePattern='task and project followers expose follow state, prevent duplicates, and enforce authorization|task comments and project status updates notify followers without duplicate delivery|project status updates fan out mention notifications and include mention context for reminder hooks'`
- Implementation notes:
  - Project page now renders `FollowerToggle` only when an authorized `project` record is present.
  - Task detail drawer now renders its follower row only when `currentTask` has resolved.
  - Rebuilding the `web-ui` Docker image was required before the Playwright rerun because the initial container still served the pre-fix bundle.
