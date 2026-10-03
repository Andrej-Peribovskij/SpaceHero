/**
 * The note table's notation: one line of music as text, a token per step.
 *
 * - `D4`, `A#3`: a note starts on this step — a name, an optional sharp, an octave. Sharps only,
 *   no flats: one spelling per pitch, so the table never says the same thing two ways.
 * - `-`: the note before goes on sounding through this step.
 * - `.`: silence.
 *
 * Like the card art's character grids, the music stays text so a diff of the tune shows which
 * notes changed.
 */

export interface Note {
  /** The step the note starts on, counted from the start of the line. */
  readonly step: number;
  /** How many steps it sounds for, its own included. */
  readonly steps: number;
  readonly frequency: number;
}

const SEMITONES: Readonly<Record<string, number>> = {
  C: 0,
  "C#": 1,
  D: 2,
  "D#": 3,
  E: 4,
  F: 5,
  "F#": 6,
  G: 7,
  "G#": 8,
  A: 9,
  "A#": 10,
  B: 11,
};

const NOTE = /^([A-G]#?)(\d)$/;

/** A note name's pitch in hertz, in equal temperament from A4 = 440 Hz. */
export function frequencyOf(name: string): number {
  const match = NOTE.exec(name);
  if (!match) throw new Error(`Not a note: "${name}"`);

  // MIDI numbering: C4, middle C, is 60, and A4 is 69.
  const midi = 12 * (Number(match[2]) + 1) + SEMITONES[match[1]!]!;
  return 440 * 2 ** ((midi - 69) / 12);
}

/** A line's tokens: one per step. */
export function stepsOf(line: string): readonly string[] {
  return line.split(/\s+/).filter(Boolean);
}

/** The notes a line plays, in order. Throws on a token it cannot read, or a hold with nothing to hold. */
export function parseLine(line: string): readonly Note[] {
  const notes: { step: number; steps: number; frequency: number }[] = [];
  let sounding = false;

  stepsOf(line).forEach((token, step) => {
    if (token === ".") {
      sounding = false;
    } else if (token === "-") {
      if (!sounding) throw new Error(`Step ${step} holds a note, but none is sounding`);
      notes[notes.length - 1]!.steps += 1;
    } else {
      notes.push({ step, steps: 1, frequency: frequencyOf(token) });
      sounding = true;
    }
  });

  return notes;
}
