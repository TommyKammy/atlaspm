# QA Regression Gates (P0-2)

This document defines mandatory validation commands and smoke scenarios for Asana-like UI iterations.

## Required Commands

Run from repo root:

```bash
pnpm -r --if-present lint
pnpm -r --if-present type-check
pnpm -r --if-present test
pnpm -r --if-present build
pnpm e2e
```

For Timeline/Gantt split rollout gate, also run:

```bash
pnpm e2e:timeline-gantt-rollout
```

Notes:
- `type-check` may be a no-op in some packages; keep command in the pipeline.
- If Docker/Colima is down, start it first:

```bash
colima start
docker compose -f infra/docker/docker-compose.yml up -d
```

## Mandatory E2E Coverage Areas

- Sidebar navigation between projects
- Add section appears immediately without refresh
- Quick add task appears immediately without refresh
- Manual reorder/move persists after refresh
- Assignee selection persists after refresh
- Rule edit persists after refresh
- Subtask tree create/expand/collapse/delete/navigation
- Timeline-only controls do not leak into Gantt
- Gantt-only controls do not leak into Timeline
- List/rules/admin/collab regressions remain green during Timeline/Gantt changes

## Manual Smoke Checklist

1. Open project list and switch project from sidebar.
2. Add section and confirm immediate render.
3. Add 2-3 tasks quickly with Enter.
4. Edit due date/progress/status inline and confirm update.
5. Expand/collapse subtask tree and verify structure.
6. Refresh and confirm all mutations persisted.

## Flake Handling Policy

- Retry failed E2E once only.
- If it fails twice, treat as product/infrastructure bug and file/attach evidence.
- Do not relax assertions to make CI green.

## Artifacts to Attach in PR

- Command results summary (pass/fail)
- Failing trace/video links when relevant
- Any known gap explicitly listed with next action
