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
A single chiptune loop SHALL play from the gate until card 10 or a skip, and
again, from the top, on card 11. When audio is unavailable, the sequence MUST
still play in full, silently.

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
Once the sequence has started, and until card 11, a skip control reading
**Skipping is recorded.** SHALL be available, by pointer and by keyboard.
Skipping MUST jump to the start of card 11, Module 2's ident, from where the
ending plays out. Card 11 itself MUST NOT be skippable. Skipping MUST NOT send
any request or store anything.

#### Scenario: Player skips
- **WHEN** the player activates skip during card 3
- **THEN** card 11 is shown from its start, the skip control is gone, and no
  network request or storage write occurs

### Requirement: End state
Card 10 SHALL be black with no caption: the music stops, a snore plays, and a
beat of silence follows it. Card 11, the Module 2 ident, SHALL then start the
music again from the top. It shows card 0's picture and the caption
*ABSOLUTE CONNECTIONS · Contractor Orientation · Module 2 of 14: What's the
Drill*, whole rather than typed, above the prompt **PRESS ANY KEY TO CONTINUE
ORIENTATION**. No key SHALL answer it. On the high note that ends the tune's
first phrase, someone in the dark SHALL wake with a snort, once. A couple of
seconds after the snort is over, they punch the screen: the music MUST stop at
once, a blow SHALL sound, and the whole
screen, caption and prompt included, SHALL collapse to black. The sequence
ends there. Until beat 1 exists, nothing SHALL follow the black and no input
SHALL move it on.

#### Scenario: Sequence ends
- **WHEN** card 10 plays through to card 11, and the player presses a key
  during card 11
- **THEN** the snore ends before the music starts again, the key changes
  nothing, the snort follows the tune's first phrase, and after it the punch
  stops the music and leaves the screen black and silent indefinitely

#### Scenario: Skipped to the end
- **WHEN** the player skips during any card before card 11
- **THEN** the music stops and starts again from the top on card 11, with no
  snore, and the snort and the punch follow it as they would have

### Requirement: Reduced motion
When the player prefers reduced motion, captions SHALL appear whole instead of
typed, nothing in the card art SHALL move, the prompt SHALL NOT blink, and the
glitch MUST NOT flash. The punch MUST NOT collapse or flare the screen: it
SHALL cut to black at once. A card's pictures SHALL still change on cue, so the
story is the same. The music still drops out, so the clue survives, and the
punch is still heard.

#### Scenario: Reduced motion on card 6
- **WHEN** reduced motion is preferred and card 6 reaches the Ganymede line
- **THEN** the image neither moves nor flashes, the caption is shown whole, and
  the music drops out

#### Scenario: Reduced motion at the punch
- **WHEN** reduced motion is preferred and Joe punches the screen on card 11
- **THEN** the screen is black at once, without collapsing or flaring, and the
  music stops with the blow
