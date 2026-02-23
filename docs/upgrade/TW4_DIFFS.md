# Tailwind v4 Upgrade Diff Notes

## Scope
- Upgraded `apps/web-ui` from Tailwind CSS v3 to v4.
- Kept visual behavior and token usage aligned with existing design system.

## Unavoidable / Observed Differences
- No intentional design/layout changes were introduced.
- Build output now logs a non-blocking Node warning about loading `tailwind.config.ts` as ESM under Next 16 build workers.
  - This does not affect runtime behavior or styling output.
  - Can be cleaned up in a follow-up by switching to a JS config format compatible with the chosen module mode.

## Migration Changes
- PostCSS plugin switched to `@tailwindcss/postcss` (Tailwind v4 requirement).
- CSS entry switched from legacy directives to v4 import style:
  - `@import "tailwindcss";`
  - `@config "../../tailwind.config.ts";`
- Existing token variables and `@apply` usage were preserved.

## Validation
- Full lint/build/test/E2E suite was executed and passed after migration.
