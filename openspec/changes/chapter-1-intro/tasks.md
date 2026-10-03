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
- [x] 1.14 `docs/frontend.apps.md`: one sentence saying pixel-art palettes are artwork data, outside the hardcoded-hex rule (design §4)
- [x] 1.15 `docs/glossary.md`: add Beat, Card and Motif
- [x] 1.16 Add a `docs/product-debt/intro-hand-off-to-beat-1.md` record: the intro holds on card 10 until beat 1 exists
- [x] 1.17 Gate: `pnpm run verify` and `pnpm run test:e2e` pass

Review fixes (PR #8):

- [x] 1.18 Gate ignores Escape, modifiers on their own, and Ctrl/Alt/Meta shortcuts, which grant no audio permission; spec and tests updated
- [x] 1.19 `script.test.ts` holds every caption and image to the Script table in `docs/story/chapter-01-intro.md`
- [x] 1.20 Skipping keeps keyboard focus on the video instead of dropping it to the document
- [x] 1.21 The design exporter's registry check asserts a root route, not the full route list
- [x] 1.22 `docs/adr/ADR-0005-hand-built-screens-without-a-designer.md` records when a production version's screens are built by hand
- [x] 1.23 Gate: `pnpm run verify` and `pnpm run test:e2e` pass after the review fixes

Story note (the ending):

- [x] 1.24 Card 10 becomes a captionless snore, and card 11 the Module 2 ident (*What's the Drill*), whole, with **PRESS ANY KEY TO CONTINUE ORIENTATION**; the story script, spec, glossary and product-debt record follow

## 2. Slice 2: animated pixel art and the Ganymede glitch

- [x] 2.1 Add `views/intro/art/palette.ts`: one shared palette of 16 colours or fewer, written as hex, plus the twinkle cycles (design §3, §4)
- [x] 2.2 Add the grid parser: 96×54 backgrounds, square sprites (`_` transparent) and flipbooks of same-size frames, only palette or cycle characters, with an error naming the art and row
- [x] 2.3 Unit-test the parser: a valid grid; a wrong row count; a wrong row width; an unknown character; flipbook frames and a mismatched frame
- [x] 2.4 Add the pure renderer: background, palette cycling, sprites rotated by stepped nearest-neighbour rotation, flipbooks, and a still frame at time 0
- [x] 2.5 Unit-test the renderer: a cycle changes colour over time; a sprite is unrotated at time 0 and turned a quarter at a quarter turn; transparent sprite pixels show the background; a flipbook steps, wraps and runs backwards
- [x] 2.6 Add the pixel canvas: repaints at 12 fps, smoothing off, `image-rendering: pixelated`, holds still under reduced motion, and keeps the script's image line as its text alternative
- [x] 2.7 Draw card 0, reused by card 11: twinkling stars, the four-colour square turning clockwise, and the white dial turning anticlockwise as a 16-frame flipbook (1.25×, 64 steps)
- [x] 2.7a One screen (design §10): 384×216, card 0 redrawn at that size, captions and prompts drawn into the canvas in a 7×11 pixel font of our own, the idents' titles on two lines, emphasis in yellow; the prompt blinks, and holds lit under reduced motion
- [x] 2.7b Tests: font coverage of every caption and prompt; caption layout (wrap, forced break, typing order); the band (typed characters only, emphasis, art left alone above it); the screen's 12 fps, immediate repaint on typing, and stillness
- [x] 2.7c Hybrid art (design §11): scenes with their own clocks, a fade schedule on a brightness ladder, painted layers, rectangular pictures, fire flicker cycles; reduced motion stops movement but keeps cuts and fades
- [x] 2.7d Draw card 1, the Brightening: the Sun swells and bleeds to white, a hard cut to the child shielding their eyes, the light only rising to white again for card 2
- [ ] 2.8 Draw cards 2–10 as art in `views/intro/art/cards/`, following the script's Image column. Silhouettes first, one card per file
- [x] 2.8a Draw card 2, the wars: out of card 1's white, a dense dark city burning behind two crowds under six different flags; the fire spreads; a white flash cuts to a close shot where the crowds meet on "…and itself" and keep streaming in to the end, piling into one fighting mass under mixed flags
- [x] 2.8b Draw card 3, the corporations: towers rise out of the ruins with the ground shaking, their shadows swallowing the people; from below, a turning ring of them under one sky, lights coming on floor by floor and flashing together on "Order returned"; on the slogan, the Absolute Connections square appears in that sky, turning against the ring; then card 3 closes to black from the edges in, onto the square
- [x] 2.8c Draw card 4, Helios: out of that black, a spark on "Helios" grows into a small sun hung in cables halfway down a dark server hall, its warm light spreading from the inside out; on "every corporation" the racks' lights come on in every company's colour and pulses run along the cables into it; on "the Plan" it draws three orbits round itself, and on "Station by station" a dotted line of stations reaches out from Earth, one by one, into the dark
- [x] 2.8d Draw card 5, Mars and Deimos, and the Corridor: opening on card 4's last frame, a zoom into the Plan along Mars's orbit, the hall sinking into black, until Mars and Deimos fill the frame, the caption held back until it ends; on "Externa" the city on Deimos lights up, then a push-in to Externa Prima close, Mars dark over it; then, as the caption pauses after each place, jumps along the Corridor, stars streaking: to Steady Foot among Mars's trojans, and through the belt to Steady Hand, Jupiter ahead, each lighting on its name; on "A corridor of light" a pull-out to the Sun, Mars, the belt and Jupiter, every station between them lighting in turn
- [ ] 2.9 Add a test that every card's art parses and that every script card has art
- [ ] 2.10 Glitch: exactly two painted frames of deterministic corruption (row shifts and palette swap) on the glitch event, skipped under reduced motion (design §6)
- [ ] 2.11 Glitch tests: two corrupted frames then normal; no corruption under reduced motion; card 7 keeps its normal timing
- [ ] 2.12 Replace the slice 1 placeholders with the canvas
- [ ] 2.13 Review follow-ups from PR #8: set React state only when the rendered projection changes; precompute card timings once; one "whole caption" rule in `visibleChars`
- [ ] 2.14 Gate: `pnpm run verify` and `pnpm run test:e2e` pass

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
