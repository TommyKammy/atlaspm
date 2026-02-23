# AtlasPM

AtlasPM is a headless, rule-driven project management core built for enterprise internal use.
It strictly separates domain logic from UI and exposes all functionality via secure APIs.

## Monorepo

- `apps/core-api`: NestJS + Prisma + PostgreSQL
- `apps/web-ui`: Next.js + Tailwind + shadcn/ui
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
```

## API Docs

- Swagger UI: `http://localhost:3001/docs`

## Commands

```bash
pnpm dev
pnpm lint
pnpm test
pnpm e2e
pnpm e2e:rebuild
pnpm db:migrate
pnpm db:seed
```

## E2E (Mac + Colima)

```bash
colima start
pnpm e2e
```

`pnpm e2e` runs `infra/docker/docker-compose.yml` (postgres + core-api + web-ui) and executes Playwright against the running stack.

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
