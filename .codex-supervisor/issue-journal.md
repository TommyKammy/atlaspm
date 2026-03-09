# Issue #330: P1: Write ADR for browser auth migration off localStorage bearer tokens

## Supervisor Snapshot
- Issue URL: https://github.com/TommyKammy/atlaspm/issues/330
- Branch: codex/reopen-issue-330
- Workspace: /home/tommy/Dev/atlaspm-worktrees/issue-330
- Journal: /home/tommy/Dev/atlaspm-worktrees/issue-330/.codex-supervisor/issue-journal.md
- Current phase: addressing_review
- Attempt count: 2
- Last head SHA: 836ce2febe5a18d2eb8ee90df85cbe38c5e50058
- Blocked reason: none
- Last failure signature: PRRT_kwDORWcwRc5zI8p1
- Repeated failure signature count: 1
- Updated at: 2026-03-10T06:47:14+09:00

## Latest Codex Summary
Added the ADR at [docs/adr-browser-auth-session.md](/home/tommy/Dev/atlaspm-worktrees/issue-330/docs/adr-browser-auth-session.md) and linked it from [docs/architecture.md](/home/tommy/Dev/atlaspm-worktrees/issue-330/docs/architecture.md). The decision is explicit: move browser auth from `localStorage` bearer tokens to `core-api` managed `HttpOnly` cookie sessions, keep OIDC exchange and refresh server-side, require CSRF protection for unsafe browser requests, preserve bearer auth temporarily for non-browser clients, and stage the rollout so old/new frontend and backend versions can overlap safely.

Committed as `836ce2f` (`docs: add browser auth migration ADR`), pushed on `codex/reopen-issue-330`, and opened draft PR #334: https://github.com/TommyKammy/atlaspm/pull/334

Summary: Wrote and committed the browser-auth migration ADR, added the architecture cross-reference, pushed the branch, and opened draft PR #334.
State hint: draft_pr
Blocked reason: verification
Tests: `rg -n "atlaspm_token|POST /dev-auth/token|Authorization: Bearer|credentials: 'include'" apps/web-ui/src apps/core-api/src docs/adr-browser-auth-session.md docs/architecture.md`; `pnpm --filter @atlaspm/web-ui type-check` (failed because `node_modules` is absent and `tsc` is not installed in this worktree)
Failure signature: missing-node-modules-tsc
Next action: Review draft PR #334, or install workspace dependencies if stronger local verification is required before merge

## Active Failure Context
- None recorded.

## Codex Working Notes
### Current Handoff
- Hypothesis: The current browser auth risk is not an execution bug but an architecture/documentation gap: `web-ui` still depends on `localStorage` bearer tokens, and the repo lacked an ADR defining the replacement session model.
- Primary failure or risk: The review fix is merged into the branch and the thread is resolved; only GitHub's current `mergeStateStatus=UNSTABLE` remains to watch.
- Last focused command: `gh pr view 334 --json isDraft,mergeStateStatus,reviewDecision,url`
- Files changed: `docs/adr-browser-auth-session.md`
- Next 1-3 actions:
  1. Re-check PR #334 merge state after GitHub refreshes branch status.
  2. If another review arrives, address it on the ADR without broadening scope.
  3. Otherwise merge the ADR before implementation issues #331-#333 proceed.

### Scratchpad
- Keep this section short. The supervisor may compact older notes automatically.
- Focused reproduction:
  - `apps/web-ui/src/app/login/page.tsx` uses `POST /dev-auth/token` and stores the returned token in browser state.
  - `apps/web-ui/src/lib/api.ts` reads `atlaspm_token` from `localStorage` and attaches it as `Authorization: Bearer ...`.
  - `apps/core-api/src/auth/auth.service.ts` authenticates requests from that bearer header today.
- Failure signature:
  - `browser-auth-localstorage-bearer`
- Current focused verification:
  - `git diff -- docs/adr-browser-auth-session.md`
  - `rg -n "__Host-atlaspm_session|atlaspm_session|__Host-atlaspm_csrf|atlaspm_csrf|plain HTTP|same session semantics" docs/adr-browser-auth-session.md`
  - `gh api graphql -f query='mutation($threadId:ID!){resolveReviewThread(input:{threadId:$threadId}){thread{isResolved}}}' -F threadId=PRRT_kwDORWcwRc5zI8p1`
  - `gh pr view 334 --json isDraft,mergeStateStatus,reviewDecision,url`
- Implementation notes:
  - Chosen browser model: `core-api` managed opaque `HttpOnly` session cookie plus a readable CSRF cookie.
  - OIDC code exchange and refresh-token rotation stay server-side in `core-api`.
  - Bearer auth remains temporarily for non-browser clients and transition compatibility.
  - Review follow-up: production / HTTPS keeps `__Host-*` cookie names, while plain-HTTP localhost uses dev-only `atlaspm_session` / `atlaspm_csrf` names because `__Host-*` requires `Secure`.
