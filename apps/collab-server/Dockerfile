FROM node:20-alpine
WORKDIR /app
RUN corepack enable

COPY package.json pnpm-workspace.yaml tsconfig.base.json eslint.config.mjs .prettierrc ./
COPY apps/collab-server/package.json apps/collab-server/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --filter @atlaspm/collab-server... --frozen-lockfile=false

COPY . .
RUN pnpm --filter @atlaspm/collab-server build

EXPOSE 8080
CMD ["pnpm", "--filter", "@atlaspm/collab-server", "start"]
