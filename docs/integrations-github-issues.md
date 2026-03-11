# GitHub Issues Integration

## Purpose
- Reference provider for the shared integration runtime.
- Connect one GitHub repository to one AtlasPM project and import issues on demand.

## Required Setup
- Create a GitHub personal access token that can read the target repository's issues and metadata.
- Set `INTEGRATION_CREDENTIAL_SECRET` in `apps/core-api/.env` so AtlasPM can encrypt stored provider credentials.
- From the workspace Integrations page:
  - choose a stable connection key
  - enter the GitHub owner and repository name
  - select the AtlasPM project that should receive imported issues
  - paste the personal access token

## Current Mapping Rules
- Each imported GitHub issue maps to one AtlasPM task through `IntegrationEntityMapping`.
- The mapping uses the GitHub issue id as the stable external id.
- New issues create new AtlasPM tasks in the selected project's default section.
- Existing mapped issues update the linked AtlasPM task title, description, status, completion state, and apply static GitHub-related tags (for example, `github` and `github:owner/repo`; GitHub labels are not currently synced as AtlasPM tags).
- Open issues map to `TODO`.
- Closed issues map to `DONE`.
- Task descriptions include the GitHub issue number and source URL for traceability.

## Constraints
- One integration config targets one repository and one AtlasPM project.
- Pull requests are skipped; only issue records are imported.
- Sync is manual right now from the workspace UI or sync endpoint.
- GitHub webhooks are not implemented in this slice.

## Observable Workflow
1. Connect GitHub from `/workspaces/:workspaceId/integrations`.
2. The API validates the token and repository through `GithubIntegrationProvider.authorize(...)`.
3. Trigger `Import issues`.
4. AtlasPM creates or updates tasks and persists sync state plus entity mappings through the shared runtime.
