# Dashboard Pattern Migration Plan

## What We Will Port
- App shell composition pattern from the reference dashboard:
  - sidebar component
  - header component
  - content frame component
- Layout preferences persisted with cookies:
  - sidebar mode (collapsed/expanded style)
  - content layout width mode (centered/full)
- Optional single theme preset pattern using `data-theme-preset` and CSS variable overrides.

## What We Will NOT Port
- Auth flows, auth providers, or session handling from the template.
- Any architecture changes to AtlasPM core/UI separation.
- Tooling replacements (biome/husky/template-specific scripts).
- Template-wide component imports that are not used by AtlasPM.

## Guardrails
- Keep enterprise OIDC assumptions intact.
- Keep web-ui -> core-api HTTP contract unchanged.
- Do not weaken existing test coverage or assertions.
- No bypasses for role-based behavior and permissions.

## Verification Commands
Run from repo root for each phase:

```bash
pnpm install
pnpm -r --if-present build
pnpm e2e
```

For focused UI refactor checks:

```bash
pnpm --filter @atlaspm/web-ui build
pnpm e2e
```
