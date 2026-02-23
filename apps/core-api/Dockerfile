FROM node:20-bookworm-slim
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json eslint.config.mjs .prettierrc ./
COPY apps/core-api/package.json apps/core-api/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --filter @atlaspm/core-api... --frozen-lockfile=false
COPY . .
RUN pnpm --filter @atlaspm/core-api prisma:generate
RUN pnpm --filter @atlaspm/core-api build
EXPOSE 3001
CMD ["sh", "-c", "pnpm --filter @atlaspm/core-api prisma:migrate && pnpm --filter @atlaspm/core-api start"]
