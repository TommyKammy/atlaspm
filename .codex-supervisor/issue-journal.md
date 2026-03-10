# Issue #339: P2: Refactor search reindex to streaming or chunked processing

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/339
- Branch: codex/reopen-issue-339
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-339
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-339/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 2
- Last head SHA: 22f7865eefbb031791036cecf6320750a43f01ba
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5zRsxa|PRRT_kwDORWcwRc5zRsxz|PRRT_kwDORWcwRc5zRsyM
- Repeated failure signature count: 1
- Updated at: 2026-03-10T11:48:08.218Z

## Latest Codex Summary
Addressed the three automated review threads on PR #342. The regression test now imports `SEARCH_REINDEX_BATCH_SIZE` from production code, the chunked custom-field fetch now uses a narrow `select`, and `SearchService.reindexAll()` now stops without overcounting when a batch indexing failure disables search. Added a focused `search.service.test.ts` regression for the mid-reindex failure path.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: Reindex memory pressure comes from controller-side full-corpus `task.findMany()` and `taskCustomFieldValue.findMany()`, so the fix is to page tasks by stable cursor and fetch metadata only for the current chunk.
- Primary failure or risk: Review-thread fixes are local and verified, but the branch still needs a push and thread resolution on PR #342.
- Last focused command: `pnpm --filter @atlaspm/core-api type-check`
- Files changed: `apps/core-api/src/search/search.controller.ts`, `apps/core-api/src/search/search.service.ts`, `apps/core-api/test/search.controller.test.ts`, and `apps/core-api/test/search.service.test.ts`
- Next 1-3 actions:
  1. Commit the review-thread fixes on `codex/reopen-issue-339`.
  2. Push the branch and update PR #342.
  3. Resolve the automated review threads if no new issues appear.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Focused reproduction:
  - Added `apps/core-api/test/search.controller.test.ts` with a mocked `SearchService.reindexAll()` consumer that iterates an async batch stream.
  - Initial failure: `TypeError: Cannot read properties of undefined (reading 'length')` because the controller still passed a fully materialized task array instead of batch objects.
  - Dependency install was required in this worktree before tests would run: `pnpm install`.
- Failure signature:
  - `none`
- Current focused verification:
  - `pnpm --filter @atlaspm/core-api test -- test/search.controller.test.ts test/search.service.test.ts`
  - `pnpm --filter @atlaspm/core-api type-check`
- Implementation notes:
  - `SearchController.reindexAll()` now passes `this.streamReindexBatches()` into the service instead of materializing all tasks and custom-field values up front.
  - Batches are ordered by `task.id ASC` with `take: 1000` and `cursor + skip: 1` pagination.
  - Each batch fetches only the scalar fields needed for metadata (`taskId`, `value*`, `option.label/value`) before building `metadataByTaskId`.
  - `SearchService.indexTasks()` now returns a success flag so `reindexAll()` can stop without inflating the processed count after a backend failure disables search.
  - Added `apps/core-api/test/search.service.test.ts` to prove a mid-reindex Algolia failure stops subsequent batches and only reports successfully indexed tasks.
