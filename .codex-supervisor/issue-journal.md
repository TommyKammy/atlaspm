# Issue #331: P1: Introduce secure cookie or session transport for web-ui authentication

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/331
- Branch: codex/reopen-issue-331
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-331
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-331/.codex-supervisor/issue-journal.md
- Current phase: repairing_ci
- Attempt count: 2
- Last head SHA: 50b1424a3df9c05fd3425919ff9b04c0586c8b51
- Blocked reason: none
- Last failure signature: test:fail
- Repeated failure signature count: 1
- Updated at: 2026-03-09T22:10:07.477Z

## Latest Codex Summary
- Repaired the failing auth test by updating `core-api` to set browser session and CSRF cookies on `POST /dev-auth/token` while preserving the existing JSON token response for compatibility.
- Added cookie-name helpers in `apps/core-api/src/auth/session-cookie.ts` and updated `AuthService` / `AuthGuard` so authenticated requests can fall back to the session cookie when there is no bearer header.
- Extended `apps/core-api/test/dev-auth-environment.test.ts` with a direct cookie-auth credential test; the focused file now passes locally.

## Active Failure Context
- Category: checks
- Summary: PR #335 has failing checks.
- Command or source: gh pr checks
- Reference: https://github.com/TommyKammy/atlaspm/pull/335
- Details:
  - test (fail/FAILURE) https://github.com/TommyKammy/atlaspm/actions/runs/22877010783/job/66370995258
  - Local reproduction was the previously failing `test/dev-auth-environment.test.ts`; after the auth cookie patch it passes locally and needs CI rerun confirmation.

## Codex Working Notes
### Current Handoff
- Hypothesis: The immediate CI failure was caused by the reproducing test added in the previous turn; the narrow repair is now in place in `core-api` auth and should clear that failing check once CI reruns.
- Primary failure or risk: This patch only introduces cookie-backed transport on the dev auth path plus cookie fallback in auth verification; broader web-ui migration and CSRF enforcement are still outstanding for the full issue.
- Last focused command: `pnpm --filter @atlaspm/core-api type-check`
- Files changed: `apps/core-api/src/auth/session-cookie.ts`, `apps/core-api/src/auth/auth.service.ts`, `apps/core-api/src/auth/auth.guard.ts`, `apps/core-api/src/auth/dev-auth.controller.ts`, `apps/core-api/test/dev-auth-environment.test.ts`
- Next 1-3 actions:
  1. Commit and push the focused CI repair so PR #335 can rerun the `test` job.
  2. If CI still fails, inspect the exact failing test from the Actions log and reproduce that command locally.
  3. After CI is green, continue the remaining browser-session work: CSRF enforcement and `web-ui` migration off `localStorage` bearer auth.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Focused reproduction:
  - `apps/web-ui/src/app/login/page.tsx` uses `POST /dev-auth/token` and stores the returned token in browser state.
  - `apps/web-ui/src/lib/api.ts` reads `atlaspm_token` from `localStorage` and attaches it as `Authorization: Bearer ...`.
  - `apps/core-api/src/auth/auth.service.ts` authenticates requests from that bearer header today.
  - The previously failing reproducing test now passes after `POST /dev-auth/token` was updated to emit session and CSRF cookies.
- Failure signature:
  - `test:fail`
- Current focused verification:
  - `pnpm install`
  - `pnpm --filter @atlaspm/core-api prisma:generate`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/dev-auth-environment.test.ts`
  - `pnpm --filter @atlaspm/core-api type-check`
- Implementation notes:
  - Chosen browser model: `core-api` managed opaque `HttpOnly` session cookie plus a readable CSRF cookie.
  - OIDC code exchange and refresh-token rotation stay server-side in `core-api`.
  - Bearer auth remains temporarily for non-browser clients and transition compatibility.
  - Review follow-up: production / HTTPS keeps `__Host-*` cookie names, while plain-HTTP localhost uses dev-only `atlaspm_session` / `atlaspm_csrf` names because `__Host-*` requires `Secure`.
  - Current tactical implementation for CI repair stores the existing dev JWT inside the `HttpOnly` session cookie so browser transport is no longer header-only, while avoiding new persistence/state tables in this patch.
