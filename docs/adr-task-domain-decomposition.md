# ADR: Task Domain Decomposition and Controller Split

## Status

Accepted

## Date

2026-03-10

## Context

`apps/core-api/src/tasks/tasks.controller.ts` currently concentrates most task-facing HTTP behavior in a single controller. The class owns:

- task list/detail/create/update/delete/restore and bulk mutations
- task completion, reschedule, reorder, and custom-field writes
- project timeline preferences, manual layout, view-state persistence, and timeline move behavior
- task description persistence plus mention projection for descriptions and comments
- comment CRUD, attachment upload lifecycle, and reminder CRUD
- dependency, subtask, breadcrumb, blocked-state, and dependency-graph endpoints

This concentration makes the controller hard to reason about before any extraction starts:

- route ownership is implicit instead of documented
- side effects such as audit/outbox writes, notifications, mention sync, and attachment storage transitions are easy to break during a split
- timeline behavior has materially different coupling and test needs than core task CRUD
- rollback becomes risky if extraction PRs mix endpoint moves with behavioral changes

Issue #340 exists to define the contract before structural refactoring begins.

## Current Controller Responsibility Map

Current feature groupings inside `TasksController`:

- `task-core`
  - `GET /projects/:id/tasks`
  - `GET /tasks/:id`
  - `POST /projects/:id/tasks`
  - `PATCH /tasks/:id`
  - `PATCH /tasks/:id/reschedule`
  - `PATCH /tasks/:id/custom-fields`
  - `POST /tasks/:id/complete`
  - `DELETE /tasks/:id`
  - `POST /tasks/:id/restore`
  - `POST /tasks/bulk`
  - `POST /sections/:sectionId/tasks/reorder`
- `timeline`
  - `GET /projects/:id/timeline/preferences`
  - `PUT /projects/:id/timeline/preferences/:groupBy`
  - `PUT /projects/:id/timeline/preferences/manual-layout/:groupBy`
  - `PUT /projects/:id/timeline/preferences/view-state/:mode`
  - `PATCH /tasks/:id/timeline-move`
- `comments-mentions`
  - `PATCH /tasks/:id/description`
  - `GET /tasks/:id/mentions`
  - `GET /tasks/:id/comments`
  - `POST /tasks/:id/comments`
  - `PATCH /comments/:id`
  - `DELETE /comments/:id`
- `attachments`
  - `GET /tasks/:id/attachments`
  - `POST /tasks/:id/attachments/initiate`
  - `POST /attachments/:id/upload`
  - `POST /tasks/:id/attachments/complete`
  - `DELETE /attachments/:id`
  - `POST /attachments/:id/restore`
- `reminders`
  - `GET /tasks/:id/reminder`
  - `PUT /tasks/:id/reminder`
  - `DELETE /tasks/:id/reminder`
- `dependencies-subtasks`
  - `POST /tasks/:id/subtasks`
  - `GET /tasks/:id/subtasks`
  - `GET /tasks/:id/subtasks/tree`
  - `GET /tasks/:id/breadcrumbs`
  - `POST /tasks/:id/dependencies`
  - `DELETE /tasks/:id/dependencies/:dependsOnId`
  - `GET /tasks/:id/dependencies`
  - `GET /tasks/:id/dependents`
  - `GET /tasks/:id/blocked`
  - `GET /projects/:id/dependency-graph`

## Decision

AtlasPM will split the current task controller by bounded feature slice inside `apps/core-api` before considering package-level extraction. The first step is not new domain behavior; it is moving route ownership into explicit modules while preserving the public API contract.

Target slices:

- `task-core`
  - Owns the canonical task aggregate HTTP surface: list, detail, create, patch, custom-field updates, complete/reopen, soft delete/restore, bulk mutations, reorder, and non-timeline reschedule.
  - Owns the shared task serializer and any request-level project/task authorization helpers used by the other slices.
  - Remains the only slice allowed to change task base fields (`title`, `status`, `priority`, `assigneeUserId`, dates, tags, `section`, `progressPercent`, and task version checks).
- `comments-mentions`
  - Owns task description writes, comment CRUD, mention reads, mention parsing/projection, and mention-triggered notification side effects.
  - May depend on `task-core` read helpers for authorization and task existence, but not on timeline or attachment internals.
- `attachments`
  - Owns attachment metadata reads, initiate/upload/complete flow, restore/delete, upload token validation, and signed download URL generation.
  - Must preserve the current storage contract and audit/outbox events.
- `reminders`
  - Owns reminder CRUD plus reminder-worker integration.
  - Must keep reminder delivery semantics and idempotent worker claims isolated from comment or attachment changes.
- `dependencies-subtasks`
  - Owns subtask creation/tree queries, dependency writes, blocked-state queries, breadcrumb queries, and project dependency graph reads.
  - Continues to use the existing `SubtaskService` as the main orchestration boundary until a later ADR defines a deeper domain extraction.
- `timeline`
  - Owns timeline preferences, grouped lane ordering, manual layout persistence, view-state persistence, and `timeline-move`.
  - Continues to depend on shared task read/update helpers from `task-core`, but keeps manual-layout and swimlane rules isolated from generic task CRUD.

## Module Boundary Rules

- Split by feature-owned route surface first, not by HTTP verb, DTO type, or database table.
- Keep all task-related routes in `apps/core-api` during this phase; this ADR does not authorize a new deployable service.
- Shared helpers may move into `tasks/` support modules, but shared helpers must stay thin:
  - authorization lookup
  - common serializers
  - audit/outbox helper primitives
  - common validation utilities already used across slices
- Cross-slice calls should be one-way toward `task-core` read/update helpers or existing shared services. `timeline` must not call into `comments-mentions`, `attachments`, or `reminders`.
- Extraction PRs must not rename routes, change payload shapes, or move tables between schemas.

## Extraction Sequence

1. Establish characterization coverage around the current route contract and shared serializers.
2. Extract `task-core` helpers and controller first so other slices depend on stable authorization/task-loading utilities instead of the monolith class internals.
3. Extract `comments-mentions` next because it has distinct notification and mention-sync behavior but limited overlap with timeline/manual-layout logic.
4. Extract `attachments` after comments because its route surface is self-contained once task authorization helpers are shared.
5. Extract `reminders` next because it is behaviorally isolated but still task-scoped.
6. Extract `dependencies-subtasks` after reminders, preserving the current `SubtaskService` boundary.
7. Extract `timeline` last because it has the highest coupling to ordering, custom fields, manual layout state, and task move semantics.

## Test Ownership

- `task-core`
  - Owns route-contract tests for task CRUD, bulk mutation, reorder, and custom-field writes in `apps/core-api/test`.
  - Owns pure task invariant tests in `packages/domain` where logic is already package-safe.
- `comments-mentions`
  - Owns controller/service tests for description versioning, comment CRUD, mention sync, and notification side effects.
- `attachments`
  - Owns upload lifecycle tests, token validation tests, and soft-delete/restore tests.
- `reminders`
  - Owns reminder endpoint tests plus worker idempotence coverage.
- `dependencies-subtasks`
  - Owns service/controller tests for graph mutation, blocked-state reads, and breadcrumb/tree queries.
- `timeline`
  - Owns controller tests for preferences/manual layout/view state and task move contracts in `apps/core-api/test`.
  - Owns pure layout/order logic tests in `packages/domain` where the logic stays framework-independent.

Each extraction PR must move or add tests with the slice it extracts. Do not leave slice-specific tests attached to the legacy controller after the route has moved.

## Rollback Constraints

- Every extraction must be behavior-preserving. No extraction PR may combine the controller split with product-level endpoint changes.
- Keep route paths, DTO fields, audit actions, and outbox event types stable during the split.
- Keep database schema changes out of controller-split PRs unless a separate approved ADR explicitly requires them.
- Land one slice at a time. If a slice extraction regresses, rollback is a straightforward revert of that slice PR without unwinding unrelated route moves.
- Preserve a short-lived delegation path when useful:
  - a legacy controller method may forward to the new slice during the transition
  - remove delegation only after slice-local tests pass and call sites are updated
- `timeline` extraction is blocked on earlier slices being stable because it is the highest-coupling rollback risk.

## Consequences

- The task domain will remain in one app boundary for now, but route ownership and tests become explicit enough to support later package extraction.
- Refactoring work can proceed slice-by-slice with clearer PR scope and review ownership.
- The cost is temporary duplication of DTOs/helpers while seams are clarified. That duplication is acceptable if it reduces cross-slice hidden coupling.
