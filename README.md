# AtlasPM

AtlasPM is a headless, rule-driven project management core built for enterprise internal use. It strictly separates domain logic from UI and exposes all functionality via secure APIs.

## Features

### Core Project Management
- **Workspaces & Projects**: Multi-tenant workspace organization with project-level collaboration
- **Sections & Tasks**: Kanban-style board with sections and tasks
- **Task Properties**: Title, description, status, priority, assignee, due dates, progress tracking
- **Drag & Drop**: Manual task ordering within and across sections
- **Real-time Collaboration**: Multi-user simultaneous editing via Yjs (Hocuspocus)

### Task Internals (Rich Content)
- **Rich Descriptions**: Tiptap-based editor with ProseMirror JSON storage
  - Block types: paragraphs, headings, lists, checklists, quotes, code blocks, dividers, images, tables
  - Slash command menu for quick block insertion
  - Mention support (@user) with notification system
  - Link insertion (Cmd/Ctrl+K)
  - Optimistic concurrency control (conflict detection)
- **Comments**: Threaded discussions on tasks with mention support
- **Attachments**: Secure file upload with signed URLs for inline images
- **Activity Timeline**: Audit trail of all task changes (description, comments, status, assignee, etc.)

### Automation & Rules
- **Progress Rules**: Auto-update task status based on progress
  - 100% progress → Status DONE + completedAt set
  - 0-99% progress → Status IN_PROGRESS
- **Custom Rules**: Define trigger/condition/action rules via UI
- **Cooldown & Loop Prevention**: Built-in safeguards against rule cascades

### Custom Fields
- **Field Types**: Text, number, date, select, multi-select, user, checkbox, URL, email, phone
- **Project-scoped**: Each project defines its own custom fields
- **Secure**: Authorization checks ensure only project members with appropriate roles can modify

### Admin & User Management
- **Workspace Roles**: 
  - `WS_ADMIN`: Manage workspace users, invitations, settings
  - `WS_MEMBER`: Standard workspace participation
- **Project Roles**:
  - `ADMIN`: Full project management
  - `MEMBER`: Can create/edit tasks
  - `VIEWER`: Read-only access
- **User Lifecycle**: 
  - OIDC integration (production)
  - Dev auth mode (local development)
  - User suspension capability
  - Last seen tracking
- **Invitations**: Secure token-based invitations with email verification
  - Hash-only token storage
  - Expiration and revocation support
  - Copyable invite links

### Views & UX
- **Multiple Views**:
  - Board view (Kanban by sections)
  - Table view (sortable, filterable)
  - Timeline/Gantt view (visualize task schedules)
- **Search & Filter**: Real-time task search with status/priority/assignee filters
- **Theme Support**: Dark/light mode with persistence
- **Responsive Design**: Mobile drawer navigation, desktop sidebar
- **Modern UI**: shadcn/ui components with Tailwind CSS

### Security & Audit
- **Authentication**: OIDC JWT verification via JWKS (production)
- **Authorization**: Server-side role enforcement on all endpoints
- **Audit Logging**: Every write operation recorded with before/after state
- **Outbox Pattern**: Reliable event publishing for downstream systems
- **Correlation IDs**: Request tracing across services
- **XSS Protection**: Input sanitization for URLs, emails, phone numbers

## Monorepo Structure

```
atlaspm/
├── apps/
│   ├── core-api/          # NestJS + Prisma + PostgreSQL
│   ├── web-ui/            # Next.js + Tailwind + shadcn/ui
│   └── collab-server/     # Hocuspocus (Yjs) realtime collaboration
├── packages/
│   ├── shared-types/      # Shared type contracts
│   ├── domain/            # Domain layer seed
│   └── rule-engine/       # Rules boundary seed
├── infra/
│   └── docker/            # Local docker/colima runtime
├── e2e/
│   └── playwright/        # End-to-end tests
└── docs/                  # Architecture and design docs
```

## Prerequisites

- Node.js 20+
- pnpm 9+ (via Corepack)
- Docker + Colima (Mac)

## Setup

```bash
# Install dependencies
pnpm install

# Copy environment files
cp apps/core-api/.env.example apps/core-api/.env
cp apps/web-ui/.env.example apps/web-ui/.env.local
cp apps/collab-server/.env.example apps/collab-server/.env

# Start PostgreSQL
docker compose -f infra/docker/docker-compose.yml up -d postgres

# Run database migrations
pnpm db:migrate

# Seed database (optional)
pnpm db:seed
```

## Development

```bash
# Start all services in development mode
pnpm dev

# Run linting
pnpm lint

# Run unit/integration tests
pnpm test
```

## API Documentation

- Swagger UI: `http://localhost:3001/docs`
- OpenAPI schema available at `/docs-json`

## End-to-End Testing

```bash
# Start Colima (Mac)
colima start

# Run E2E tests (uses existing Docker images)
pnpm e2e

# Force rebuild after code changes
pnpm e2e:rebuild

# Keep containers up for debugging
E2E_KEEP_UP=1 pnpm e2e
```

E2E runs `infra/docker/docker-compose.yml` (postgres + core-api + collab-server + web-ui) and executes Playwright against the running stack.

### Docker Compose (Manual)

```bash
colima start
cd infra/docker
docker compose up -d --build
```

## Configuration

### Core API Environment Variables

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/atlaspm?schema=public"

# OIDC (Production)
OIDC_ISSUER_URL="https://accounts.google.com"
OIDC_AUDIENCE="your-client-id"
OIDC_JWKS_URI="https://www.googleapis.com/oauth2/v3/certs"

# Dev Auth (Local Development Only)
DEV_AUTH_ENABLED=true

# Collaboration
COLLAB_JWT_SECRET="your-secret-key"
COLLAB_SERVICE_TOKEN="your-service-token"

# Invitations
INVITE_BASE_URL="http://localhost:3000/login"
```

### Web UI Environment Variables

```env
# API Endpoints
NEXT_PUBLIC_API_URL="http://localhost:3001"
NEXT_PUBLIC_COLLAB_WS_URL="ws://localhost:3002"

# Features
NEXT_PUBLIC_COLLAB_ENABLED=true
```

### Collaboration Server Environment Variables

```env
CORE_API_URL="http://core-api:3001"
COLLAB_SERVICE_TOKEN="your-service-token"
COLLAB_JWT_SECRET="your-secret-key"
PORT=3002
```

## Architecture Highlights

### Headless API Design
- `web-ui` communicates with `core-api` via HTTP only
- `core-api` owns persistence, authorization, auditing, rules, and outbox
- `collab-server` handles Yjs websocket collaboration only
- Clean separation enables custom frontends and integrations

### Authorization Model
- Workspace-level roles (`WS_ADMIN`, `WS_MEMBER`)
- Project-level roles (`ADMIN`, `MEMBER`, `VIEWER`)
- Server-side enforcement on all endpoints
- Suspended users blocked at auth guard

### Audit + Outbox
Every write appends:
- **AuditEvent**: actor, entity, action, before/after, timestamp, correlationId
- **OutboxEvent**: type, payload, createdAt, correlationId, deliveredAt

### Real-time Collaboration
- Yjs document sharing via WebSocket
- Per-task room isolation
- JWT-based authorization (viewer = readonly, member/admin = readwrite)
- Snapshot persistence to PostgreSQL on idle/interval/disconnect

### Task Ordering
- Sparse integer positions (default gap 1000)
- Reorder API with collision detection and automatic rebalancing
- Optimistic concurrency via task `version`

## Admin UX

### Workspace Admin (`/admin/users`)
- View all workspace users with search and status filters
- Invite new users with role selection
- Copy invite links
- Edit user display names
- Suspend/unsuspend users
- Revoke pending invitations

### Project Members (`/projects/:id/members`)
- Add workspace users to project
- Change member roles
- Remove members
- Link from project page header

## Security

- **OIDC JWT verification** via JWKS by default
- **Dev auth mode** disabled by default, enabled via `DEV_AUTH_ENABLED=true`
- **Workspace/project admin operations** authorization-enforced server-side
- **Invitation security**: Hash-only token storage, strict email match on acceptance
- **Collaboration security**: Short-lived JWTs per task room with role claims
- **XSS Protection**: URL/email/phone sanitization in frontend
- **Input validation**: Strict schema validation on all endpoints

## Documentation

- [Architecture Overview](docs/architecture.md)
- [Admin User Management](docs/admin.md)
- [UI Design Conventions](docs/ui-design.md)
- [Editor Schema](docs/editor-schema.md)
- [Collaboration](docs/collaboration.md)

## Commands Reference

```bash
# Development
pnpm dev                    # Start all apps in dev mode
pnpm lint                   # Run ESLint across all packages
pnpm test                   # Run unit/integration tests

# Database
pnpm db:migrate            # Run Prisma migrations
pnpm db:seed               # Seed database with sample data
pnpm db:studio             # Open Prisma Studio

# E2E Testing
pnpm e2e                   # Run Playwright E2E tests
pnpm e2e:up                # Start E2E infrastructure
pnpm e2e:down              # Stop E2E infrastructure
pnpm e2e:rebuild           # Rebuild images and run E2E

# Build
pnpm build                 # Build all apps for production
```

## License

MIT