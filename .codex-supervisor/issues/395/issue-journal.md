# Issue #395: P1: Split backend integration coverage by feature boundary

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/395
- Branch: codex/issue-395
- Workspace: .
- Journal: .codex-supervisor/issues/395/issue-journal.md
- Current phase: reproducing
- Attempt count: 1 (implementation=1, repair=0)
- Last head SHA: 62dd0ab312442618a1d8958aafb15fb9ec51781c
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-04-16T01:18:43.882Z

## Latest Codex Summary
- None yet.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: The safest first split is to centralize the Nest app bootstrap once, then move one narrow feature slice out of `core.integration.test.ts` and prove the wrapper still drives the same tests.
- What changed: Added `apps/core-api/test/core-integration/testkit.ts` for shared setup/live bindings, extracted the bootstrap + reminder tests into `apps/core-api/test/core-integration/bootstrap-and-reminders.ts`, and replaced the inline setup/first two tests in `apps/core-api/test/core.integration.test.ts` with the shared harness plus feature registration.
- Current blocker: The monolith is only partially split; the remaining 58 tests still need to be moved into feature-scoped modules before `core.integration.test.ts` becomes a thin compatibility wrapper.
- Next exact step: Extract the next coherent slice from the monolith, starting with attachments or notifications, into `apps/core-api/test/core-integration/*` using the same shared harness.
- Verification gap: Only the two focused extracted tests were rerun; the full `core.integration.test.ts`, `pnpm --filter @atlaspm/core-api test`, and `pnpm verify:ci` have not been rerun yet.
- Files touched: `apps/core-api/test/core.integration.test.ts`, `apps/core-api/test/core-integration/testkit.ts`, `apps/core-api/test/core-integration/bootstrap-and-reminders.ts`
- Rollback concern: Low; the wrapper still owns the suite and the extracted module is behavior-preserving, but the live proxy/string binding helper should stay covered as more slices move.
- Last focused command: `pnpm --filter @atlaspm/core-api exec -- vitest run test/core.integration.test.ts -t "users can configure reminder delivery preferences and opt out of reminder delivery"`
### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
