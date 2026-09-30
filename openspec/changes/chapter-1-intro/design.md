## Context

`apps/web` has one production version, `v1.0.0`, whose only route is the
Example `WidgetsView` at `""`. There is no designer, so no design-tool export
exists for `/design:design-01-create` to take in. The intro is the game's
first screen. It is presentation-heavy and time-driven, and it has no server
state. Requirements are in `specs/story/chapter-1-intro/spec.md`.

## Goals / Non-Goals

**Goals:** a deterministic, testable timeline; art and music that live as
readable source data; and nothing a later beat has to undo.

**Non-Goals:** beat 1, orientation modules 2–14, a mute or volume control, and
reuse of the motif outside the intro.

## Decisions

1. **Hand-built inside v1.0.0, and not a design version.** The route `""`
   becomes `IntroView`, and `WidgetsView` moves to `widgets`. A design version
   would need a synthetic "export" to feed a prompt built for a designer's
   handoff. That adds ceremony without a reviewer it serves. When a designer
   exists, the next visual revision goes through the design layer as normal.
   The screen still goes through `registry.tsx`, never through `app.tsx`.

2. **A pure timeline, rendered by a thin view.** A reducer, `intro-timeline`,
   owns the state: `gate → card(n, typedChars) → end`, with a glitch flag and
   a skip transition. A hook drives it from one clock (`requestAnimationFrame`
   plus elapsed milliseconds) and sends events to the audio. The components
   only render state. Vitest fake timers then cover the whole sequence without
   a browser. The alternative, CSS animations with `animationend` handlers,
   hides the timing in stylesheets and cannot be tested in jsdom.

3. **Pixel art as character grids.** Each card is 96×54 pixels (16:9), written
   as rows of single characters that index one shared palette of 16 colours or
   fewer. It is painted to a `<canvas>` with smoothing off and shown at an
   integer scale with `image-rendering: pixelated`. A diff of a card shows
   which pixels changed. Alternatives:
   - PNGs: binary, and cannot be reviewed.
   - SVG `<rect>` per pixel: about 5,000 DOM nodes per card.
   - Procedural drawing: compact, but cannot be edited pixel by pixel.

4. **Palette colours are artwork, not design values.** The ban on hardcoded
   hex in `docs/frontend.apps.md` protects UI consistency. A picture's pixels
   are content, just as an image file's are. The palette therefore lives in
   `views/intro/art/`, and the doc gets one sentence saying so. Everything
   around the canvas still uses design-system components and tokens: the
   caption, the prompt, the skip control and the background.

5. **Web Audio synth behind a port.** `IntroAudio` exposes `start`, `dropOut`,
   `resume`, `stop` and `snore`. The Web Audio implementation plays square and
   triangle voices from a note table, with a noise burst for the snore. A no-op
   implementation is used when `AudioContext` is missing or throws, and tests
   use a recording fake. Browsers only let audio start after a user gesture.
   So the `AudioContext` is created and resumed inside the gate's key or click
   handler, which is the reason the gate exists in code as well as in the
   story. The note table stays in `views/intro/`. It gets promoted when beat 6
   reuses the motif, not before.

6. **Glitch as two rendered frames.** On the Ganymede line the timeline sets
   `glitch` for exactly two animation frames. The canvas paints a
   deterministic corruption: shifted rows and palette swaps. The music drops
   out at the same event. Under `prefers-reduced-motion` the visual step is
   skipped and the drop-out remains.

7. **Captions are read once by screen readers.** The typed text is
   `aria-hidden`. The full caption sits in a polite live region, which is set
   once per card, so a screen reader hears one line and not one character at
   a time.

8. **Skip is a design-system `Button`.** It is reachable by Tab, and Escape is
   a shortcut for it. It dispatches `skip` and calls `audio.stop()`, and
   nothing else. The spec forbids any request or storage write.

9. **No pixel font.** Captions use the design system's typography. A pixel
   font would be a new third-party asset and would need licence review.

## Risks / Trade-offs

- [Hand-drawing 11 grids of 96×54 is laborious] → Draw silhouettes first and
  refine in review. Grids are data, so art can improve without code changes.
- [The UDS Button looks corporate in an 8-bit frame] → In-world that is
  fitting, since the corporation owns the video. If it jars, record tech debt.
  Do not hand-roll a button.
- [Audio differs across browsers] → Keep only oscillator and gain nodes.
  Specs never assert on sound, only on port calls.
- [Moving widgets off `/` breaks routing tests and E2E] → Update them in the
  same slice to target `/widgets` for the Example flow and `/` for the intro.

## Migration Plan

Frontend only. Deploying it changes what `/` shows. Rolling back means
reverting the change. No data or configuration is involved.

## Open Questions

- The exact tune and card timings. Tune them by ear and eye during the build.
  Neither changes the spec.
