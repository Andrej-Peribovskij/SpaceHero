## Purpose

Plays Beat 0 of Chapter 1, the Absolute Connections contractor orientation
video, as scripted in `docs/story/chapter-01-intro.md`.

Code: `apps/web/src/views/intro/` (frontend only; no backend module)

## ADDED Requirements

### Requirement: Start gate
The public root path SHALL open on card 0, the corporate ident, with the prompt
**PRESS ANY KEY TO BEGIN ORIENTATION**. A click, a tap, or a key press MUST
start the sequence. Escape, a modifier key on its own, and a shortcut held with
Ctrl, Alt or Meta MUST NOT start it: browsers do not accept those as permission
to play sound. No audio SHALL play before the sequence starts.

#### Scenario: Player opts in
- **WHEN** a player opens `/` and presses a key
- **THEN** the prompt disappears, the music starts and card 1 follows the ident

#### Scenario: Player does not opt in
- **WHEN** a player opens `/` and gives no input, or presses only Escape, a
  modifier or a shortcut
- **THEN** the ident and prompt stay on screen, silent, and no card advances

### Requirement: Card sequence
After the gate the sequence SHALL show cards 1 to 11 in script order, each with
its animated 8-bit image and its caption, typed out beneath it. Each card MUST advance
on its own once its caption is complete and has been held. Caption text MUST
match the script word for word.

#### Scenario: Cards play in order
- **WHEN** the sequence runs without input
- **THEN** cards 1 to 11 appear once each, in order, each caption as scripted

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
Card 10 SHALL be black with no caption: the music stops and a snore plays. The
sequence SHALL then end on card 11, the Module 2 ident. Card 11 shows card 0's
picture and the caption *ABSOLUTE CONNECTIONS · Contractor Orientation · Module
2 of 14: What's the Drill*, whole rather than typed, above the prompt **PRESS
ANY KEY TO CONTINUE ORIENTATION**. Until beat 1 exists, no input SHALL move it
on, and nothing SHALL follow automatically.

#### Scenario: Sequence ends
- **WHEN** card 11 is reached, and the player then presses a key
- **THEN** the ident and prompt hold indefinitely, silent, and the music does
  not restart

### Requirement: Reduced motion
When the player prefers reduced motion, captions SHALL appear whole instead of
typed, card art SHALL hold still, the prompt SHALL NOT blink, and the glitch
MUST NOT flash. The music still drops out, so the clue
survives.

#### Scenario: Reduced motion on card 6
- **WHEN** reduced motion is preferred and card 6 reaches the Ganymede line
- **THEN** the image neither moves nor flashes, the caption is shown whole, and
  the music drops out
