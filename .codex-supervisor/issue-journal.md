# Issue #349: P2: Add regression coverage for follower subscriptions and notifications

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/349
- Branch: codex/reopen-issue-349
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-349
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-349/.codex-supervisor/issue-journal.md
- Current phase: repairing_ci
- Attempt count: 3
- Last head SHA: 31729a1027a15045dd75a28a805dd87d6a28e24f
- Blocked reason: none
- Last failure signature: e2e:fail
- Repeated failure signature count: 1
- Updated at: 2026-03-10T15:58:16.272Z

## Latest Codex Summary
The first E2E repair landed in `31729a1`, but the next PR rerun exposed one more deterministic timeline drag failure: `tests/timeline.spec.ts:509:5 › timeline working-days drag skips weekends and Alt keeps calendar-day placement`. CI showed the task never moved off Friday (`2026-03-06`) when the test expected Monday (`2026-03-09`) under working-days mode.

That test still used raw `page.mouse` dragging, so I aligned it to the same synthetic pointer-event helper style as the other stabilized timeline specs in [timeline.spec.ts](/home/tommy/Dev/atlaspm-worktrees/issue-349/e2e/playwright/tests/timeline.spec.ts). Local verification now passes for the isolated test, the whole `timeline.spec.ts` file, and the full Playwright suite. The full suite still reports retry-recovered flake in `gantt-risk.spec.ts`, `mvp.spec.ts`, and `timeline-root-cause.spec.ts`, but there is no remaining hard failure locally.

Summary: Reproduced the second failing E2E rerun, fixed the remaining raw-mouse timeline drag path in `timeline.spec.ts`, and got the full Playwright suite green locally.
State hint: repairing_ci
Blocked reason: none
Tests: `gh run view 22911147396 --job 66483848975 --log-failed`; `pnpm --filter @atlaspm/playwright exec playwright test e2e/playwright/tests/timeline.spec.ts --grep 'timeline working-days drag skips weekends and Alt keeps calendar-day placement'`; `pnpm --filter @atlaspm/playwright exec playwright test e2e/playwright/tests/timeline.spec.ts`; `pnpm --filter @atlaspm/playwright exec playwright test`
Failure signature: none
Next action: Commit and push the `timeline.spec.ts` drag-helper repair, then rerun/monitor PR #353’s E2E job.

## Active Failure Context
- Category: checks
- Summary: PR #353 has failing checks.
- Command or source: gh pr checks
- Reference: https://github.com/TommyKammy/atlaspm/pull/353
- Details:
  - e2e (fail/FAILURE) https://github.com/TommyKammy/atlaspm/actions/runs/22911147396/job/66483848975

## Codex Working Notes
### Current Handoff
- Hypothesis: PR #353’s current failing `e2e` rerun is another stale raw-mouse timeline drag helper, this time in `timeline.spec.ts`, rather than a follower regression.
- Primary failure or risk: The deterministic `timeline working-days drag skips weekends and Alt keeps calendar-day placement` failure is fixed locally. Remaining risk is broader browser-suite flake, not a known hard failure.
- Last focused command: `pnpm --filter @atlaspm/playwright exec playwright test`
- Files changed: `e2e/playwright/tests/timeline.spec.ts`
- Next 1-3 actions:
  1. Commit the `timeline.spec.ts` pointer-event drag repair on `codex/reopen-issue-349`.
  2. Push the branch to update PR #353 and rerun the failing E2E job.
  3. Watch for repeat failures in the known flaky browser specs (`gantt-risk`, `mvp`, `timeline-root-cause`).

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Second CI repair reproduction:
  - `gh run view 22911147396 --job 66483848975 --log-failed` showed a single hard failure in `tests/timeline.spec.ts:509:5 › timeline working-days drag skips weekends and Alt keeps calendar-day placement`.
  - CI failure detail: after dragging one day with working-days mode enabled, the task stayed at `2026-03-06T00:00:00.000Z` instead of moving to `2026-03-09T00:00:00.000Z`.
  - The isolated spec passed locally sometimes, but the raw-mouse drag path matched the same fragility pattern already fixed in the other timeline specs, so the repair was to switch this test to a synthetic pointer-event drag helper as well.
- Failure signature:
  - `timeline-working-days-drag-page-mouse`
- Current focused verification:
  - `gh run view 22911147396 --job 66483848975 --log-failed`
  - `pnpm --filter @atlaspm/playwright exec playwright test e2e/playwright/tests/timeline.spec.ts --grep 'timeline working-days drag skips weekends and Alt keeps calendar-day placement'`
  - `pnpm --filter @atlaspm/playwright exec playwright test e2e/playwright/tests/timeline.spec.ts`
  - `pnpm --filter @atlaspm/playwright exec playwright test`
- Implementation notes:
  - Added `timelineBarBox` and `dragTimelineBarHorizontally` helpers in `timeline.spec.ts` so the working-days drag test uses the same pointer-event model as the other stabilized timeline drag specs.
  - Passed `altKey` through the synthetic pointer events so the calendar-day override path is exercised without depending on separate keyboard timing.
  - Latest full local Playwright run exited green but still reported retry-recovered flake in `tests/gantt-risk.spec.ts`, `tests/mvp.spec.ts`, and `tests/timeline-root-cause.spec.ts`.
