# Issue #312: P0: Gate dev auth controller registration behind safe environment checks

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/312
- Branch: codex/issue-312
- Workspace: /Users/tomoakikawada/Dev/atlaspm-worktrees/issue-312
- Journal: /Users/tomoakikawada/Dev/atlaspm-worktrees/issue-312/.atlaspm-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: 9b3ec6dcc4d847200317a1a7f7c9c8fe44e02437
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-09T10:32:41.571Z

## Latest Codex Summary
- Added a focused `dev-auth-environment` regression test that reproduced two failures: `/dev-auth/token` returned `401` instead of being absent when dev auth was off, and bootstrap did not fail when `DEV_AUTH_ENABLED=true` under `NODE_ENV=production`.
- Fixed the boundary by moving dev auth route registration into a dedicated dynamic module, only mounting it for safe environments, and adding a startup guard that rejects unsafe `DEV_AUTH_ENABLED=true` boots.
- Verified with the focused vitest file plus `core-api` lint and type-check.

## Active Failure Context
- None recorded.

## Codex Working Notes
- Update this section before ending each Codex turn.
- Record the active hypothesis, the exact failing test/check, what changed, and the next 1-3 actions.
- Keep the notes concise so future resume turns can pick up quickly.
- Active hypothesis: dev auth exposure came from `AuthModule` mounting `DevAuthController` unconditionally; fixing registration plus a startup assertion would satisfy both route and boot criteria.
- Exact failing test/check: `mise x node@20 -- pnpm --filter @atlaspm/core-api exec vitest run test/dev-auth-environment.test.ts` initially failed with `expected 404 "Not Found", got 401 "Unauthorized"` and `promise resolved instead of rejecting` for unsafe boot.
- What changed: added `src/auth/dev-auth-environment.ts`, `src/auth/dev-auth-environment.guard.ts`, and `src/auth/dev-auth.module.ts`; removed `DevAuthController` from `AuthModule`; imported `DevAuthModule.register()` in `AppModule`; added focused regression tests; set `NODE_ENV=test` in core integration boot; documented `NODE_ENV=development` for local dev auth.
- Next actions:
- 1. Commit this checkpoint on `codex/issue-312`.
- 2. If a DB is available next turn, run the broader `core-api` integration suite to confirm no boot regressions.
- 3. Open/update a draft PR once broader verification is in place.
