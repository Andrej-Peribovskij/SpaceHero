<!-- Reference copy from process/design/templates/version-registry/. -->

# `src/versions/` — the UI version registry

The registry is what makes the design → code loop possible: end users get clean, unversioned URLs, while
every design and production version stays reachable to administrators at its own prefix, and
which version is public is one environment line on the API.

Read `docs/design-version-registry.md` for the contract, and
`docs/design-folder.md` for how a version's own folder is laid out.

## Who owns which file

| File | Owner | When the reference changes |
|---|---|---|
| `registry.tsx` | **this app** | left alone |
| `public-config.ts` | **this app** | left alone |
| `registry-core.ts` | the process | re-copy |
| `public-version.tsx` | the process | re-copy |
| `version-base.tsx` | the process | re-copy |
| `mount.tsx` | the process | re-copy |
| `registry.contract.test.ts` | the process | re-copy |
| `README.md` | the process | re-copy |

Put anything of your own — a version switcher, this app's own registry tests — in new files
beside these. A process-owned file and its reference in
`process/design/templates/version-registry/` are meant to stay identical: change the reference
and copy it down, in one commit, so the two cannot drift.

## Wiring it into the app, once

Two things the scaffold cannot do for you, because both are the app's own:

**1. The router.** In whatever renders your `<Routes>`:

```tsx
import { PublicVersionProvider } from "./versions/public-version";
import { useVersionRoutes } from "./versions/mount";
import { assertNoReservedRootCollisions } from "./versions/registry";

export function App() {
  return (
    <BrowserRouter>
      {/* Which version is public has to settle before the router renders: no unprefixed
          path is resolvable until it is known. */}
      <PublicVersionProvider>
        <AppRoutes />
      </PublicVersionProvider>
    </BrowserRouter>
  );
}

function AppRoutes() {
  const { session } = useSession();

  useEffect(() => {
    if (import.meta.env.DEV) assertNoReservedRootCollisions();
  }, []);

  return (
    <Routes>
      {useVersionRoutes({
        isAdministrator: session ? session.administrator : undefined,
        renderGuard: (guard, page) => {
          switch (guard) {
            case "session":
              return <RequireSession>{page}</RequireSession>;
            case "role:admin":
              return <RequireRole role="admin">{page}</RequireRole>;
            case "none":
              return page;
          }
        },
      })}

      {/* The app shell's own routes — not part of any version. Every first segment used here
          belongs in RESERVED_ROOT_PREFIXES in registry.tsx. */}
      <Route path="/login" element={<LoginView />} />
    </Routes>
  );
}
```

`isAdministrator` is `undefined` while the session is still loading, and the prefixed mounts
render nothing rather than redirecting — an administrator must never be bounced off their own
URL by a race.

**2. The API endpoint.** `public-config.ts` fetches `publicUiVersion` from the API. Copy the
reference implementation from `process/design/templates/version-registry/backend/` — .NET and
Node are both there — and set `PUBLIC_UI_VERSION` in each environment. It must be read
**fresh per request**: that is what makes prompt 06's flip and its rollback one line each, with
no frontend rebuild.

Until the endpoint exists the app still runs: the fetch fails, the console says so, and
`PROD_VERSIONS[0]` is served.

## The two rules that break things quietly

**No hardcoded version prefixes.** Screens navigate through `useVersionNav`, `useVersionPath`
and `<VersionLink>` from `version-base.tsx` — never `navigate("/v3/briefing")`. A literal throws
a public user onto a versioned URL, the one thing this architecture exists to hide, and it stays
invisible until somebody clicks that specific button. Any redirect you persist must be stored
base-relative (`stripVersionBase`).

This is enforced. The rule lives in `eslint.config.mjs` at the repository root, not in this
package — one flat config so that `pnpm --filter ./apps/web run lint` and a root `eslint .`
apply the same rule to the same file. It covers template literals as well as strings, and its
message says what to use instead. The shape is:

```js
{
  files: ["src/pages/**/*.{ts,tsx}"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "Literal[value=/^\\/(v\\d|design\\/)/]",
        message:
          "Version prefixes must not be hardcoded. Navigate with useVersionNav / VersionLink.",
      },
    ],
  },
}
```

**`wired` must be true to the code.** Check the field, never the folder path. A version that
talks to a real service says so, and the consequences follow from the field: clicking through a
wired version writes real records, so it is not a dry run.

## Adding a version

You do not edit any of this by hand. Prompt 01 creates a design version and appends its entry;
prompt 02 promotes one to a production version; prompt 06 moves `PUBLIC_UI_VERSION`. Run them
through the wrappers in `design-commands/`.
