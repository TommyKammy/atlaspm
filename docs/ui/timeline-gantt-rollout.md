# Timeline/Gantt Rollout Playbook (P5-5)

This playbook defines the release gate for Timeline/Gantt split changes and the regression checks that must stay green before merge.

## Purpose

- Keep Timeline and Gantt responsibilities isolated.
- Prevent regressions in critical adjacent flows: List, Rules, Admin, and Collaboration.
- Leave an auditable rollout and rollback trail.

## Required Validation

Run from repository root:

```bash
pnpm -r --if-present lint
pnpm -r --if-present type-check
pnpm -r --if-present test
pnpm -r --if-present build
pnpm e2e:timeline-gantt-rollout
```

The focused rollout suite executes:

- `tests/timeline-gantt-boundary.spec.ts`
- `tests/timeline-route.spec.ts`
- `tests/timeline-swimlane.spec.ts`
- `tests/gantt-risk.spec.ts`
- `tests/gantt-baseline.spec.ts`
- `tests/list-deadline-sort.spec.ts`
- `tests/rules.spec.ts`
- `tests/admin.spec.ts`
- `tests/collab.spec.ts`

Use full-suite validation (`pnpm e2e`) for release candidates and after high-risk changes.

## Rollout Steps

1. Merge Timeline/Gantt split changes through PR only.
2. Confirm CI + `pnpm e2e:timeline-gantt-rollout` are green.
3. Smoke verify production-like environment:
   - `/projects/:id?view=timeline`
   - `/projects/:id?view=gantt`
   - `/projects/:id?view=list`
4. Monitor first deployment window for UI errors and E2E failures.
5. Continue to full rollout only when no regressions are detected.

## Metrics To Record Per Rollout

- CI pass/fail for `lint`, `type-check`, `test`, `build`, `e2e`.
- Focused rollout suite duration and failure count.
- Number of rollback-triggering bugs in first 24h.
- User-visible incidents related to:
  - Timeline controls shown in Gantt
  - Gantt controls shown in Timeline
  - List deadline ordering
  - Rules/Admin/Collab workflow breakage

## Rollback Strategy

1. Revert the offending PR(s) from `main`.
2. Re-run:
   - `pnpm -r --if-present test`
   - `pnpm e2e:timeline-gantt-rollout`
3. Redeploy only after focused suite is green.
