# Issue #332: P1: Migrate web-ui auth client flow away from localStorage token handling

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/332
- Branch: codex/reopen-issue-332
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-332
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-332/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: 48732f2b9aad722b89ed9fa4af841ead9faf752a
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-10T01:15:27.182Z

## Latest Codex Summary
- Added a focused `web-ui` regression test proving browser API calls must use cookie-backed session credentials and CSRF headers instead of `localStorage` bearer tokens.
- Migrated `web-ui` login/API/logout flow off `atlaspm_token` handling and added `POST /auth/logout` to clear auth cookies server-side.
- Verified the focused `web-ui` auth test, `core-api` dev-auth auth-cookie test file, and both package type-checks.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: The browser client migration is now on the intended path: session cookies are used for `web-ui` requests, CSRF headers are attached for unsafe methods, and logout is cookie-clearing rather than `localStorage` deletion.
- Primary failure or risk: This patch still relies on the temporary dev-session model that stores the dev JWT in the session cookie; full production session persistence and broader CSRF/origin enforcement remain follow-up work.
- Last focused command: `pnpm --filter @atlaspm/core-api type-check`
- Files changed: `apps/web-ui/src/lib/api.ts`, `apps/web-ui/src/app/login/page.tsx`, `apps/web-ui/src/components/layout/HeaderBar.tsx`, `apps/web-ui/src/lib/api.test.ts`, `apps/web-ui/package.json`, `apps/web-ui/vitest.config.ts`, `apps/core-api/src/auth/auth.controller.ts`, `apps/core-api/src/auth/auth.module.ts`, `apps/core-api/test/dev-auth-environment.test.ts`, `pnpm-lock.yaml`
- Next 1-3 actions:
  1. Commit this focused browser-session migration slice.
  2. Push the branch and update or open the draft PR if needed.
  3. Continue with broader session/CSRF enforcement follow-up work if the issue remains open.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Focused reproduction:
  - Added `apps/web-ui/src/lib/api.test.ts` and first ran `pnpm --filter @atlaspm/web-ui test -- src/lib/api.test.ts`.
  - Initial red failure: `expected undefined to be 'include'`, proving `apps/web-ui/src/lib/api.ts` was not sending `credentials: 'include'`.
  - The same client helper also still read `localStorage` and would have attached `Authorization` from `atlaspm_token`.
  - After the client changes, `rg -n "atlaspm_token" apps/web-ui apps/core-api` returns no remaining auth-token storage refs.
- Failure signature:
  - `web-ui-api-missing-credentials-include`
- Current focused verification:
  - `pnpm install --no-frozen-lockfile`
  - `pnpm --filter @atlaspm/web-ui test -- src/lib/api.test.ts`
  - `pnpm --filter @atlaspm/core-api prisma:generate`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/dev-auth-environment.test.ts`
  - `pnpm --filter @atlaspm/web-ui type-check`
  - `pnpm --filter @atlaspm/core-api type-check`
- Implementation notes:
  - Chosen browser model: `core-api` managed opaque `HttpOnly` session cookie plus a readable CSRF cookie.
  - OIDC code exchange and refresh-token rotation stay server-side in `core-api`.
  - Bearer auth remains temporarily for non-browser clients and transition compatibility.
  - Review follow-up: production / HTTPS keeps `__Host-*` cookie names, while plain-HTTP localhost uses dev-only `atlaspm_session` / `atlaspm_csrf` names because `__Host-*` requires `Secure`.
  - `apps/web-ui/src/lib/api.ts` now always includes browser credentials, reads the CSRF cookie, and only sends `Authorization` when a token is explicitly passed in options.
  - `apps/web-ui/src/app/login/page.tsx` now relies on the cookie-setting dev auth response and no longer persists a returned token.
  - `apps/web-ui/src/components/layout/HeaderBar.tsx` now calls `POST /auth/logout`, and `apps/core-api/src/auth/auth.controller.ts` clears both session and CSRF cookies.
