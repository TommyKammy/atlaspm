# Issue #312: P0: Gate dev auth controller registration behind safe environment checks

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/312
- Branch: codex/reopen-issue-312
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-312
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-312/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 2
- Last head SHA: 8ef726e858fe81ad7e149beee6bbfd302f62b490
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5y-9_s|PRRT_kwDORWcwRc5y--AL|PRRT_kwDORWcwRc5y--AY
- Repeated failure signature count: 1
- Updated at: 2026-03-09T10:45:38.448Z

## Latest Codex Summary
Addressed the three PR #316 review concerns in a focused follow-up: `AuthModule` is static again, `DevAuthController` moved into a separate optional `DevAuthModule`, missing `NODE_ENV` is now treated as unsafe, and `main.ts` preloads `.env` via `dotenv/config` before evaluating the startup guard.

Focused auth-env regression coverage now also asserts the unset-`NODE_ENV` case for both route registration and fail-fast boot semantics. Local dev docs/examples were updated to require `NODE_ENV=development` when using dev auth.

Summary: Resolved the three auth-env review threads by separating `DevAuthModule`, making `NODE_ENV` explicit, and loading `.env` before the startup guard.
State hint: addressing_review
Blocked reason: none
Tests: `pnpm --filter @atlaspm/core-api test -- test/dev-auth-environment.test.ts`; `pnpm --filter @atlaspm/core-api type-check`
Failure signature: none
Next action: Commit and push the review-fix follow-up to PR #316, then resolve the bot threads.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: The review feedback was valid and fixable without widening scope: split the dev controller into its own optional module, require explicit safe `NODE_ENV`, and load `.env` before the guard runs.
- Primary failure or risk: The only remaining risk is whether CI or reviewers want broader coverage than the focused auth-env suite; the reviewed issues themselves are locally addressed.
- Last focused command: `pnpm --filter @atlaspm/core-api test -- test/dev-auth-environment.test.ts`
- Files changed: `apps/core-api/src/auth/auth.module.ts`, `apps/core-api/src/auth/dev-auth.module.ts`, `apps/core-api/src/auth/dev-auth-environment.ts`, `apps/core-api/src/app.module.ts`, `apps/core-api/src/main.ts`, `apps/core-api/test/dev-auth-environment.test.ts`, `apps/core-api/.env.example`, `README.md`, `docs/startup-ubuntu.md`
- Next 1-3 actions:
  1. Commit and push the review-fix follow-up to PR #316.
  2. Resolve the three configured-bot review threads with the implementation rationale.
  3. If follow-up review requests broader coverage, run one targeted `core-api` integration slice.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Needed `pnpm install` in this worktree before `core-api` tests would run; initial failure was missing local `node_modules` / `prisma` binary.
- Focused regression coverage added in `apps/core-api/test/dev-auth-environment.test.ts`:
  - route available in `development` with `DEV_AUTH_ENABLED=true`
  - route absent in `production` even if `DEV_AUTH_ENABLED=true`
  - route absent when `NODE_ENV` is unset
  - startup/env guard allows `test`
  - startup/env guard throws in `production`
  - startup/env guard throws when `NODE_ENV` is unset
- Review-fix implementation:
  - `AuthModule` is static again to avoid duplicate module/provider instances.
  - `DevAuthController` now lives in `DevAuthModule`, which `AppModule` imports only in safe environments.
  - `main.ts` now preloads `.env` with `dotenv/config` before evaluating the startup guard.
  - local docs/examples now require `NODE_ENV=development` for dev-auth usage.
- Current focused verification passing:
  - `pnpm --filter @atlaspm/core-api test -- test/dev-auth-environment.test.ts`
  - `pnpm --filter @atlaspm/core-api type-check`
