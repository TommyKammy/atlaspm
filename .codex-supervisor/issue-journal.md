# Issue #313: P0: Remove default dev auth secret fallback and require explicit secret

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/313
- Branch: codex/reopen-issue-313
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-313
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-313/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: c183677c4e06cb4f8f16b22e3619781fa3993e02
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-09T10:52:23.371Z

## Latest Codex Summary
- None yet.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: The auth hardening gap is confined to `core-api` dev auth env handling. A focused startup test can prove that `DEV_AUTH_ENABLED=true` still succeeds with a missing or default secret, then a shared validator can close both startup and mint/verify paths.
- Primary failure or risk: Before the fix, `app.init()` succeeded when `DEV_AUTH_ENABLED=true` and `DEV_AUTH_SECRET` was unset or set to `dev-secret` because `auth.service.ts` still fell back to `'dev-secret'` and startup validation only checked `NODE_ENV`.
- Last focused command: `pnpm --filter @atlaspm/core-api exec vitest run test/dev-auth-environment.test.ts --reporter=dot`
- Files changed: `apps/core-api/src/auth/auth.service.ts`, `apps/core-api/src/auth/dev-auth-environment.ts`, `apps/core-api/test/dev-auth-environment.test.ts`, `apps/core-api/.env.example`, `README.md`, `docs/startup-ubuntu.md`
- Next 1-3 actions:
  1. Commit the focused dev-auth secret hardening checkpoint on `codex/reopen-issue-313`.
  2. Decide whether to add one broader `core-api` auth/integration pass beyond the focused env spec.
  3. If verification stays clean, open or update the draft PR for issue #313.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Needed local setup first in this worktree:
  - `pnpm install`
  - `pnpm --filter @atlaspm/core-api prisma:generate`
- Focused reproduction:
  - Added two narrow tests in `apps/core-api/test/dev-auth-environment.test.ts` for missing secret and obvious default secret.
  - Reproduced on the first real run: `promise resolved "NestApplication{ … }" instead of rejecting` for both cases.
- Current focused verification passing:
  - `pnpm --filter @atlaspm/core-api exec vitest run test/dev-auth-environment.test.ts --reporter=dot`
  - `pnpm --filter @atlaspm/core-api type-check`
- Implementation notes:
  - Added `getValidatedDevAuthSecret()` in `apps/core-api/src/auth/dev-auth-environment.ts`.
  - Startup now rejects missing secrets, secrets shorter than 16 chars, and obvious defaults including `dev-secret` and `dev-secret-change-me`.
  - `AuthService` now uses the validated secret for both dev token verification and minting, with no fallback secret.
