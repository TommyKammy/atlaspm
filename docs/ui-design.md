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
  - mobile via sheet drawer
- Header:
  - current project title context
  - theme toggle dropdown

## Task List Structure
- Toolbar: search, status filter, priority filter, view selector, add action.
- Section groups:
  - uppercase section header + task count badge
  - section-scoped quick add row
- Rows:
  - dense table style (44px)
  - hover highlight
  - thin separators
  - progress bar (4px, success color at 100%)

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
- `['project', projectId, 'rules']`

## Mutation/Caching Discipline
- Use targeted optimistic updates for inline edits and reorder.
- Invalidate only affected keys on settle/error.
- No page reloads required for section/task create, edits, or reorder.
