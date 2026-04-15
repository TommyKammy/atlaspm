# Issue #391: P0: Break domain service into focused core services

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/391
- Branch: codex/issue-391
- Workspace: .
- Journal: .codex-supervisor/issues/391/issue-journal.md
- Current phase: reproducing
- Attempt count: 1 (implementation=1, repair=0)
- Last head SHA: 2e1253bfef1ca7d322f3cb688cdcc05669d6992a
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-04-15T09:26:57.123Z

## Latest Codex Summary
- Added focused tests for extracted authorization/default-workspace behavior, introduced focused common services (`AuthorizationService`, `AuditOutboxService`, `IdentityService`, `WorkspaceDefaultsService`), and trimmed `DomainService` to pure helpers plus a temporary delegating facade while migrations continue.

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: The safest path is to pin one narrow behavior first, extract service ownership, then migrate consumers in batches while leaving a thin `DomainService` facade until the last call sites are moved.
- What changed: Added `domain.default-workspace.service.test.ts`; moved auth/membership, audit/outbox, identity sync, and default-workspace/project-default logic into dedicated services under `apps/core-api/src/common/`; added `CommonServicesModule`; migrated `AuthGuard`, `ProjectRoleGuard`, `WorkspaceRoleGuard`, `AuditController`, `WorkspacesController`, and `ProjectsController` to direct focused services; updated the guest-authorization test to target `AuthorizationService`.
- Current blocker: No hard blocker. Remaining work is broad consumer migration off the temporary `DomainService` facade.
- Next exact step: Migrate the next high-volume controller/service buckets (`rules`, `tasks`, task adjunct services, workspace admin, integrations/goals/capacity/workload) to inject `AuthorizationService` and/or `AuditOutboxService` directly, then remove the delegating methods from `DomainService`.
- Verification gap: Full `lint` and full `core-api test` suite have not been run yet; only focused tests plus `type-check` were executed after the extraction scaffold.
- Files touched: `apps/core-api/src/common/*`, `apps/core-api/src/auth/auth.guard.ts`, `apps/core-api/src/auth/role.guard.ts`, `apps/core-api/src/auth/auth.module.ts`, `apps/core-api/src/app.module.ts`, `apps/core-api/src/audit/audit.controller.ts`, `apps/core-api/src/workspaces/workspaces.controller.ts`, `apps/core-api/src/projects/projects.controller.ts`, module files for portfolios/goals/integrations/capacity/workload/task-project-links, and focused tests in `apps/core-api/test/`.
- Rollback concern: `DomainService` is currently a compatibility facade over the new services; removing it too early without migrating remaining consumers will break compile-time contracts.
- Last focused command: `pnpm --filter @atlaspm/core-api type-check`
### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
