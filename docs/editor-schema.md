# AtlasPM Editor Schema (Phase 2)

## Source of truth
- Task description is stored as ProseMirror JSON in `Task.descriptionDoc`.
- HTML is never used as source-of-truth.
- Plain text is derived server-side into `Task.descriptionText` for future search.

## Supported nodes
- `doc`
- `paragraph`
- `text`
- `heading` (levels 1-3)
- `bulletList`, `orderedList`, `listItem`
- `taskList`, `taskItem`
- `blockquote`
- `codeBlock`
- `horizontalRule`
- `image` (uploaded image URL)
- `table`, `tableRow`, `tableHeader`, `tableCell`
- `mention` (inline node)

## Supported marks
- `bold`
- `italic`
- `link`

## Mention node contract
- Node type: `mention`
- Required attrs:
  - `id`: project member user id (OIDC `sub`)
  - `label`: display label used in UI

## Save protocol
- Endpoint: `PATCH /tasks/:id/description`
- Body:
  - `descriptionDoc`: ProseMirror JSON document
  - `expectedVersion`: optimistic version integer
- Server behavior:
  - validates document root shape and payload size limit (200 KB)
  - returns `409` on version mismatch with latest metadata
  - increments `descriptionVersion` on success

## Comments mention token (Phase 2)
- Comments remain plain text in Phase 2.
- Mention syntax in stored body: `@[userId|label]`
- UI renders this token as mention pill text.
- Server extracts mention `userId` from tokens for `task_mentions` normalization.
