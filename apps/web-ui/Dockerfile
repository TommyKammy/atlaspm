FROM node:20-alpine
WORKDIR /app
RUN corepack enable
ARG NEXT_PUBLIC_CORE_API_URL=http://localhost:3001
ARG NEXT_PUBLIC_DEV_AUTH_ENABLED=true
ARG NEXT_PUBLIC_DEV_TOKEN_ENDPOINT=http://localhost:3001/dev-auth/token
ENV NEXT_PUBLIC_CORE_API_URL=${NEXT_PUBLIC_CORE_API_URL}
ENV NEXT_PUBLIC_DEV_AUTH_ENABLED=${NEXT_PUBLIC_DEV_AUTH_ENABLED}
ENV NEXT_PUBLIC_DEV_TOKEN_ENDPOINT=${NEXT_PUBLIC_DEV_TOKEN_ENDPOINT}
COPY package.json pnpm-workspace.yaml tsconfig.base.json eslint.config.mjs .prettierrc ./
COPY apps/web-ui/package.json apps/web-ui/package.json
COPY packages/shared-types/package.json packages/shared-types/package.json
RUN pnpm install --filter @atlaspm/web-ui... --frozen-lockfile=false
COPY . .
RUN pnpm --filter @atlaspm/web-ui build
EXPOSE 3000
CMD ["pnpm", "--filter", "@atlaspm/web-ui", "start"]
