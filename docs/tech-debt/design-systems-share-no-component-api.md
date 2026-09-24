# The two design systems share a component name and nothing else

**Created:** 2026-09-22
**Module:** frontend / design system

## What

`pnpm run init` offers a choice of design system, and `@space-hero/design-system`
is an alias precisely so that choice is one line. Both packages export
`Button`. Their `Button` props do not overlap:

| Package | `variant` |
|---|---|
| `@ptv-mobility/design-system-uds` | `"primary" \| "secondary" \| "tertiary"` |
| `@ptv-mobility/design-system-base` | `"default" \| "outline" \| "ghost" \| "destructive"` |

There is no value that compiles against both. Measured by pointing the template
at each in turn and running `tsc --noEmit`.

So the alias makes *installing* a different design system one line, and makes
*compiling against* it a rewrite of every call site. The template itself is
fine — its one consumer, `WidgetsView`, now passes no `variant` and works
either way — but that is a property of having exactly one call site, not a
property of the alias.

Vite's build does not catch this. `apps/web`'s build does not typecheck; only
`pnpm run lint` does. The switched project built green and failed `lint`.

## Why

Accepted, because the alternatives are worse than the problem right now:

- Making the two design systems agree on a shared component contract is a real
  piece of design work across two repositories, and neither has a consumer
  asking for it yet.
- Dropping `base` from the init question would hide the discrepancy rather
  than record it, and `base` exists to be the second design system.
- A compatibility shim in `apps/web` would be a third vocabulary, and the one
  nobody maintains.

The cost falls on a project that switches design systems *after* writing
screens, which is not the flow init exists for: init asks the question before
there is any code.

## Resolution

Either a shared contract for the components both design systems ship — names,
variants and sizes agreed once, in the repository that owns each — or an
explicit statement that the two are alternatives rather than substitutes, in
which case the alias's promise should be narrowed in `docs/design-system.md`
and the init question should say so when it is answered with anything other
than the default.

Whoever owns `design-system-uds`'s `CODEOWNERS` is the person to decide, and
that name is still unassigned.
