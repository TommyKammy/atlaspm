# Visual Regression Guide (P6-2)

This project keeps screenshot-based regression checks lightweight and review-driven.

## Baseline Capture

Use Playwright to capture key screens after major UI changes:

```bash
pnpm --filter @atlaspm/playwright e2e -- tests/mvp.spec.ts
```

Then capture deterministic screenshots manually from local stack:

1. `/projects/:id` list view (light)
2. `/projects/:id` list view (dark)
3. `/projects/:id` with subtask tree expanded
4. `/admin/users` table view

Store screenshots under `e2e/playwright/baseline-screenshots/` (or PR artifacts).

## Comparison Policy

- Every UI-heavy PR must include before/after screenshots for the 4 screens above.
- If an intentional diff exists, explain it in PR description under "UI diffs".
- Unexplained visual diffs block merge.

## Non-goals

- Pixel-perfect snapshot enforcement in CI across all OS/browser fonts.
- Replacing functional E2E with screenshot assertions.

## Required Together With Visual Review

Run full quality gates:

```bash
pnpm -r --if-present lint
pnpm -r --if-present type-check
pnpm -r --if-present test
pnpm -r --if-present build
pnpm e2e
```
