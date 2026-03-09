# Issue #330: P1: Write ADR for browser auth migration off localStorage bearer tokens

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/330
- Branch: codex/reopen-issue-330
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-330
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-330/.codex-supervisor/issue-journal.md
- Current phase: reproducing
- Attempt count: 1
- Last head SHA: 37de43c68f5b75797973b5fe5333948ee8a7fc42
- Blocked reason: none
- Last failure signature: none
- Repeated failure signature count: 0
- Updated at: 2026-03-10T06:40:06+09:00

## Latest Codex Summary
- Added `docs/adr-browser-auth-session.md` and linked it from `docs/architecture.md`.
- The ADR records the current browser auth anti-pattern (`localStorage` bearer tokens), chooses a `core-api` managed `HttpOnly` cookie session model, and spells out CSRF, rotation, dev-mode, and rollout constraints.
- Focused verification is currently limited by missing workspace dependencies in this worktree (`tsc` not installed because `node_modules` is absent).

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: The current browser auth risk is not an execution bug but an architecture/documentation gap: `web-ui` still depends on `localStorage` bearer tokens, and the repo lacked an ADR defining the replacement session model.
- Primary failure or risk: Follow-on implementation issues could diverge unless they share one concrete decision for browser sessions, OIDC interaction, CSRF, rotation, and backward compatibility.
- Last focused command: `pnpm --filter @atlaspm/web-ui type-check`
- Files changed: `docs/adr-browser-auth-session.md`, `docs/architecture.md`
- Next 1-3 actions:
  1. Commit the ADR and architecture link on `codex/reopen-issue-330`.
  2. Push the branch and open/update a draft PR if one does not already exist.
  3. Hand off to implementation issues for `core-api` session plumbing and `web-ui` cookie-session migration.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Focused reproduction:
  - `apps/web-ui/src/app/login/page.tsx` uses `POST /dev-auth/token` and stores the returned token in browser state.
  - `apps/web-ui/src/lib/api.ts` reads `atlaspm_token` from `localStorage` and attaches it as `Authorization: Bearer ...`.
  - `apps/core-api/src/auth/auth.service.ts` authenticates requests from that bearer header today.
- Failure signature:
  - `browser-auth-localstorage-bearer`
- Current focused verification:
  - `git diff -- docs/adr-browser-auth-session.md docs/architecture.md`
  - `rg -n "atlaspm_token|POST /dev-auth/token|Authorization: Bearer|credentials: 'include'" apps/web-ui/src apps/core-api/src docs/adr-browser-auth-session.md docs/architecture.md`
  - `pnpm --filter @atlaspm/web-ui type-check` -> failed before compile because `node_modules` is absent and `tsc` is not installed in this worktree
- Implementation notes:
  - Chosen browser model: `core-api` managed opaque `HttpOnly` session cookie plus a readable CSRF cookie.
  - OIDC code exchange and refresh-token rotation stay server-side in `core-api`.
  - Bearer auth remains temporarily for non-browser clients and transition compatibility.
  - Dev mode should stop using `/dev-auth/token` from the browser and instead create the same cookie-backed session shape as production.
