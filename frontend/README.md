# React + TypeScript + Vite

## Quality gate

Run `npm run verify` before committing: this executes the existing `node:test`
suite, TypeScript checking, and lint. `npm test` reports individual assertions
and includes every `.test.ts` and `.test.tsx` file in `src/tests/`.
The test loader uses the installed TypeScript compiler; no additional runner
dependency is needed. Run `npm run build` to check the production bundle too.

The original `WALKTHROUGH_UI_UX.md` referenced by the issue backlog is absent
from this checkout; this README records the current gate.

## Theme and stacking

Colors are declared once in `src/index.css` as Tailwind theme tokens. Use
utilities such as `bg-brand-cream`, `text-brand-espresso`, and
`border-brand-sage`, or CSS `var(--color-…)` for SVG and inline styles.
Canvas drawing APIs use `themeColor()` to resolve a token to its concrete
color. Information-bearing text uses `text-xs` (12px) or larger.

| Layer | Utility | Level | Use |
|---|---|---|---|
| Panel | `z-panel` | 10 | Canvas tool controls |
| Sticky | `z-sticky` | 20 | Headers and local menus |
| Overlay | `z-overlay` | 30 | Navigation backdrop |
| Drawer | `z-drawer` | 40 | Navigation and activity drawers |
| Modal | `z-modal` | 50 | Dialogs and their backdrops |

The levels are variables in `index.css`; same-layer dialogs rely on DOM order.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.
