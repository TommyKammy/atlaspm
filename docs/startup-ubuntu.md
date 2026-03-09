# Ubuntu Startup Guide (Clone + Dev Bring-up)

This guide is for running AtlasPM on a fresh Ubuntu server (22.04/24.04).
It assumes development usage (not production hardening).

## 1) Install system prerequisites

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git build-essential
```

## 2) Install Docker Engine + Compose plugin

```bash
sudo apt-get install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
```

Log out and log in again (or open a new SSH session) after adding the docker group.

Quick check:

```bash
docker version
docker compose version
```

## 3) Install Node.js 20 + pnpm 9

AtlasPM expects Node 20.x and pnpm 9.x.

```bash
curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.2/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 20
nvm use 20
corepack enable
corepack prepare pnpm@9.15.4 --activate
node -v
pnpm -v
```

## 4) Clone and install workspace dependencies

```bash
git clone https://github.com/TommyKammy/atlaspm.git
cd atlaspm
pnpm install
```

## 5) Prepare environment files

```bash
cp .env.example .env
cp apps/core-api/.env.example apps/core-api/.env
cp apps/web-ui/.env.example apps/web-ui/.env.local
cp apps/collab-server/.env.example apps/collab-server/.env
```

For local dev login, set:

- `apps/core-api/.env` -> `NODE_ENV=development`
- `apps/core-api/.env` -> `DEV_AUTH_ENABLED=true`
- `apps/core-api/.env` -> `DEV_AUTH_SECRET=<set a unique local secret with at least 16 characters>`
- `apps/web-ui/.env.local` -> `NEXT_PUBLIC_DEV_AUTH_ENABLED=true`
- This setting is for isolated local development only. Do not enable it in shared or internet-reachable environments.

## 6) Start local stack

Option A (recommended quick start with compose-managed services):

```bash
pnpm e2e:up
```

Option B (manual compose):

```bash
docker compose -f infra/docker/docker-compose.yml up -d postgres core-api collab-server web-ui
```

## 7) Verify services

```bash
curl -I http://localhost:3000/login
curl -I http://localhost:3001/docs
docker compose -f infra/docker/docker-compose.yml ps
```

- Web UI: `http://localhost:3000`
- Core API Swagger: `http://localhost:3001/docs`
- Collab server WS: `ws://localhost:18080`

## 8) Common development commands

```bash
pnpm --filter @atlaspm/web-ui lint
pnpm --filter @atlaspm/web-ui build
pnpm test
pnpm e2e
```

When app code changes and you need fresh docker images:

```bash
pnpm e2e:rebuild
```

## 9) Stop and clean up

```bash
pnpm e2e:down
```

or

```bash
docker compose -f infra/docker/docker-compose.yml down
```

## 10) Frequent pitfalls

- `permission denied /var/run/docker.sock`
  - Your session is not in docker group yet. Re-login after `usermod -aG docker`.
- `Unsupported engine` warning
  - Use Node 20.x (`nvm use 20`).
- Port conflicts (`3000`, `3001`, `55432`, `18080`)
  - Stop old containers/processes, then restart compose.
- OIDC login blocked in local
  - Use dev auth flags above for local-only sign-in.
