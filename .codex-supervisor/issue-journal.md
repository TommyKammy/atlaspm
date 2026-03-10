# Issue #339: P2: Refactor search reindex to streaming or chunked processing

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/339
- Branch: codex/reopen-issue-339
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-339
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-339/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: d58933a5036fd6f2fc4a617aa378826eeef901e7
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-10T11:31:52.278Z

## Latest Codex Summary
- Added a focused `SearchController` regression test that fails unless `POST /search/reindex` paginates tasks deterministically and fetches custom-field values per chunk.
- Refactored reindex so the controller yields `id`-ordered batches of tasks plus per-batch metadata, and `SearchService.reindexAll()` now consumes an async batch stream with per-batch progress logging.
- Focused verification passed with the new regression and `@atlaspm/core-api` type-check.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: Reindex memory pressure comes from controller-side full-corpus `task.findMany()` and `taskCustomFieldValue.findMany()`, so the fix is to page tasks by stable cursor and fetch metadata only for the current chunk.
- Primary failure or risk: Reindex now uses bounded batches, but there is still only focused unit coverage; no end-to-end run against a search-enabled environment yet.
- Last focused command: `pnpm --filter @atlaspm/core-api type-check`
- Files changed: `apps/core-api/src/search/search.controller.ts`, `apps/core-api/src/search/search.service.ts`, and `apps/core-api/test/search.controller.test.ts`
- Next 1-3 actions:
  1. Commit the chunked reindex checkpoint on `codex/reopen-issue-339`.
  2. Decide whether to add a second service-level regression or broader search-enabled verification.
  3. Open or update a draft PR if the checkpoint should be reviewed early.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Focused reproduction:
  - Added `apps/core-api/test/search.controller.test.ts` with a mocked `SearchService.reindexAll()` consumer that iterates an async batch stream.
  - Initial failure: `TypeError: Cannot read properties of undefined (reading 'length')` because the controller still passed a fully materialized task array instead of batch objects.
  - Dependency install was required in this worktree before tests would run: `pnpm install`.
- Failure signature:
  - `search-reindex-unbounded-array`
- Current focused verification:
  - `pnpm --filter @atlaspm/core-api test -- test/search.controller.test.ts`
  - `pnpm --filter @atlaspm/core-api type-check`
- Implementation notes:
  - `SearchController.reindexAll()` now passes `this.streamReindexBatches()` into the service instead of materializing all tasks and custom-field values up front.
  - Batches are ordered by `task.id ASC` with `take: 1000` and `cursor + skip: 1` pagination.
  - Each batch fetches only that chunk's custom-field values and builds `metadataByTaskId` locally before yielding.
  - `SearchService.reindexAll()` now clears the index once, indexes each yielded batch, logs cumulative progress, and returns the processed task count.
