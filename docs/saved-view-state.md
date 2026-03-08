# Saved View State Schema

This issue defines the shared saved-view state contract that follow-up saved-view persistence and UI work build on.

## Layers

Saved-view behavior is modeled as four precedence layers:

1. Fallback defaults
2. Saved default view
3. Selected named view
4. Transient working state

Transient working state is not the same thing as a saved default or a named view. It represents the user's unsaved, in-progress adjustments for the currently active mode.

## Precedence

Resolution order is:

1. Start from the product fallback for the current mode.
2. Overlay the saved default view for that mode, if present.
3. Overlay the selected named view, if present.
4. Overlay the transient working state, if present.

Each higher layer overrides only the categories it defines. Missing categories fall through to the next lower layer. This keeps partial saved views predictable and matches the current timeline/gantt hydration behavior.

## Shared Schema

`ProjectViewState` is the shared schema shape in `packages/domain/src/services/project-view-state.ts`.

Categories:

- `grouping`
- `sorting`
- `filters`
- `zoom`
- `visibleFieldIds`

`filters` currently supports:

- `statusIds`
- `assigneeIds`
- `schedule`
- `customFieldFilters`

`zoom` currently supports:

- `unit`
- `anchorDate`
- `workingDaysOnly`
- `ganttRiskFilterMode`
- `ganttStrictMode`

## Mode Coverage

Mode support is normalized per view:

- `list`: grouping, sorting, filters, visible fields
- `board`: grouping, sorting, filters, visible fields
- `timeline`: grouping, sorting, filters, zoom
- `gantt`: filters, zoom

Unsupported categories are dropped during normalization for that mode.

## Current Projection

The shared schema is the source of truth, but current timeline/gantt APIs still expose the existing flat wire format for compatibility in this phase:

- `grouping.field` -> `swimlane`
- `sorting.field` -> `sortMode`
- `filters.schedule` -> `scheduleFilter`
- `zoom.unit` -> `zoom`
- `zoom.anchorDate` -> `anchorDate`
- `zoom.workingDaysOnly` -> `workingDaysOnly`
- `zoom.ganttRiskFilterMode` -> `ganttRiskFilterMode`
- `zoom.ganttStrictMode` -> `ganttStrictMode`

That projection is normalized through the shared schema on write, and the web timeline/gantt hydration path resolves state through the shared precedence helper on read.
