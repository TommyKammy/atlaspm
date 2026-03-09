# Issue #312: P0: Gate dev auth controller registration behind safe environment checks

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/312
- Branch: codex/reopen-issue-312
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-312
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-312/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: 9b3ec6dcc4d847200317a1a7f7c9c8fe44e02437
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-09T10:33:19.351Z

## Latest Codex Summary
- Reproduced the auth exposure issue with a focused `core-api` test that proves `DevAuthController` needs environment gating, then implemented the gating via a small dev-auth environment helper and dynamic `AuthModule.register()`.
- Added a startup guard in `apps/core-api/src/main.ts` that throws before Nest boot when `DEV_AUTH_ENABLED=true` outside safe local/test environments.
- Focused verification passing: `pnpm --filter @atlaspm/core-api test -- test/dev-auth-environment.test.ts` and `pnpm --filter @atlaspm/core-api type-check`.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: The unsafe exposure boundary is limited to `DevAuthController` registration and startup validation, so the narrowest useful regression suite is a dedicated auth-environment test rather than broader integration coverage.
- Primary failure or risk: Route gating currently relies on `NODE_ENV` semantics; safe environments are treated as `development`, `test`, and `local`, with unset `NODE_ENV` defaulting to `development`.
- Last focused command: `pnpm --filter @atlaspm/core-api test -- test/dev-auth-environment.test.ts`
- Files changed: `apps/core-api/src/auth/dev-auth-environment.ts`, `apps/core-api/src/auth/auth.module.ts`, `apps/core-api/src/app.module.ts`, `apps/core-api/src/main.ts`, `apps/core-api/test/dev-auth-environment.test.ts`
- Next 1-3 actions:
  1. Commit the auth gating change set on `codex/reopen-issue-312`.
  2. Optionally run one broader `core-api` integration slice if the supervisor wants extra confidence beyond the focused auth suite.
  3. Open or update a draft PR if this branch does not already have one.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Needed `pnpm install` in this worktree before `core-api` tests would run; initial failure was missing local `node_modules` / `prisma` binary.
- Focused regression coverage added in `apps/core-api/test/dev-auth-environment.test.ts`:
  - route available in `development` with `DEV_AUTH_ENABLED=true`
  - route absent in `production` even if `DEV_AUTH_ENABLED=true`
  - startup/env guard allows `test`
  - startup/env guard throws in `production`
- Current focused verification passing:
  - `pnpm --filter @atlaspm/core-api test -- test/dev-auth-environment.test.ts`
  - `pnpm --filter @atlaspm/core-api type-check`
