# Issue #349: P2: Add regression coverage for follower subscriptions and notifications

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/349
- Branch: codex/reopen-issue-349
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-349
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-349/.codex-supervisor/issue-journal.md
- Current phase: repairing_ci
- Attempt count: 2
- Last head SHA: 289880eb571246ebfe7eedf8e058a3034abbd1dc
- Blocked reason: none
- Last failure signature: e2e:fail
- Repeated failure signature count: 1
- Updated at: 2026-03-10T15:36:41.868Z

## Latest Codex Summary
Reproduced the failing PR #353 E2E job locally and confirmed the breakage was unrelated to the new follower coverage. The red CI signal came from three timeline drag tests: `timeline drag on a parent task offers undo when many subtasks stay in place`, `timeline dependency connectors stay attached after manual layout and across grouped lanes`, and `timeline drag can move task across assignee lanes into unassigned`.

The shared cause was stale drag helpers in `timeline-drag-reschedule.spec.ts` and `timeline-swimlane.spec.ts` that still used `page.mouse` drags. The stabilized timeline root-cause specs had already moved to synthetic pointer events dispatched to the timeline bars plus `window` pointer listeners, which matches the current timeline implementation more reliably. I aligned the failing specs to that helper style and added a guarded second click in the grouped date-sync test to account for the intentional post-drag click suppression on timeline bars.

Summary: Repaired the failing E2E job by updating legacy timeline drag helpers to the current pointer-event interaction path and verified the full Playwright suite passes locally.
State hint: repairing_ci
Blocked reason: none
Tests: `gh run view 22910065896 --job 66480144364 --log-failed`; `pnpm --filter @atlaspm/playwright exec playwright test e2e/playwright/tests/timeline-drag-reschedule.spec.ts e2e/playwright/tests/timeline-swimlane.spec.ts --grep 'timeline drag on a parent task offers undo when many subtasks stay in place|timeline dependency connectors stay attached after manual layout and across grouped lanes|timeline drag can move task across assignee lanes into unassigned'`; `pnpm --filter @atlaspm/playwright exec playwright test e2e/playwright/tests/timeline-drag-reschedule.spec.ts e2e/playwright/tests/timeline-swimlane.spec.ts`; `pnpm --filter @atlaspm/playwright exec playwright test`
Failure signature: none
Next action: Commit and push the timeline E2E repair so PR #353 can rerun the browser job.

## Active Failure Context
- Category: checks
- Summary: PR #353 has failing checks.
- Command or source: gh pr checks
- Reference: https://github.com/TommyKammy/atlaspm/pull/353
- Details:
  - e2e (fail/FAILURE) https://github.com/TommyKammy/atlaspm/actions/runs/22910065896/job/66480144364

## Codex Working Notes
### Current Handoff
- Hypothesis: PR #353’s failing `e2e` check was caused by outdated timeline drag test helpers rather than follower coverage or product logic in the follower surfaces.
- Primary failure or risk: The three CI-red timeline tests now pass locally with pointer-event helpers, and a full Playwright run passes. Residual risk is limited to one `timeline grouped bars stay in sync with drawer date edits after drag reschedule` retry during the full pass, but it recovered and the suite exited cleanly.
- Last focused command: `pnpm --filter @atlaspm/playwright exec playwright test`
- Files changed: `e2e/playwright/tests/timeline-drag-reschedule.spec.ts` and `e2e/playwright/tests/timeline-swimlane.spec.ts`
- Next 1-3 actions:
  1. Commit the timeline E2E repair on `codex/reopen-issue-349`.
  2. Push the branch to update PR #353 and rerun the failing E2E job.
  3. Watch the rerun for any remaining flake in `timeline-swimlane.spec.ts:989`.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- CI repair reproduction:
  - `gh run view 22910065896 --job 66480144364 --log-failed` showed three failures in `timeline-drag-reschedule.spec.ts` and `timeline-swimlane.spec.ts`, while `tests/followers.spec.ts` was already green in CI.
  - Reproduced the same three failures locally with `pnpm --filter @atlaspm/playwright exec playwright test ... --grep ...`.
  - Shared local failures: missing `timeline-parent-move-undo-banner`, unchanged task order after vertical drag, and assignee lane drag leaving `assigneeUserId` at `null`.
- Failure signature:
  - `timeline-drag-helper-page-mouse`
- Current focused verification:
  - `gh run view 22910065896 --job 66480144364 --log-failed`
  - `pnpm --filter @atlaspm/playwright exec playwright test e2e/playwright/tests/timeline-drag-reschedule.spec.ts e2e/playwright/tests/timeline-swimlane.spec.ts --grep 'timeline drag on a parent task offers undo when many subtasks stay in place|timeline dependency connectors stay attached after manual layout and across grouped lanes|timeline drag can move task across assignee lanes into unassigned'`
  - `pnpm --filter @atlaspm/playwright exec playwright test e2e/playwright/tests/timeline-drag-reschedule.spec.ts e2e/playwright/tests/timeline-swimlane.spec.ts`
  - `pnpm --filter @atlaspm/playwright exec playwright test`
- Implementation notes:
  - Replaced legacy `page.mouse` drag helpers with synthetic pointer-event helpers that dispatch `pointerdown` on the bar and `pointermove`/`pointerup` on `window`, matching the current timeline drag implementation.
  - Added `scrollIntoViewIfNeeded()` and bounding-box polling before drags so tests do not start from stale geometry.
  - Added a guarded second click in the grouped timeline date-sync test because timeline intentionally suppresses the first post-drag click on the same bar.
