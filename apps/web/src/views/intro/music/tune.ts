import type { Tune } from "./synth";

/**
 * The orientation's loop: gloomy, mysterious, and corporate enough to play under a logo.
 *
 * D minor over a lament bass, the line that walks down a step at a time — D, C, B♭, A — and has
 * meant grief since the 1600s. Bar 6 turns to E♭, a semitone above home and outside the key,
 * which is where the mystery comes from: something is not quite right, and the tune does not say
 * what. Bars 7 and 8 sit on A, the chord that wants to go home, and the loop takes it home.
 *
 * Eighth notes, eight to a bar. One line per bar, the bars of each voice lined up under each
 * other: read down a column to hear a moment.
 */
export const ORIENTATION_TUNE: Tune = {
  bpm: 72,
  stepsPerBeat: 2,
  voices: [
    {
      name: "lead",
      wave: { kind: "pulse", duty: 0.25 },
      volume: 0.13,
      envelope: { attackMs: 15, decayMs: 250, sustain: 0.6, releaseMs: 180 },
      bars: [
        ". . . . A4 - D5 -", // Dm
        "E5 - - - - - . .", // C
        ". . . . F5 - D5 -", // B♭
        "C#5 - - - - - . .", // A
        ". . . . A#4 - D5 -", // Gm
        "G5 - - - F5 - D#5 -", // E♭
        "E5 - - - - - - -", // A
        ". . . . . . . .", // A
      ],
    },
    {
      name: "arpeggio",
      wave: { kind: "pulse", duty: 0.125 },
      volume: 0.07,
      envelope: { attackMs: 2, decayMs: 120, sustain: 0.2, releaseMs: 60 },
      bars: [
        "D4 F4 A4 F4 D4 F4 A4 F4",
        "C4 E4 G4 E4 C4 E4 G4 E4",
        "A#3 D4 F4 D4 A#3 D4 F4 D4",
        "A3 C#4 E4 C#4 A3 C#4 E4 C#4",
        "G3 A#3 D4 A#3 G3 A#3 D4 A#3",
        "D#4 G4 A#4 G4 D#4 G4 A#4 G4",
        "A3 C#4 E4 C#4 A3 C#4 E4 C#4",
        // A suspended fourth, D for C♯, resolving halfway through the bar.
        "A3 D4 E4 D4 A3 C#4 E4 C#4",
      ],
    },
    {
      name: "bass",
      wave: { kind: "triangle" },
      volume: 0.3,
      envelope: { attackMs: 5, decayMs: 300, sustain: 0.7, releaseMs: 80 },
      bars: [
        "D2 - - - - - D2 -",
        "C2 - - - - - C2 -",
        "A#1 - - - - - A#1 -",
        "A1 - - - - - A1 -",
        "G1 - - - - - G1 -",
        "D#2 - - - - - D#2 -",
        "A1 - - - - - A1 -",
        "A1 - - - A2 - A1 -",
      ],
    },
  ],
};
