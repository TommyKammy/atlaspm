# Asana Parity Rubric (P0-1)

This rubric defines measurable UI/UX parity targets for AtlasPM list view compared to Asana.

## Scope

- In scope: web-ui shell, project task list, section/task interactions.
- Out of scope: auth flow, backend architecture, non-list views (unless explicitly added).

## Visual Metrics

| Area | Target | Measure |
| --- | --- | --- |
| Base typography | 13-14px default text | Computed styles in task list rows |
| Row height | 40-44px | `tr`/row container height |
| Grid density | No clipped content at 1366x768 | Manual smoke + Playwright screenshot |
| Sidebar width | 220-260px | Computed width |
| Contrast | Text remains AA-ish readable in light/dark | Manual audit (headers/body/muted states) |
| Interactive states | Hover/focus/selected all visually distinct | Manual + screenshot assertions |

## UX Metrics

| Flow | Target |
| --- | --- |
| Add task | max 2 actions from list context |
| Inline edit | click -> edit, Enter save, Esc cancel |
| Reorder | visual feedback + persisted server order |
| Section collapse | toggles without page refresh |
| Subtask tree | parent-child relation visible at a glance |

## Architecture Guards

- web-ui uses core-api via HTTP only.
- No direct DB access from web-ui.
- No auth bypasses (OIDC/dev auth rules remain unchanged).

## Release Gate for Asana-like Iterations

A phase is complete only if all are true:
1. `pnpm -r --if-present lint` passes.
2. `pnpm -r --if-present test` passes.
3. `pnpm -r --if-present build` passes.
4. `pnpm e2e` passes.
5. Updated screenshots and a short diff note are attached to the PR.
