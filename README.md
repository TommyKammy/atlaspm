# AtlasPM

AtlasPM is a headless, rule-driven project management core built for enterprise internal use.
It strictly separates domain logic from UI and exposes all functionality via secure APIs.

## Monorepo

- `apps/core-api`: NestJS + Prisma + PostgreSQL
- `apps/web-ui`: Next.js + Tailwind + shadcn/ui
- `apps/collab-server`: Hocuspocus (Yjs) realtime collaboration server
- `packages/shared-types`: shared type contracts only
- `packages/domain`: domain layer seed
- `packages/rule-engine`: rules boundary seed
- `infra/docker`: local docker/colima runtime
- `e2e/playwright`: end-to-end tests

## Prerequisites

- Node.js 20+
- pnpm 9+
- Docker + Colima (Mac)

## Setup

```bash
pnpm install
cp apps/core-api/.env.example apps/core-api/.env
cp apps/web-ui/.env.example apps/web-ui/.env.local
cp apps/collab-server/.env.example apps/collab-server/.env
```

## API Docs

- Swagger UI: `http://localhost:3001/docs`

## Commands

```bash
pnpm dev
pnpm lint
pnpm test
pnpm e2e:up
pnpm e2e
pnpm e2e:down
pnpm e2e:rebuild
pnpm db:migrate
pnpm db:seed
```

- `pnpm test` expects local Postgres on `localhost:55432` (start with `docker compose -f infra/docker/docker-compose.yml up -d postgres`).
- `pnpm e2e` reuses existing Docker images for speed.
- `pnpm e2e:rebuild` forces `core-api` and `web-ui` image rebuilds after app code changes.
- `pnpm e2e:up` starts postgres + core-api + collab-server + web-ui.
- `pnpm e2e:down` tears down the docker compose stack.

## E2E (Mac + Colima)

```bash
colima start
pnpm e2e
```

`pnpm e2e` runs `infra/docker/docker-compose.yml` (postgres + core-api + collab-server + web-ui) and executes Playwright against the running stack.

- Fast loop (default): `pnpm e2e` reuses existing images.
- Rebuild when app code changes: `pnpm e2e:rebuild`
- Keep containers up after tests (debug): `E2E_KEEP_UP=1 pnpm e2e`

## Colima + Docker compose

```bash
colima start
cd infra/docker
docker compose up -d --build
```

## Security

- OIDC JWT verification via JWKS by default.
- Dev auth mode is disabled by default and only enabled via `DEV_AUTH_ENABLED=true`.
- Workspace/project admin operations are authorization-enforced server-side.
- Collaboration JWT/service secrets:
  - `COLLAB_JWT_SECRET`
  - `COLLAB_SERVICE_TOKEN`
- Invitation link base URL:
  - `INVITE_BASE_URL` (defaults to `http://localhost:3000/login`)
- Collaboration in web-ui is feature-gated and off by default: `NEXT_PUBLIC_COLLAB_ENABLED=false`.

## Admin UX

- Workspace admin page: `/admin/users`
  - invite users (copy invite link), search/filter users, suspend/unsuspend, edit display name.
- Project members page: `/projects/:id/members`
  - add workspace users to project, change role, remove member.
- Admin design/behavior docs: `docs/admin.md`
