## Purpose

Plays Beat 0 of Chapter 1, the Absolute Connections contractor orientation
video, as scripted in `docs/story/chapter-01-intro.md`.

Code: `apps/web/src/views/intro/` (frontend only; no backend module)

## ADDED Requirements

### Requirement: Start gate
The public root path SHALL open on card 0, the corporate ident, with the prompt
**PRESS ANY KEY TO BEGIN ORIENTATION**. Any key, click or tap MUST start the
sequence. No audio SHALL play before that input.

#### Scenario: Player opts in
- **WHEN** a player opens `/` and presses a key
- **THEN** the prompt disappears, the music starts and card 1 follows the ident

#### Scenario: Player does nothing
- **WHEN** a player opens `/` and gives no input
- **THEN** the ident and prompt stay on screen, silent, and no card advances

### Requirement: Card sequence
After the gate the sequence SHALL show cards 1 to 10 in script order, each with
its 8-bit image and its caption, typed out beneath it. Each card MUST advance
on its own once its caption is complete and has been held. Caption text MUST
match the script word for word.

#### Scenario: Cards play in order
- **WHEN** the sequence runs without input
- **THEN** cards 1 to 10 appear once each, in order, each caption as scripted

### Requirement: Orientation music
A single chiptune loop SHALL play from the gate until the end or a skip. When
audio is unavailable, the sequence MUST still play in full, silently.

#### Scenario: Audio cannot start
- **WHEN** the browser provides no working audio output
- **THEN** every card and caption still plays, and no error is shown

### Requirement: The Ganymede glitch
When the caption of card 6 reaches "Ganymede was found unsuitable.", the
picture SHALL glitch for two frames and the music SHALL drop out. The sequence
then carries on as before. No caption SHALL explain the glitch.

#### Scenario: Glitch on the Ganymede line
- **WHEN** card 6's caption types "Ganymede was found unsuitable."
- **THEN** the image is visibly corrupted for two frames, the music is silent,
  and card 7 follows on its normal timing

### Requirement: Skip
Once the sequence has started, a skip control reading **Skipping is recorded.**
SHALL be available, by pointer and by keyboard. Skipping MUST jump to the end
state. It MUST NOT send any request or store anything.

#### Scenario: Player skips
- **WHEN** the player activates skip during card 3
- **THEN** the end state is shown and no network request or storage write occurs

### Requirement: End state
The sequence SHALL end on card 10: black, music stopped, a snore, and the
caption *Module 2 of 14 will begin in 5… 4…* counting down and holding on "4…".
Nothing SHALL follow automatically.

#### Scenario: Sequence ends
- **WHEN** card 10's countdown reaches "4…"
- **THEN** the screen holds there indefinitely and the music does not restart

### Requirement: Reduced motion
When the player prefers reduced motion, captions SHALL appear whole instead of
typed, and the glitch MUST NOT flash. The music still drops out, so the clue
survives.

#### Scenario: Reduced motion on card 6
- **WHEN** reduced motion is preferred and card 6 reaches the Ganymede line
- **THEN** the image does not flash, the caption is shown whole, and the music
  drops out
