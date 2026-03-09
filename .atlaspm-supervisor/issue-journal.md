# Issue #313: P0: Remove default dev auth secret fallback and require explicit secret

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/313
- Branch: codex/issue-313
- Workspace: /Users/tomoakikawada/Dev/atlaspm-worktrees/issue-313
- Journal: /Users/tomoakikawada/Dev/atlaspm-worktrees/issue-313/.atlaspm-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: c183677c4e06cb4f8f16b22e3619781fa3993e02
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-09T10:51:51.329Z

## Latest Codex Summary
- Added explicit dev auth secret validation so dev auth now rejects missing, placeholder, and too-short secrets at startup and in `AuthService`; pushed `codex/issue-313` and opened draft PR #319.

## Active Failure Context
- None recorded.

## Codex Working Notes
- Update this section before ending each Codex turn.
- Record the active hypothesis, the exact failing test/check, what changed, and the next 1-3 actions.
- Keep the notes concise so future resume turns can pick up quickly.
- Active hypothesis: the remaining #313 gap was the `DEV_AUTH_SECRET ?? 'dev-secret'` fallback in `AuthService`; a shared validator used by both startup checks and token operations should close it cleanly.
- Exact failing test/check: `mise x node@20 -- pnpm --filter @atlaspm/core-api exec vitest run test/dev-auth-environment.test.ts` initially failed with `promise resolved instead of rejecting` for missing secret, `dev-secret`, `dev-secret-change-me`, and `short-secret`.
- Commands run: `mise x node@20 -- pnpm install --frozen-lockfile`; `mise x node@20 -- pnpm --filter @atlaspm/core-api prisma:generate`; `mise x node@20 -- pnpm --filter @atlaspm/core-api exec vitest run test/dev-auth-environment.test.ts`; `mise x node@20 -- pnpm --filter @atlaspm/core-api type-check`.
- What changed: added `src/auth/dev-auth-secret.ts`; updated `AuthService` to require a validated secret instead of falling back; extended `assertSafeDevAuthEnvironment()` to validate the secret on boot; expanded focused tests for missing/default/short secrets; switched core integration tests to an explicit strong dev secret; updated README and Ubuntu startup docs; committed as `c090109` (`Require explicit strong dev auth secret`) and opened draft PR #319.
- Next actions:
- 1. If local Postgres is available, run the broader `@atlaspm/core-api` integration suite to confirm there are no DB-backed boot regressions.
- 2. Add PR updates if broader verification turns up no regressions.
- 3. Triage any CI failures once checks appear on PR #319.
