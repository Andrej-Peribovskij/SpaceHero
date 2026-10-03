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
   CLAUDE.md forbids editing the public app. The rule that makes this an
   exception is `docs/adr/ADR-0005-hand-built-screens-without-a-designer.md`,
   written after review of PR #8.

2. **A pure timeline, rendered by a thin view.** A reducer, `intro-timeline`,
   owns the state: `gate → card(n, typedChars) → end`, with a glitch flag and
   a skip transition. A hook drives it from one clock (`requestAnimationFrame`
   plus elapsed milliseconds) and sends events to the audio. The components
   only render state. The pixel screen paints from that same clock, read every
   frame: while a card plays, the picture's time is the card's time on the
   timeline, so it pauses with a hidden page and keeps the caption's pace. A
   second clock would let the picture run ahead of the beats it is cued to.
   Vitest fake timers then cover the whole sequence without a browser. The alternative, CSS animations with `animationend` handlers,
   hides the timing in stylesheets and cannot be tested in jsdom.

3. **Animated pixel art, kept as character grids.** Each card is 384×216 pixels
   (16:9; see §10 for why not the first build's 96×54). Its art is data, written as rows of single characters that index one
   shared palette of 16 colours or fewer, so a diff of a card shows which pixels
   changed. The cards move, because this is a video game and not a slideshow.
   Movement comes from three techniques that 8-bit hardware used, and each keeps
   the art as data:
   - **Background:** a 96×54 grid.
   - **Palette cycling:** some characters name a *cycle*, a sequence of palette
     colours stepped over time, instead of a single colour. Stars twinkle this
     way: no pixel moves, their colour changes. Six cycles run out of phase with
     each other, so the stars don't blink in unison.
   - **Rotating sprites:** small square grids, with `_` for a transparent
     pixel, turned about a centre at a set speed and direction. The angle is
     rounded to a fixed number of steps per turn, and the rotation is
     nearest-neighbour: each screen pixel looks up the sprite pixel that lands
     on it, so rotated sprites keep hard pixel edges. This suits chunky shapes
     such as the square's brackets.
   - **Flipbooks:** a list of pre-drawn frames, one per angle step, shown in
     turn. A thin shape breaks up under pixel-by-pixel rotation: the dial's
     2-pixel ring became a pinwheel in the first build. So it is drawn at every
     angle instead, as 8-bit games did, since their hardware could not rotate at
     all. The dial repeats every quarter turn, so 16 frames cover its 64 steps.
     The frames were generated from the exact geometry of the approved
     prototype, and they are stored as pixel data like everything else.

   A pure renderer turns (art, time) into the 96×54 frame, so it can be tested
   without a browser. The canvas repaints at 12 frames a second, the cadence of
   old hardware, while the caption types at full rate. It is shown with
   `image-rendering: pixelated` at the width of the frame. At widths that are
   not a multiple of 96, pixel widths are uneven; that is accepted, rather than
   measuring the container to force an integer scale. Under
   `prefers-reduced-motion` nothing moves: every layer is painted at time 0 of
   its scene. The story still advances, though: a card's scene cuts and fade
   steps happen on cue, so a player who prefers reduced motion sees card 1's
   child as everyone else does.

   Card 0's logo was chosen by prototype (2026-09-30). It is a square of four
   coloured corner brackets, turning clockwise, around a white dial with four
   notches, turning anticlockwise. Speed is 1.25× the prototype's (square one
   turn per 4.8 s, dial one per 3.2 s), with 64 steps per turn. Alternatives
   considered:
   - Frame-by-frame grids: a rotation needs dozens of frames per card.
   - PNG sprite sheets: binary, and cannot be reviewed.
   - Drawing shapes in code: compact, but cannot be edited pixel by pixel.

4. **Palette colours are artwork, not design values.** The ban on hardcoded
   hex in `docs/frontend.apps.md` protects UI consistency. A picture's pixels
   are content, just as an image file's are. The palette therefore lives in
   `views/intro/art/`, and the doc gets one sentence saying so. Everything
   around the canvas still uses design-system components and tokens: the
   caption, the prompt, the skip control and the background.

5. **Web Audio synth behind a port.** `IntroAudio` exposes `start`, `dropOut`,
   `resume`, `stop` and `snore`, `pause` and `unpause` for a hidden page, and
   `close` to release the `AudioContext` when the intro unmounts. The synth
   computes the samples itself in plain
   arithmetic: square and triangle voices from a note table, and a noise burst
   for the snore, from a shift register like a console's noise channel. Web
   Audio only plays the result. Each sound plays through a gain of its own: the
   loop's is closed and opened by the glitch, and every stop fades a gain out
   over a few milliseconds before the source stops, since a source cut mid-wave
   clicks. The snore is played once, and a stop silences it too, even while it
   waits out its beat, so a skip on card 10 never lets it play over Module 2's
   music. A hidden page suspends the context, as it pauses the timeline (§2),
   and the snore's wait holds with it. The music stops on card 10
   and starts again from the top on card 11, Module 2's ident: the snore needs
   the silence, and the music coming back is what wakes Joe in beat 1. The
   loop is rendered once and kept for the restart. Computing the samples rather
   than using Web Audio's oscillators makes the music a pure function: the same
   numbers in every browser, in tests, and in a WAV the preview tool writes for
   listening (`pnpm run intro:render-music`). Rendering the loop takes tens of
   milliseconds, too long for the gate's handler, so the view renders it once
   the browser is idle after mount: the samples need no `AudioContext`, and
   the key press only copies them into a buffer. A render ahead that fails or
   has not run yet costs nothing: `start` renders the loop itself. If sound
   breaks partway, the audio is closed, not just dropped, so nothing it
   started can play on. A no-op
   implementation is used when `AudioContext` is missing or throws, and tests
   use a recording fake. Browsers only let audio start after a user gesture.
   So the `AudioContext` is created and resumed inside the gate's key or click
   handler, which is the reason the gate exists in code as well as in the
   story. The note table stays in `views/intro/`. It gets promoted when beat 6
   reuses the motif, not before.

6. **Glitch as two rendered frames.** As the Ganymede line finishes typing,
   the screen tears for exactly two of its 12-fps frames, then goes on as if
   nothing happened. The tear is deterministic: bands of rows shifted
   sideways, smeared, or in swapped palette colours, across the whole screen,
   caption included. Like the art, it is a pure function of the card's clock
   (`screen/glitch.ts`): the moment comes from the caption (`glitchMs`), the
   same one at which the timeline emits its `glitch` event, and the music
   drops out on that event. Under `prefers-reduced-motion` the visual step is
   skipped and the drop-out remains.

7. **Captions are read once by screen readers.** The typed text is drawn on
   the canvas, which is `aria-hidden`. The full caption sits in a polite live
   region, set once per card, so a screen reader hears one line and not one
   character at a time. The prompt is kept as visually hidden text beside the
   canvas, for the same reason.

8. **Skip is a design-system `Button`.** It is reachable by Tab, and Escape is
   a shortcut for it. It dispatches `skip`, which stops Module 1's music,
   and nothing else; the end state then starts Module 2's, as it does when the
   video plays through. The spec forbids any request or storage write.

9. **A pixel font of our own** (superseding "no pixel font", see §10). A
   third-party pixel font would need licence review. This one is drawn for the
   game as data: one 7×11 grid per character in `screen/font.ts`, like the art.
   It has no italics, so the script's italics are set in yellow. A test fails if
   any caption or prompt needs a character the font lacks.

10. **One screen: art and text in the same pixels** (2026-09-30, on
   `feat/story/chapter-1-intro-pixel-screen`). Art at 96×54 sat awkwardly in a
   modern page with crisp design-system text below it. So the whole video is
   now one 384×216 canvas: the art fills it, and a black band over its lower
   edge holds the caption and the prompt. Why 384×216:
   - It is exactly 4× the first build's size, so art drawn at 96×54 scales up
     by whole pixels.
   - Shown 768 pixels wide, each pixel is 2×2 on screen.

   The font is the size that makes this work. Doubling a 5×7 font would put
   the ident's 45-character title at 540 pixels, wider than the screen. A 7×11
   font on an 8-pixel step fits 46 characters a line, and its 9-pixel capitals
   stay readable when a phone shows the screen at about 375 pixels wide. The
   whole caption is laid out before typing starts, so words never jump lines
   mid-type. The band's height follows the caption: the longest (card 4) takes
   four lines, a 63-pixel band, so card art keeps what matters above row 153.

   The screen repaints at 12 fps for the art, and on the next display frame
   when a character is typed. The skip control stays a design-system button
   outside the canvas, because it is an interactive control, not part of the
   picture.

11. **Card art is a hybrid: code for scenery, pixel data for figures**
   (2026-10-01, chosen with card 1). At 384×216 a full picture is 83,000
   characters and an animated card would be about 600 KB of grids that nobody
   reads or edits by hand. So each card now has three parts:
   - **Scenery and effects are painted by code:** sky, Sun, light and fades.
     The numbers worth tweaking (radius, timings, steps) are named constants at
     the top of the card's file.
   - **Hand-drawn figures stay pixel data:** the logo's square and dial, and
     card 1's child.
   - **The engine supplies the structure:** a card is a list of scenes, each
     cutting in at a time and running on its own clock from 0. A fade schedule
     steps every colour up a brightness ladder towards white
     (`palette.ts`), as 8-bit games faded. Painted layers draw through a
     small canvas.

   Card 0 keeps its starfield as a grid; it predates the decision and costs
   nothing to keep. Alternatives considered:
   - Pixel data for everything: faithful to §3's first rule, but unreadable
     at this size.
   - Image files from a pixel editor: the best drawing tools, but binary, and
     cannot be reviewed.

12. **A debugging jump, in the dev server only** (2026-10-03, for task 4.1).
   Tuning a card meant watching up to 80 seconds to reach it. The timeline
   now has a `seek` action: it goes to the start of a card and fires
   `seeked`, then that card's `card` event. Everything cued from the card's
   clock works as on arrival, such as card 6's glitch and card 10's snore.
   On `seeked` the music stops and starts the loop again from the top. That
   ends any dropout or snore. The loop is not tied to the cards, so no
   position in it would be more right than another.
   `useDebugSeek` gives it a keyboard: → and ← once the video plays. The card
   jumped to goes into the address as `?card=N`. An address carrying it
   starts there once the gate opens, so a reload after an edit lands on the
   card being tuned. The gate still waits for a key, because only a key press
   lets the music start.
   `IntroView`'s `debugSeek` defaults to `import.meta.env.DEV`. A production
   build has no jump, and the player can still only skip, which is recorded.
   Alternative considered: a card picker drawn on the screen. That puts
   debugging controls inside the picture, and a URL and two keys do the job.

## Risks / Trade-offs

- [Hand-drawing 11 grids of 96×54 is laborious] → Draw silhouettes first and
  refine in review. Grids are data, so art can improve without code changes.
- [The UDS Button looks corporate in an 8-bit frame] → In-world that is
  fitting, since the corporation owns the video. If it jars, record tech debt.
  Do not hand-roll a button.
- [Audio differs across browsers] → The synth computes every sample, so Web
  Audio only plays buffers, through buffer source and gain nodes. Specs never
  assert on sound, only on port calls.
- [Moving widgets off `/` breaks routing tests and E2E] → Update them in the
  same slice to target `/widgets` for the Example flow and `/` for the intro.

## Migration Plan

Frontend only. Deploying it changes what `/` shows. Rolling back means
reverting the change. No data or configuration is involved.

## Open Questions

- The exact tune and card timings. Tune them by ear and eye during the build.
  Neither changes the spec.
