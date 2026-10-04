# Recorded sounds

The intro's music is computed (`../synth.ts`); these two sounds are not. A
snore made from noise and arithmetic sounded like a hiss through two rounds of
tuning, so card 10's snore and card 11's waking snort are recordings.

| File        | Plays                                              | Source file        |
|-------------|----------------------------------------------------|--------------------|
| `snore.wav` | Card 10, a beat after the music stops: Joe asleep  | `Sleep Snorf.wav`  |
| `wake.wav`  | Card 11, a beat after the music starts: Joe wakes  | `Snorf 1.wav`      |

## Source and licence

- **Pack:** "Action sounds" by pauliuw,
  <https://opengameart.org/content/action-sounds>, file `actions.7z`
  (SHA-256 `f8a160c11038a7f772eac1ecab7eda3f1b6baa4c072fef3732fbc4cfe59397cc`),
  downloaded 2026-10-04.
- **Licence:** CC0-1.0, as the pack's page states
  (<http://creativecommons.org/publicdomain/zero/1.0/>). On the allow-list in
  `docs/dependencies.md`; no attribution is required, and this note keeps it
  anyway.
- **Originals' SHA-256:**
  - `Sleep Snorf.wav` `a3bd3b9be36205ef996001c7162a51f589889b3d0aa3b4d3ca9beaefa9a978ac`
  - `Snorf 1.wav` `887c0fdc6d34376049f76f329d32b70f141712ef764f11a1f6724c6a5d82eb2c`

## What was done to them

Each original is 44.1 kHz 16-bit stereo. Each was mixed down to mono, cleared
of any DC offset, low-passed and halved to 22,050 Hz (the synth's rate,
`SAMPLE_RATE`), faded in and out over 10 ms so it starts and ends on silence,
and levelled against the music: the snore to a peak of 0.75, where its
loudest stretch matches the music's; the snort to 0.85, to be heard over the
music it follows. Nothing was cut; both are as long as the originals.

`sounds.ts` reads them: mono 16-bit PCM at `SAMPLE_RATE` only, the format
written here.
