## Why

The Chapter 1 intro is scripted (`docs/story/chapter-01-intro.md`) but nothing
plays it. It is the first thing a player should see, and its music is the
corporation's motif, which later beats reuse. Today `/` still serves the
Example widgets screen.

## What Changes

- New intro sequence at `/` in production version v1.0.0: the Absolute
  Connections orientation video, eleven cards (0–10) with typed-out captions.
- A **PRESS ANY KEY TO BEGIN ORIENTATION** ident gates the sequence. It also
  satisfies the browser rule that audio may only start after the player acts.
- Card art is 8-bit pixel art drawn in code: a pixel grid and a shared palette
  per card, kept as reviewable data. There are no binary assets.
- The music is a chiptune loop from a Web Audio synth, written as notes in code.
  It drops out at the Ganymede glitch and at the end.
- The Ganymede glitch on card 6: two frames of visual corruption and the
  music drops out.
- A skip control reading **Skipping is recorded.**, which records nothing.
- The sequence ends holding on card 10's countdown. The hand-off to beat 1 is
  deferred.
- The Example widgets screen moves from `/` to `/widgets`.

## Capabilities

### New Capabilities
- `story/chapter-1-intro`: the orientation video: start gate, card sequence,
  captions, music, the glitch, skip, the end state and reduced motion.

### Modified Capabilities
None. No baseline specs exist yet.

## Impact

- Frontend only: `apps/web/src/views/intro/` (new) and the v1.0.0 routes in
  `apps/web/src/versions/registry.tsx`. Routing unit tests and the E2E routing
  and widgets flows move off `/`.
- No backend, API, OpenAPI, database or new dependency.
- Docs: `docs/frontend.apps.md` gets a clarification. Pixel-art palettes are
  artwork data, not design values, so the rule against hardcoded hex does not
  cover them.
- New glossary terms: Beat, Card, Motif. A product-debt record for the beat 1
  hand-off.
- The design layer is not used. There is no designer export, so the intro is
  hand-built inside the existing production version, as ADR-0005 allows.
