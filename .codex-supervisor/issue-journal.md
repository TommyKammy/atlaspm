# Issue #332: P1: Migrate web-ui auth client flow away from localStorage token handling

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/332
- Branch: codex/reopen-issue-332
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-332
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-332/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 2
- Last head SHA: 9463f61f5b5cd63aef157e0f8cb5f01fda3d39cd
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5zK4ti|PRRT_kwDORWcwRc5zK4tu|PRRT_kwDORWcwRc5zK4t8|PRRT_kwDORWcwRc5zK4uF|PRRT_kwDORWcwRc5zK4uP
- Repeated failure signature count: 1
- Updated at: 2026-03-10T01:28:07.697Z

## Latest Codex Summary
- Addressed the five configured-bot review comments on PR #336.
- Tightened the `web-ui` regression test to assert `localStorage.getItem` is not called, made logout redirect via `try/finally`, added `Path=/` assertions to the logout cookie test, and switched the Vitest alias to `fileURLToPath(new URL(..., import.meta.url))`.
- Focused verification passed for the touched tests and `web-ui` type-check.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: The review queue is narrow and resolved by test hardening plus a small logout control-flow fix; no broader behavior change was needed.
- Primary failure or risk: This patch still relies on the temporary dev-session model that stores the dev JWT in the session cookie; full production session persistence and broader CSRF/origin enforcement remain follow-up work.
- Last focused command: `pnpm --filter @atlaspm/web-ui type-check`
- Files changed: `apps/web-ui/src/lib/api.test.ts`, `apps/web-ui/src/components/layout/HeaderBar.tsx`, `apps/web-ui/vitest.config.ts`, `apps/core-api/test/dev-auth-environment.test.ts`
- Next 1-3 actions:
  1. Commit and push the review-fix follow-up for PR #336.
  2. Resolve the configured-bot review threads as addressed.
  3. Recheck PR merge state and remaining CI/e2e status.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Focused reproduction:
  - Review pass only: no new product bug reproduced beyond the five automated review comments.
  - Each comment was applied directly to the touched line with no scope expansion.
- Failure signature:
  - `PRRT_kwDORWcwRc5zK4ti|PRRT_kwDORWcwRc5zK4tu|PRRT_kwDORWcwRc5zK4t8|PRRT_kwDORWcwRc5zK4uF|PRRT_kwDORWcwRc5zK4uP`
- Current focused verification:
  - `pnpm --filter @atlaspm/web-ui test -- src/lib/api.test.ts`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/dev-auth-environment.test.ts`
  - `pnpm --filter @atlaspm/web-ui type-check`
- Implementation notes:
  - Chosen browser model: `core-api` managed opaque `HttpOnly` session cookie plus a readable CSRF cookie.
  - OIDC code exchange and refresh-token rotation stay server-side in `core-api`.
  - Bearer auth remains temporarily for non-browser clients and transition compatibility.
  - Review follow-up: production / HTTPS keeps `__Host-*` cookie names, while plain-HTTP localhost uses dev-only `atlaspm_session` / `atlaspm_csrf` names because `__Host-*` requires `Secure`.
  - `apps/web-ui/src/lib/api.test.ts` now proves the helper never consults `localStorage` during a normal session-backed request.
  - `apps/web-ui/src/components/layout/HeaderBar.tsx` now navigates to `/login` even if `/auth/logout` fails.
  - `apps/core-api/test/dev-auth-environment.test.ts` now verifies `Path=/` on both cleared cookies.
  - `apps/web-ui/vitest.config.ts` now uses an ESM-safe alias path derived from `import.meta.url`.
