# Fixtures

Hand-written stand-ins for inputs the process receives from outside it.

## `handoff-v1.1.0/`

A design-tool export in the shape prompt 01 takes as `SOURCE_PATH`, so prompt 01 can be run
without a designer and without the design tool. Six files, about a hundred lines — deliberately
hello-world, because the point is the *classes of content* the prompt must cope with, not volume.

**It is not a sample of real tool output, and it is not a template.** A genuine export is larger,
and its exact shape is the tool's business, not this repository's.

It is self-contained: it imports nothing from the design system, exactly as a real export does
not. That is what makes the first trap below a trap at all.

Every file in it trips one failure mode prompt 01 exists to prevent:

| In the fixture | The trap |
|---|---|
| `components/Chip.tsx` | an **adoption gap** — a local reimplementation of a component the design system already ships. A prompt that stages whatever the export contains manufactures a duplicate here. |
| `components/GreetingCard.tsx` | the one **genuinely new** component. It is what should end up in `staging/vX.Y.Z/`, and the only thing that should. |
| `icons.tsx` wanting `wave` | a concept **not in the shipped icon registry**, which is frozen during a staging cycle. Forces the `ReactNode` icon-slot pattern instead of an edit to the registry. `user` sits beside it and is already there, so the run has to tell them apart. |
| `screens/GreetingScreen.tsx` linking to `/v1/about` and `` `/v1/greeting/${slug}` `` | **hardcoded version prefixes**, which must all become the version-aware navigation the registry provides. The template literal is the one a careless conversion misses. |
| `tokens.json` | names the design system's own semantic tokens and adds none, so conversion is a mapping rather than a redesign. |

A deliberately realistic export would trip none of these, which would make it a worse test that
looked like a better one.

### It is checked against the real design system, not against a story

The traps are only traps while they stay true of `@ptv-mobility/design-system-uds`. As of
0.6.1: it ships `Chip`, it does not ship `GreetingCard`, its icon registry has `user` and not
`wave`, and all eleven CSS variables `tokens.json` and the screens name are defined by its
stylesheet. If a future design system version ships a `GreetingCard` or adds a `wave` icon, this
fixture stops testing anything and should be adjusted — that is the maintenance it asks for, and
it is cheaper than the alternative of a fixture nobody can tell has gone stale.
