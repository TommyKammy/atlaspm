# Issue #331: P1: Introduce secure cookie or session transport for web-ui authentication

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/331
- Branch: codex/reopen-issue-331
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-331
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-331/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: d7f83f8965c25694e48f2ef3e936d2c8acb1f5b7
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-09T22:05:16.215Z

## Latest Codex Summary
- Added a focused failing integration test in `apps/core-api/test/dev-auth-environment.test.ts` proving that dev browser login still does not establish session cookies.
- Reproduced the issue with `pnpm --filter @atlaspm/core-api exec vitest run test/dev-auth-environment.test.ts` after bootstrapping this worktree with `pnpm install` and `pnpm --filter @atlaspm/core-api prisma:generate`.

## Active Failure Context
- Failure signature: `browser-auth-missing-session-cookie`
- Focused failing test: `Dev auth environment guardrails > establishes a browser session cookie for dev auth login`
- Failure detail: `POST /dev-auth/token` responds `201` but `response.headers['set-cookie']` does not contain either `atlaspm_session` / `__Host-atlaspm_session` or `atlaspm_csrf` / `__Host-atlaspm_csrf`.

## Codex Working Notes
### Current Handoff
- Hypothesis: The missing browser session transport is now directly reproducible in `core-api`: local login still issues only a JSON bearer token and no cookie/CSRF state, which keeps `web-ui` coupled to `localStorage`.
- Primary failure or risk: There is no cookie-based browser session establishment path yet, and server auth still depends on bearer headers only.
- Last focused command: `pnpm --filter @atlaspm/core-api exec vitest run test/dev-auth-environment.test.ts`
- Files changed: `apps/core-api/test/dev-auth-environment.test.ts`
- Next 1-3 actions:
  1. Implement cookie/session issuance on the dev auth login path and preserve bearer compatibility for non-browser callers.
  2. Extend auth verification to accept the new session transport, then add CSRF enforcement for state-changing browser requests.
  3. Update `web-ui` login/API/logout flows off `localStorage` bearer handling and rerun focused auth tests.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Focused reproduction:
  - `apps/web-ui/src/app/login/page.tsx` uses `POST /dev-auth/token` and stores the returned token in browser state.
  - `apps/web-ui/src/lib/api.ts` reads `atlaspm_token` from `localStorage` and attaches it as `Authorization: Bearer ...`.
  - `apps/core-api/src/auth/auth.service.ts` authenticates requests from that bearer header today.
  - New reproducing test expects `POST /dev-auth/token` to emit session and CSRF cookies for browser login, but current response has no `Set-Cookie` headers.
- Failure signature:
  - `browser-auth-missing-session-cookie`
- Current focused verification:
  - `pnpm install`
  - `pnpm --filter @atlaspm/core-api prisma:generate`
  - `pnpm --filter @atlaspm/core-api exec vitest run test/dev-auth-environment.test.ts`
- Implementation notes:
  - Chosen browser model: `core-api` managed opaque `HttpOnly` session cookie plus a readable CSRF cookie.
  - OIDC code exchange and refresh-token rotation stay server-side in `core-api`.
  - Bearer auth remains temporarily for non-browser clients and transition compatibility.
  - Review follow-up: production / HTTPS keeps `__Host-*` cookie names, while plain-HTTP localhost uses dev-only `atlaspm_session` / `atlaspm_csrf` names because `__Host-*` requires `Secure`.
