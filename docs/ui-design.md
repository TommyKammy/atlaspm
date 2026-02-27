# AtlasPM UI Design

## Reference Alignment
- Visual baseline: shadcn/ui "Tasks" example (`https://ui.shadcn.com/examples/tasks`).
- AtlasPM adaptation: keeps section-grouped task list and drag reordering.

## Theming
- `next-themes` with `ThemeProvider` (`attribute="class"`).
- Tailwind dark mode: `darkMode: ["class"]`.
- Theme selection is persisted by `next-themes`.

## Token Conventions
- Use token classes only (`bg-background`, `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`, etc.).
- No component-level hard-coded hex values.
- Tokens are defined in `apps/web-ui/src/app/globals.css` using shadcn-style `:root` and `.dark` HSL variables.

## App Shell
- Persistent shell at `apps/web-ui/src/components/layout/AppShell.tsx`.
- Sidebar:
  - project navigation from `GET /projects`
  - active project highlighting
  - admin section (`Admin > Users`) shown only for `WS_ADMIN`
  - mobile via sheet drawer
- Header:
  - current project title context
  - theme toggle dropdown
  - notification center dropdown (unread badge + quick jump to task)

## Task List Structure
- Header tabs: `List / Board / Calendar / Files` (non-list views are placeholder unless implemented).
- Toolbar: search, status filter, priority filter, add action.
- Filter popover supports project member/status plus custom-field filters:
  - `SELECT`: multi-select options
  - `BOOLEAN`: any/true/false
  - `NUMBER`: min/max
  - `DATE`: from/to
- Section groups:
  - uppercase section header + task count badge
  - section-scoped quick add row
- Rows:
  - dense table style (44px)
  - hover highlight
  - thin separators
  - progress bar (4px, success color at 100%)
  - extended columns for Asana-like density:
    - `Projects`, `Dependencies`, `Visibility`, `Collaborators`

## Assignee UX
- Popover + Command combobox pattern.
- Candidate source: project members endpoint.
- Search by display name / email.
- Avatar/initials trigger with tooltip.

## Rules UX
- Card list with subtle styling and compact editor.
- Enabled state accent rail.
- Minimal safe definition editor.

## Query Key Conventions
- `['projects']`
- `['project', projectId, 'sections']`
- `['project', projectId, 'tasks', { groupBy: 'section' }]`
- `['project', projectId, 'members']`
- `['project', projectId, 'custom-fields']`
- `['project', projectId, 'rules']`
- `['notifications', { status: 'all' | 'unread' }]`
- `['notifications', 'unread-count']`

## Mutation/Caching Discipline
- Use targeted optimistic updates for inline edits and reorder.
- Invalidate only affected keys on settle/error.
- No page reloads required for section/task create, edits, or reorder.
- Project filter state is URL-driven:
  - `statuses` (comma list)
  - `assignees` (comma list, includes `UNASSIGNED`)
  - `cf` (serialized custom-field filters JSON)
- `localStorage` mirrors the latest filter state for user continuity, while URL params remain source of truth.

## Keyboard Shortcuts
- `/`: focus project search input (when not typing in an input/editor).
- `C`: open quick-add task on first section (when not typing in an input/editor).

## Visual Regression
- Process doc: `docs/ui/visual-regression.md`
- Manual helper: `scripts/capture-ui-baseline.sh`

## Task Detail Internals (Phase 1)
- Task detail opens in a right-side drawer with tabs:
  - `Details`: rich description editor (Tiptap)
  - `Comments`: comment thread + edit/delete for own comments
  - `Activity`: readable task audit timeline
- Description editor:
  - Source of truth is ProseMirror JSON (`descriptionDoc`)
  - autosave debounce ~900ms
  - optimistic version protocol (`expectedVersion`)
  - conflict banner + reload-latest action on `409`
- Safety:
  - no raw HTML stored as source-of-truth
  - read/write pipeline operates on structured JSON + plain text extraction

## Task Detail Internals (Phase 2)
- Description editor:
  - Slash menu (`/`) for block insertion: heading, lists, checklist, quote, code block, divider, image, table.
  - Mention suggestions (`@`) backed by project members.
  - Cmd/Ctrl+K opens a minimal link dialog.
  - Image uploads flow through core-api attachment APIs and insert image nodes into the document.
- Comments:
  - Composer supports mention token insertion (`@[userId|label]`) and renders mention pills in thread UI.
- Attachments:
  - Details tab includes attachment list with delete action.
  - Inline description images render from signed public URLs returned by core-api.
- Reliability:
  - Autosave debounce remains ~900ms.
  - `409` conflict shows non-blocking reload-latest banner.
  - Query invalidation is task-scoped (`taskDetail`, `taskAudit`, `taskAttachments`) to avoid full-page reload.

## Collaboration UI (Phase 3)
- Description editor can run in collaborative mode when `NEXT_PUBLIC_COLLAB_ENABLED=true`.
- Minimal collaboration chrome:
  - small presence badge (`N users`)
  - readonly banner for VIEWER sessions
  - fallback banner when websocket collaboration is unavailable
- Visual style remains consistent with existing shadcn tokens and compact task detail layout.
- Fallback behavior:
  - when collab token/ws fails, editor gracefully switches to snapshot mode without full refresh.

## Mention Notifications (P1)
- Header notification center:
  - bell trigger with unread badge
  - latest mention notifications
  - one-click navigation to `/projects/:id?task=:taskId`
- Inbox page:
  - route: `/inbox`
  - filters: `All` / `Unread`
  - actions: mark read/unread, mark all read, open target task
- Caching:
  - targeted invalidation for notifications list and unread count after read/read-all mutations
  - no hard refresh required

## Admin UI (Phase 3+)
- Workspace user admin:
  - route: `/admin/users`
  - table with search + status filter
  - invite dialog (email + workspace role + copyable invite link)
  - row actions: edit display name, suspend/unsuspend, revoke invite
- Project members admin:
  - route: `/projects/:id/members`
  - add member dialog using searchable workspace-user combobox
  - inline role selector + remove action
- State management:
  - TanStack Query targeted invalidation for `workspaceUsers`, `workspaceInvitations`, `projectMembers`
  - no full browser refresh for admin actions
