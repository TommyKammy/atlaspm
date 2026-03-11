# Integration Provider Contract

## Purpose
- `core-api` owns integration persistence, authorization, audit, outbox, and secret handling.
- Providers implement auth, sync, and webhook/event handling behind a shared contract so core flows do not branch per provider.

## Storage Contracts
- `IntegrationProviderConfig`
  - Workspace-scoped provider instance metadata.
  - Stores provider kind, stable key, display name, connection status, non-secret settings, and actor metadata.
- `IntegrationCredential`
  - Secret material attached to a provider config.
  - Stores only encrypted ciphertext and/or an external secret reference plus a redacted preview.
  - Plaintext credentials must never be persisted or emitted to audit/outbox payloads.
- `IntegrationSyncState`
  - Cursor and scheduling state for provider jobs.
  - Stores scope, status, last/next sync timestamps, cursor, and last error details.
- `IntegrationEntityMapping`
  - Canonical mapping between AtlasPM ids and external provider ids.
  - Uniqueness is enforced both from internal to external and from external back to internal for each provider config and entity type.

## Provider Interface
- `IntegrationProvider.authorize(...)`
  - Starts or finalizes provider-specific auth and returns a normalized status.
- `IntegrationProvider.sync(...)`
  - Runs or queues sync work against a provider config + scope using shared sync state.
- `IntegrationProvider.handleWebhook(...)`
  - Verifies inbound requests, normalizes provider-specific payloads, and returns a shared webhook result.
- `IntegrationProvider.describeJobs()`
  - Declares background jobs that plug into shared infrastructure.

## Shared Infrastructure Expectations
- Audit + outbox
  - Provider config writes and mapping writes should append audit/outbox through the existing `DomainService.appendAuditOutbox(...)` path.
  - Provider workers should emit provider-scoped event types such as `integration.sync.started` or provider-specific task events without bypassing the shared outbox.
- Authorization
  - Workspace membership gates reads.
  - Workspace admin gates provider config changes, credential rotation, and manual sync triggers unless a narrower policy is introduced later.
- Secrets
  - Raw secrets stay in memory only long enough to encrypt or forward into an external secret store.
  - Logs, audit rows, outbox payloads, and API responses must contain only redacted secret metadata.
- Jobs
  - Shared workers should poll `IntegrationSyncState.nextSyncAt` and update `status`, `cursor`, `lastSyncedAt`, and error fields transactionally.
  - Webhook handlers may enqueue sync work by updating `IntegrationSyncState` rather than embedding provider-specific schedulers in controllers.

## Slack Example
- `SlackIntegrationProvider` is the first implementation against the contract.
- Current Slack capability is webhook/event handling plus outbound notifications.
- Auth and sync return `not_supported` today, but the provider still plugs into the same contract and registry used by future providers.
