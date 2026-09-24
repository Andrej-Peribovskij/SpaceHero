// ESLint for the whole repository, in one flat config at the root.
//
// There was no ESLint here at all before this file, and the gap had a
// consequence worth naming: the design process's "no hardcoded version
// prefixes inside pages/**" rule had nowhere to live. `apps/web`'s `lint` was
// `tsc -p tsconfig.json --noEmit`, which type-checks beautifully and cannot
// see a string literal. `docs/design-folder.md` and
// `apps/web/src/versions/README.md` both wrote the rule down and both had to
// end with "enforce it in ESLint" — at a repository that had none.
//
// Adding ESLint takes `lint` away from `tsc`, so every package now has a real
// `typecheck` script and the root gate runs both. A lint that quietly stopped
// type-checking would be a worse trade than no lint.
//
// One config, not one per package. `files` patterns are resolved relative to
// this file, so `pnpm --filter ./apps/web run lint` and a root `eslint .`
// select exactly the same rules for exactly the same file — which is what lets
// the design process scope its gate to one package and still trust it.
//
// Deliberately NOT type-aware. typescript-eslint's type-checked presets build
// a TypeScript program per package, which is a second full compile of what
// `typecheck` has just compiled. The rules that need types are worth having;
// they are not worth paying for twice in a gate that runs both steps anyway.

import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

// The rule the design process names as an acceptance criterion rather than
// polish — prompt 01 §"Design-tool exports", prompt 03 §3. A page that says
// `navigate("/v3/briefing")` throws a public user onto a versioned URL, which
// is the one thing the version registry exists to hide, and nothing notices
// until somebody clicks that particular button.
//
// `/design/` is in the pattern for the same reason `^/v\d` is: a design
// version's own pages are reached through a `/design/vX.Y.Z` prefix that only
// an administrator ever sees, and a literal bakes that prefix into a screen
// that prompt 02 will later copy into a production version, where it is wrong.
const NO_HARDCODED_VERSION_PREFIX = [
  "error",
  {
    // "/v3/briefing", "/design/v1.2.0/project"
    selector: "Literal[value=/^\\/(v\\d|design\\/)/]",
    message:
      "Hardcoded version prefix. A literal like \"/v3/briefing\" puts a versioned URL in a public user's address bar — the thing src/versions/ exists to hide — and stays invisible until someone clicks that button. Navigate with useVersionNav() or <VersionLink> from src/versions/version-base.tsx: they resolve against the base that useVersionRoutes mounted this page under, so the same page works unprefixed as the public version and prefixed as a design version. Store redirects base-relative (stripVersionBase). NOTE: this rule sees literals only — a path built at runtime from a variable passes it untouched, which is why the routing E2E in docs/design-testing.md §1 is the other half of this guarantee and not a duplicate of it.",
  },
  {
    // `/v3/project/${id}`, and any template whose text carries the prefix
    selector: "TemplateElement[value.raw=/^\\/(v\\d|design\\/)/]",
    message:
      "Hardcoded version prefix in a template literal. `/v3/project/${id}` is the same bug as \"/v3/briefing\" with interpolation in it: use useVersionNav()(`/project/${id}`) or <VersionLink> from src/versions/version-base.tsx, which resolve against the base useVersionRoutes mounted this page under. This rule sees literals only — a prefix assembled from a variable passes it, which is what the routing E2E in docs/design-testing.md §1 is for.",
  },
];

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/storybook-static/**",
      "**/playwright-report/**",
      "**/test-results/**",
      // .NET build output. `eslint .` walks the whole tree and services/api is
      // not a JavaScript package.
      "services/**/bin/**",
      "services/**/obj/**",
      // Generated from openapi/api-v1.json by `pnpm run openapi:sync`. Linting
      // it would be linting openapi-typescript's output, and `openapi:check`
      // already fails the gate if it drifts.
      "packages/schemas/src/api-v1.d.ts",
    ],
  },

  // ── apps/web/src: React 19 + TypeScript, running in a browser ──
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      // The two classic hook rules, and only those. eslint-plugin-react-hooks
      // v7's `recommended` is the React Compiler suite — sixteen rules about
      // purity, memoisation and immutability, aimed at a codebase that has
      // opted into the compiler. This one has not, and turning them on would
      // mean either a wave of changes nobody asked for or a wave of disables,
      // both of which are worse than the rules are good here. Revisit when the
      // compiler is actually adopted.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      // Vite's Fast Refresh only works if a module's exports are all
      // components. `allowConstantExport` lets a module export constants
      // beside them, which is what the registry files do.
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // `_`-prefixed is the convention for "deliberately unused" here.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },

  // Test files run under Vitest, which supplies describe/it/expect and a DOM.
  {
    files: ["apps/web/src/**/*.test.{ts,tsx}", "apps/web/src/testing/**/*.ts"],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },

  // `react-refresh/only-export-components` is genuinely wrong for
  // `src/versions/`, so it is off there and nowhere else.
  //
  // The rule wants a module to export components and nothing else, so Vite can
  // hot-replace it. These modules exist to do the opposite: `registry.tsx` is
  // the version table *and* the lazy components its entries point at,
  // `version-base.tsx` is a React context with the hooks and the `<VersionLink>`
  // that read it, `mount.tsx` is `useVersionRoutes` with the route components
  // it builds. Splitting each of them in two to satisfy the rule would trade
  // the one-file-per-concept shape that `docs/design-version-registry.md`
  // describes — and that prompt 01 appends to — for a dev-server convenience.
  // The cost is that editing the registry does a full reload instead of a hot
  // update, which is the correct price.
  {
    files: ["apps/web/src/versions/**/*.{ts,tsx}"],
    rules: { "react-refresh/only-export-components": "off" },
  },

  // `vite.config.ts` and `vitest.setup.ts` sit beside the package, not under
  // `src/`, and run in Node rather than a browser. Left out, they would be
  // silently unlinted — a flat config lints only what a `files` pattern claims.
  {
    files: ["apps/web/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node, ...globals.browser },
    },
  },

  // ── scripts/ and process/design/scripts/: Node ESM, no bundler, no DOM ──
  {
    files: ["scripts/**/*.mjs", "process/design/scripts/**/*.mjs", "*.mjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },

  // ── tests/e2e: Playwright, TypeScript, Node ──
  {
    files: ["tests/e2e/**/*.ts"],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: globals.node,
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },

  // ── The version-prefix rule ──
  //
  // Scoped to pages, and nowhere else, because a version prefix is *data* in
  // `src/versions/` — the registry declares the prefixes and the mount builds
  // paths out of them — and a legitimate string in a test that asserts what a
  // URL resolves to. Only a page is wrong to contain one.
  //
  // `apps/web/src/pages/` does not exist yet: prompt 01 creates
  // `src/pages/design/vX.Y.Z/` the first time a design version is made. The
  // rule is here before the directory on purpose, because the first thing that
  // lands there is a design-tool export, which is exactly where these literals
  // come from.
  {
    files: ["apps/web/src/pages/**/*.{ts,tsx}"],
    rules: { "no-restricted-syntax": NO_HARDCODED_VERSION_PREFIX },
  },
);
