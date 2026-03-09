# ADR: Browser Auth Migration Off `localStorage` Bearer Tokens

## Status

Accepted

## Date

2026-03-10

## Context

AtlasPM currently authenticates browser requests by storing a bearer token in `localStorage` and sending it on every `web-ui` request as `Authorization: Bearer <token>`.

Current behavior in this repo:

- `apps/web-ui/src/app/login/page.tsx` calls `POST /dev-auth/token` in local dev and stores the returned JWT in `localStorage`.
- `apps/web-ui/src/lib/api.ts` reads `atlaspm_token` from `localStorage` and attaches it as an `Authorization` header for every API call.
- `core-api` authenticates those bearer tokens directly:
  - dev mode verifies locally minted HS256 JWTs
  - production mode verifies OIDC JWTs via issuer, audience, and JWKS
- `core-api` already issues a separate short-lived collaboration JWT for `collab-server`; that token is not stored as the browser's primary session.

This design keeps the API simple, but it leaves browser credentials readable by injected JavaScript. For an enterprise internal app, that is the wrong default. A single XSS defect would expose a reusable API credential with the same authority as the user.

The migration must also preserve these current architecture constraints:

- `web-ui` remains a browser app that talks to `core-api` over HTTP.
- `core-api` remains the authorization boundary and source of truth for user identity inside AtlasPM.
- OIDC remains the production identity provider.
- `collab-server` continues to use short-lived room-scoped JWTs issued by `core-api`.

## Decision

AtlasPM will move browser authentication to a `core-api` managed session transported only via secure cookies. Browser JavaScript will no longer read or persist an AtlasPM bearer token.

The chosen model is:

- `core-api` acts as the OIDC relying party for browser sign-in.
- After OIDC code exchange, `core-api` creates a server-side session record and sets cookies on the browser response.
- The primary browser credential is an opaque session identifier in an `HttpOnly` cookie, not a bearer JWT exposed to JavaScript.
- Any upstream OIDC refresh token is stored server-side only, encrypted at rest, and never returned to the browser.
- `web-ui` calls `core-api` with `credentials: 'include'` and does not set `Authorization` headers for browser-originated traffic.
- `core-api` auth guards accept either:
  - the new browser session cookie, or
  - explicit bearer tokens for non-browser clients and transition compatibility.

This is a backend-for-frontend style session model anchored in `core-api`, even though `web-ui` remains a separate deployed app.

## Why This Option

### Chosen: HttpOnly opaque session cookie

Benefits:

- Removes AtlasPM API credentials from `localStorage`, `sessionStorage`, and ordinary browser JS access.
- Supports immediate logout and revocation by deleting server-side session state.
- Handles OIDC refresh-token rotation without exposing refresh tokens to the browser.
- Fits the existing architecture because `core-api` already owns authz, collab token issuance, and project membership checks.
- Avoids making `web-ui` a second security boundary with its own token exchange and refresh logic.

Costs:

- Requires CSRF protections on cookie-authenticated unsafe methods.
- Requires session persistence and cleanup in `core-api`.
- Requires explicit cross-origin cookie configuration for local dev and production deployments.

### Rejected: Keep bearer tokens in browser storage

Rejected because:

- XSS can directly exfiltrate the credential.
- Logout and revocation stay weak unless every bearer token is short-lived and backed by more refresh-token machinery in the browser.
- It forces `web-ui` to remain responsible for token lifecycle, which conflicts with keeping auth control concentrated in `core-api`.

### Rejected: Store a JWT in an `HttpOnly` cookie as the primary session

Rejected as the primary model because:

- Revocation and forced logout are harder without introducing server-side deny lists or very short TTLs.
- Rotation and privilege changes still need server state for correctness.
- An opaque session id gives simpler invalidation semantics with no practical downside for AtlasPM's server-rendered and API-driven browser flows.

## Session Model

### Session record in `core-api`

`core-api` will persist a browser session record with at least:

- session id
- user id / OIDC `sub`
- workspace-facing identity data needed to hydrate `req.user`
- session status (`active`, `revoked`, `expired`)
- idle expiry and absolute expiry timestamps
- last refresh timestamp
- OIDC token metadata
- encrypted upstream refresh token when the IdP issues one

The browser cookie stores only the opaque session id.

### Cookies

Required cookies:

- `__Host-atlaspm_session`
  - opaque session id
  - `HttpOnly`
  - `Secure` outside localhost
  - `Path=/`
  - `SameSite=Lax`
- `__Host-atlaspm_csrf`
  - random CSRF secret or nonce
  - not `HttpOnly`
  - `Secure` outside localhost
  - `Path=/`
  - `SameSite=Lax`

Rules:

- Use the `__Host-` prefix in production-capable environments so the cookie cannot carry a `Domain` attribute and is pinned to the origin host.
- Localhost development may fall back to non-`Secure` cookies, but keeps `HttpOnly`, `Path=/`, and `SameSite=Lax`.
- Session cookies must be cleared on logout and on server-side session revocation.

### Request authentication

For browser requests:

- `web-ui` sends requests with `credentials: 'include'`.
- `core-api` auth guard checks the session cookie first.
- If a valid session exists, `core-api` resolves the current AtlasPM user from session state, not from a browser-provided bearer token.

For non-browser requests:

- `Authorization: Bearer` remains supported for CLI, test harnesses, and internal service calls that are not using the browser session flow.

## OIDC Interaction

Production browser login flow:

1. `web-ui` redirects the browser to a `core-api` auth start endpoint.
2. `core-api` starts OIDC authorization code flow with PKCE.
3. OIDC callback returns to `core-api`.
4. `core-api` exchanges the code for OIDC tokens.
5. `core-api` verifies issuer, audience, nonce, and PKCE verifier.
6. `core-api` creates or updates the AtlasPM user/session state.
7. `core-api` sets the session + CSRF cookies and redirects back to `web-ui`.

Important assumptions:

- OIDC `sub` remains the stable AtlasPM user identity key.
- AtlasPM still does not treat `web-ui` as a trusted token minting boundary.
- `core-api` remains the only component that handles OIDC client credentials, code exchange, refresh-token rotation, and AtlasPM session creation.

## CSRF Requirements

Moving browser auth to cookies introduces CSRF risk on state-changing routes. AtlasPM will require both of the following for browser-originated unsafe methods (`POST`, `PUT`, `PATCH`, `DELETE`):

- Double-submit CSRF token:
  - browser reads `__Host-atlaspm_csrf`
  - browser sends the same value in `x-atlaspm-csrf`
  - `core-api` rejects the request if header and cookie do not match
- Origin enforcement:
  - require `Origin` to match an allowlist of AtlasPM web origins
  - if `Origin` is absent, fall back to strict `Referer` validation only for supported browser cases

Additional rules:

- Safe methods (`GET`, `HEAD`, `OPTIONS`) do not require the CSRF header.
- Bearer-authenticated non-browser clients are not subject to the browser CSRF check.
- CORS must not allow arbitrary origins with credentials enabled.

## Rotation And Expiry

AtlasPM will use rotation at the session layer, not a long-lived static browser cookie.

Rules:

- Rotate the session id on login.
- Rotate the session id after privilege-sensitive events such as re-authentication or workspace-role changes.
- Enforce both idle timeout and absolute lifetime on the AtlasPM session.
- Refresh upstream OIDC tokens server-side when near expiry.
- If the IdP rotates the refresh token, replace the stored encrypted token atomically.
- If upstream refresh fails, revoke the AtlasPM session and force browser re-login.

Recommended starting policy:

- idle timeout: 8 hours
- absolute session lifetime: 7 days
- refresh threshold: when the upstream access token has less than 5 minutes remaining

These values may be tuned operationally, but the implementation must preserve both idle and absolute expiry semantics.

## `web-ui` Implications

`web-ui` changes required by this decision:

- Remove `atlaspm_token` reads/writes from browser auth flow.
- Stop attaching `Authorization` headers for normal browser API calls.
- Send `credentials: 'include'` on AtlasPM API requests.
- Read the CSRF cookie and send `x-atlaspm-csrf` for unsafe methods.
- Replace the dev login page flow so it creates a cookie-backed session instead of storing a JWT.
- Treat `401` as session expiration and redirect to login without trying to refresh tokens in the browser.

Non-auth `localStorage` use for UI preferences is unaffected.

## `core-api` Implications

`core-api` changes required by this decision:

- Add browser session persistence, lookup, revocation, expiry handling, and cleanup.
- Add OIDC auth start/callback/logout endpoints for browser use.
- Add a dev-only session-creation endpoint for local development parity.
- Update auth guards so browser requests can authenticate from cookie-backed sessions.
- Add CSRF validation middleware/guard for unsafe cookie-authenticated requests.
- Continue issuing short-lived collab JWTs from authenticated AtlasPM user context.

Bearer-token verification does not disappear immediately. It remains for explicit API clients and transition compatibility.

## Local And Dev Behavior

Local development must stay simple, but it cannot preserve the production anti-pattern in browser code.

Decision for dev mode:

- Keep `DEV_AUTH_ENABLED=true` as the local-only identity bypass.
- Replace browser use of `POST /dev-auth/token` with a dev session endpoint that sets the same cookie shape as production login.
- `POST /dev-auth/token` may remain temporarily for non-browser tests or scripts, but `web-ui` must stop depending on it.
- Localhost may use non-`Secure` cookies because HTTPS is not guaranteed in local bring-up.

This keeps local UX fast while ensuring the browser path exercises the same cookie/session semantics as production.

## Rollout Plan

### Phase 1: Introduce session auth without breaking existing clients

- Add session tables, cookie issuance, CSRF checks, and browser auth endpoints in `core-api`.
- Keep bearer auth support in guards.
- Add a `/auth/session` or equivalent read endpoint so `web-ui` can bootstrap the current user from cookies.

### Phase 2: Migrate `web-ui`

- Change browser API client to cookie credentials plus CSRF header.
- Change login/logout flows to use the new session endpoints.
- Remove browser reads/writes of `atlaspm_token`.
- Update E2E coverage to prove browser requests succeed without `Authorization` headers and fail without valid CSRF on unsafe methods.

### Phase 3: Deprecate browser bearer path

- Remove `NEXT_PUBLIC_DEV_TOKEN_ENDPOINT` from the web app path.
- Audit browser traffic/logging to confirm no UI route still relies on bearer headers.
- Keep explicit bearer auth only for documented non-browser use cases.

### Phase 4: Tighten compatibility boundary

- Remove any temporary browser fallback that still accepts bearer tokens.
- Keep or remove raw `/dev-auth/token` based on whether non-browser tooling still needs it.

## Backward-Compatibility Constraints

- Existing non-browser API consumers must keep working during the migration.
- `collab-server` behavior stays unchanged except that its token-issuing endpoint will now authenticate from browser session cookies instead of browser bearer headers.
- Browser and API changes must be deployable in either order during the transition:
  - old `web-ui` + new `core-api` still works because bearer auth remains accepted
  - new `web-ui` + new `core-api` uses cookies
- New `web-ui` must not require old `core-api`; cookie session support must ship before the frontend flip.

## Consequences

Positive:

- Browser credential theft via `localStorage` becomes materially harder.
- Logout, revocation, and forced re-auth become predictable server-side operations.
- OIDC refresh-token handling moves to the server boundary where it belongs.

Negative:

- More backend auth infrastructure is required.
- CSRF protections become mandatory and must be tested carefully.
- Local setup and cross-origin cookie configuration become more sensitive than pure bearer headers.

## Implementation Notes For Follow-On Issues

- Issue #331 should focus on `core-api` session and OIDC callback plumbing.
- Issue #332 should focus on `web-ui` API client, login flow, and CSRF header handling.
- Issue #333 should focus on rollout hardening, compatibility cleanup, and test coverage that proves browser auth no longer depends on `localStorage`.
