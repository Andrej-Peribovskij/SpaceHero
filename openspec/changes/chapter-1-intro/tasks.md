Three slices. Each can be merged alone and leaves `/` working. Slice 1 ships
the sequence with flat placeholder images and no sound. Slice 2 adds the art
and the glitch. Slice 3 adds the music. See `design.md` for the decisions
referenced below.

## 1. Slice 1: the sequence at `/`

- [x] 1.1 In `apps/web/src/versions/registry.tsx`, point v1.0.0's `""` route at `IntroView` and move `WidgetsView` to `widgets` (design §1)
- [x] 1.2 Update `apps/web/src/versions/routing.test.tsx` to assert the intro's heading at `/` and `/v1.0.0`
- [x] 1.3 Update `tests/e2e/flows/widgets.spec.ts` to use `/widgets`, and `routing.spec.ts` and `design-preview/administrator-mounts.spec.ts` to expect the intro at `/`
- [x] 1.4 Add `views/intro/script.ts`: the 11 cards' captions word for word from `docs/story/chapter-01-intro.md`, plus the index of the Ganymede line
- [x] 1.5 Add the pure reducer `views/intro/intro-timeline.ts`: gate → card(n, typedChars) → end, with skip and a glitch event (design §2)
- [x] 1.6 Unit-test the reducer: gate holds without input; cards 1–10 in order; skip from any card reaches end; the countdown holds on "4…"; the glitch event fires once on the Ganymede line
- [x] 1.7 Add `views/intro/use-intro-timeline.ts`: one clock driving the reducer, which also reads `prefers-reduced-motion` and then reveals captions whole
- [x] 1.8 Add presentational components for the ident with its **PRESS ANY KEY TO BEGIN ORIENTATION** prompt, the card frame with a placeholder image, the caption, and the end card
- [x] 1.9 Gate input: any key, click or tap starts the sequence; after that, keys other than Escape do nothing
- [x] 1.10 Skip: a design-system `Button` reading **Skipping is recorded.**, with Escape as its shortcut (design §8)
- [x] 1.11 Captions: typed text `aria-hidden`, the full caption in a polite live region, set once per card (design §7)
- [x] 1.12 View tests with fake timers and MSW: the start gate (both scenarios); card order and caption text; skip sends no request and writes no storage; the end state; reduced motion shows captions whole
- [x] 1.13 Add an E2E flow `tests/e2e/flows/intro.spec.ts`: open `/`, press a key, see card 1, skip, see the end card
- [ ] 1.14 `docs/frontend.apps.md`: one sentence saying pixel-art palettes are artwork data, outside the hardcoded-hex rule (design §4)
- [ ] 1.15 `docs/glossary.md`: add Beat, Card and Motif
- [ ] 1.16 Add a `docs/product-debt/intro-hand-off-to-beat-1.md` record: the intro holds on card 10 until beat 1 exists
- [x] 1.17 Gate: `pnpm run verify` and `pnpm run test:e2e` pass

## 2. Slice 2: pixel art and the Ganymede glitch

- [ ] 2.1 Add `views/intro/art/palette.ts`: one shared palette, 16 colours or fewer, written as hex, with a comment pointing at design §4
- [ ] 2.2 Add a grid parser that validates each grid: 96×54, only palette characters, and a clear error naming the card and row
- [ ] 2.3 Unit-test the parser: a valid grid; a wrong row width; an unknown character
- [ ] 2.4 Add the pixel canvas component: smoothing off, integer scale, `image-rendering: pixelated`, and a text alternative from the script's image line
- [ ] 2.5 Draw cards 0–10 as grids in `views/intro/art/cards/`, following the script's Image column. Silhouettes first, one card per file
- [ ] 2.6 Add a test that every card's grid parses and that there is exactly one grid per script card
- [ ] 2.7 Glitch: exactly two painted frames of deterministic corruption (row shifts and palette swap) on the glitch event, skipped under reduced motion (design §6)
- [ ] 2.8 Glitch tests: two corrupted frames then normal; no corruption under reduced motion; card 7 keeps its normal timing
- [ ] 2.9 Replace the slice 1 placeholders with the canvas
- [ ] 2.10 Gate: `pnpm run verify` and `pnpm run test:e2e` pass

## 3. Slice 3: the orientation music

- [ ] 3.1 Define the `IntroAudio` port (`start`, `dropOut`, `resume`, `stop`, `snore`), plus a no-op implementation and a recording fake for tests (design §5)
- [ ] 3.2 Add the Web Audio implementation: square and triangle voices from a note table, gain envelopes, and a noise-burst snore; no dependency
- [ ] 3.3 Write the gloomy, mysterious chiptune loop as a note table in `views/intro/music/`
- [ ] 3.4 Create and resume the `AudioContext` inside the gate's input handler. Fall back to the no-op when it is missing or throws
- [ ] 3.5 Wire the timeline events to the port: start at the gate; drop out, then resume, at the glitch; stop and snore at card 10; stop on skip
- [ ] 3.6 Tests against the recording fake: nothing plays before the gate; drop-out on the Ganymede line, including under reduced motion; stop plus snore at the end; stop on skip
- [ ] 3.7 Test that a throwing `AudioContext` still plays every card, silently and with no error shown
- [ ] 3.8 Gate: `pnpm run verify` and `pnpm run test:e2e` pass

## 4. Final verification

- [ ] 4.1 Play the intro in a browser end to end, by ear and eye, then tune timings and the tune
- [ ] 4.2 `pnpm run spec:validate chapter-1-intro` passes and every task above matches the implementation
