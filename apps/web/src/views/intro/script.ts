/**
 * The Chapter 1 intro, card by card, as `docs/story/chapter-01-intro.md` scripts it.
 *
 * The captions are canon: they are copied word for word from the script's table, and a change
 * to one is a change to the script in the same commit. What this file adds is only what the
 * table cannot say — where a caption pauses, which words are set in italics, and where the
 * Ganymede line ends.
 */

/**
 * A run of caption text. Italic runs are the ones the script sets in `*…*`. A `\n` is a line
 * break, the script's `<br>`: the idents set their title on two lines.
 */
export interface CaptionSegment {
  readonly text: string;
  readonly emphasis?: boolean;
  /** A beat of silence once this run is typed, before the next one starts. */
  readonly pauseAfterMs?: number;
}

export interface IntroCard {
  /** What the picture shows — the script's Image column, and the picture's text alternative. */
  readonly image: string;
  readonly caption: readonly CaptionSegment[];
  /**
   * The character count at which the Ganymede glitch fires, counted across the whole caption.
   * Set on card 6 only: the one place the video visibly hides something.
   */
  readonly glitchAtChar?: number;
}

const GANYMEDE_LINE = "Ganymede was found unsuitable.";

/** The corporate ident's picture, which opens the video and — for Module 2 — closes it. */
const IDENT_IMAGE =
  "Black. Twinkling pixel stars. The Absolute Connections logo turns: a four-colour square one way, a white dial inside it the other.";

const CARD_6_LEAD = "Callisto, 2492. Europa, 2502. Io, 2514. ";

export const INTRO_CARDS: readonly IntroCard[] = [
  {
    image: IDENT_IMAGE,
    caption: [
      { text: "ABSOLUTE CONNECTIONS · Contractor Orientation\nModule 1 of 14: " },
      { text: "Where We Come From", emphasis: true },
    ],
  },
  {
    image:
      "The Sun, filling more of the frame than it should; the palette bleeds toward white. Out of the white, a child on bare ground, arm across their eyes, as the light keeps rising.",
    caption: [
      {
        text: "2138. The Sun began to brighten. Faster than any model predicted. Faster than anyone was ready for.",
      },
    ],
  },
  {
    image:
      "City silhouettes burning, crowds, torn flags, under a white sky. A flash; closer, both crowds stream in and pile into one fighting mass, their flags mixed above it.",
    caption: [
      {
        text: "Nations argued. Nations fought. For more than a century, humanity faced two enemies: the Sun above, and itself.",
      },
    ],
  },
  {
    image:
      "Towers rise out of the ruins, too tall for the frame, and their shadows swallow the people. From below: corporate towers in a ring under one sky, their lights coming on together. In the sky between them, the Absolute Connections square appears, turning against them.",
    caption: [
      {
        text: "2251. The corporations did what governments could not. They united the world. Order returned. ",
        pauseAfterMs: 600,
      },
      { text: "One world. Many partners.", emphasis: true },
    ],
  },
  {
    image: "A dark server hall; one warm light at its centre.",
    caption: [
      {
        text: "2256. Helios — the mind every corporation built together — delivered the Plan. Humanity would leave. Not all at once. Station by station.",
      },
    ],
  },
  {
    image: "Mars and Deimos; a dotted line of stations reaching into the dark.",
    caption: [
      {
        text: "Externa, 2312. Steady Foot, 2389. Steady Hand, 2427. A corridor of light across the dark.",
      },
    ],
  },
  {
    image: "Jupiter. Its moons light up one by one. One stays dark.",
    caption: [{ text: CARD_6_LEAD, pauseAfterMs: 400 }, { text: GANYMEDE_LINE }],
    glitchAtChar: CARD_6_LEAD.length + GANYMEDE_LINE.length,
  },
  {
    image: "A sky full of ships leaving a white Earth.",
    caption: [
      {
        text: "2547. The Diaspora began, and the calendar began again with it. Year Zero.",
      },
    ],
  },
  {
    image: "A single small figure on a cracked Earth, looking up.",
    caption: [
      { text: "Some chose to stay. ", pauseAfterMs: 800 },
      { text: "Absolute Connections respects every choice." },
    ],
  },
  {
    image: "The Martian surface. A dome. One lit window.",
    caption: [
      {
        text: "158 years later, the Corridor carries us all — and it is carried by contractors like you. Your assignment awaits at Externa Prima.",
      },
    ],
  },
  {
    // No caption: the snore is the whole card.
    image: "Black. The music stops. A snore.",
    caption: [],
  },
  {
    // The next module's ident, mirroring card 0: one module down, thirteen to go. It waits for a
    // key the way the first one did, and in beat 1 Joe presses one by slapping the screen off.
    image: IDENT_IMAGE,
    caption: [
      { text: "ABSOLUTE CONNECTIONS · Contractor Orientation\nModule 2 of 14: " },
      { text: "What's the Drill", emphasis: true },
    ],
  },
];

/** The ident: shown at the gate and held briefly once the player opts in. */
export const IDENT_CARD = 0;

/** The last card — the next module's ident — and the one the sequence ends, or is skipped, onto. */
export const END_CARD = INTRO_CARDS.length - 1;

/** A caption as one string, for the live region and for tests. */
export function captionText(card: IntroCard): string {
  return card.caption.map((segment) => segment.text).join("");
}
