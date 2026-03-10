# Issue #331: P1: Introduce secure cookie or session transport for web-ui authentication

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/331
- Branch: codex/reopen-issue-331
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-331
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-331/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 3
- Last head SHA: 8e714a4ca8a49f14eee082f39f39e05144332e23
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5zJPYu|PRRT_kwDORWcwRc5zJPY7
- Repeated failure signature count: 1
- Updated at: 2026-03-10T00:59:15.581Z

## Latest Codex Summary
- PR review follow-up: the stale bot comment about a failing-test-only PR is no longer accurate because implementation and green CI are already on the branch.
- Applied the valid bot suggestion by strengthening `apps/core-api/test/dev-auth-environment.test.ts` to assert `HttpOnly`, `SameSite=Lax`, and `Path=/` on the session cookie, and to assert that the CSRF cookie omits `HttpOnly` while still carrying `SameSite=Lax` and `Path=/`.
- The tightened focused test still passes locally with `pnpm --filter @atlaspm/core-api exec vitest run test/dev-auth-environment.test.ts`.

## Active Failure Context
- Category: review
- Summary: 2 unresolved automated review thread(s) remain.
- Reference: https://github.com/TommyKammy/atlaspm/pull/335#discussion_r2908201337
- Details:
  - apps/core-api/test/dev-auth-environment.test.ts:146 This PR is titled "Introduce secure cookie or session transport" but only contains a **failing test** with no implementation. The `DevAuthController.create()` method at `src/auth/dev-auth.controller.ts:22-26` returns only `{ token }` and never sets any cookies, so this test will always fail in the current state. If this is intentionally a "reproduce-first" commit that will be followed up with implementation, consider: 1. Marking the test as `test.skip` or `test.todo` so CI doesn't break on the known-failing assertion. 2. Or alternatively, including the implementation (cookie issuance in the controller) in this same PR so it ships as a green changeset. Merging a knowingly-failing test will cause CI failures on `main` and block other PRs.
  - apps/core-api/test/dev-auth-environment.test.ts:142 Once the implementation is added, the test should also assert the security attributes required by the ADR (`docs/adr-browser-auth-session.md:101-120`). In particular: - The session cookie should be `HttpOnly`, `SameSite=Lax`, and `Path=/`. - The CSRF cookie should **not** be `HttpOnly` (it must be readable by JS), and should have `SameSite=Lax` and `Path=/`. Without these assertions, a future implementation could set the cookies with insecure defaults and the test would still pass. ```suggestion const sessionCookie = setCookie.find((cookie) => /(?:__Host-)?atlaspm_session=/.test(cookie)); expect(sessionCookie).toBeDefined(); expect(sessionCookie).toMatch(/;\s*HttpOnly\b/i); expect(sessionCookie).toMatch(/;\s*SameSite=Lax\b/i); expect(sessionCookie).toMatch(/;\s*Path=\//i); const csrfCookie = setCookie.find((cookie) => /(?:__Host-)?atlaspm_csrf=/.test(cookie)); expect(csrfCookie).toBeDefined(); expect(csrfCookie).not.toMatch(/;\s*HttpOnly\b/i); expect(csrfCookie).toMatch(/;\s*SameSite=Lax\b/i); expect(csrfCookie).toMatch(/;\s*Path=\//i); ```

## Codex Working Notes
### Current Handoff
- Hypothesis: The remaining review work is narrow: resolve the stale bot thread as obsolete and land the valid test-hardening suggestion that verifies cookie security attributes.
- Primary failure or risk: This branch still only covers the dev auth cookie path plus server-side cookie fallback; the full browser migration and CSRF enforcement remain follow-up work outside these review threads.
- Last focused command: `pnpm --filter @atlaspm/core-api exec vitest run test/dev-auth-environment.test.ts`
- Files changed: `apps/core-api/test/dev-auth-environment.test.ts`
- Next 1-3 actions:
  1. Commit and push the tightened cookie-attribute assertions.
  2. Resolve the fixed and stale bot review threads on PR #335.
  3. Continue the remaining browser-session work in follow-up changes after the review queue is clear.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Focused reproduction:
  - `apps/web-ui/src/app/login/page.tsx` uses `POST /dev-auth/token` and stores the returned token in browser state.
  - `apps/web-ui/src/lib/api.ts` reads `atlaspm_token` from `localStorage` and attaches it as `Authorization: Bearer ...`.
  - `apps/core-api/src/auth/auth.service.ts` authenticates requests from that bearer header today.
  - The previously failing reproducing test now passes after `POST /dev-auth/token` was updated to emit session and CSRF cookies.
  - Review hardening added assertions for `HttpOnly` / `SameSite=Lax` / `Path=/` on the session cookie and for readable CSRF cookie attributes.
- Failure signature:
  - `PRRT_kwDORWcwRc5zJPYu|PRRT_kwDORWcwRc5zJPY7`
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
