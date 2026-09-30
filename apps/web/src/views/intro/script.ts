/**
 * The Chapter 1 intro, card by card, as `docs/story/chapter-01-intro.md` scripts it.
 *
 * The captions are canon: they are copied word for word from the script's table, and a change
 * to one is a change to the script in the same commit. What this file adds is only what the
 * table cannot say — where a caption pauses, which words are set in italics, and where the
 * Ganymede line ends.
 */

/** A run of caption text. Italic runs are the ones the script sets in `*…*`. */
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

const CARD_6_LEAD = "Callisto, 2492. Europa, 2502. Io, 2514. ";

export const INTRO_CARDS: readonly IntroCard[] = [
  {
    image: "Black. Pixel stars. The Absolute Connections logo rotates in, four colours.",
    caption: [
      { text: "ABSOLUTE CONNECTIONS · Contractor Orientation · Module 1 of 14: " },
      { text: "Where We Come From", emphasis: true },
    ],
  },
  {
    image: "The Sun, filling more of the frame than it should; the palette bleeds toward white.",
    caption: [
      {
        text: "2138. The Sun began to brighten. Faster than any model predicted. Faster than anyone was ready for.",
      },
    ],
  },
  {
    image: "City silhouettes burning, crowds, torn flags, under a white sky.",
    caption: [
      {
        text: "Nations argued. Nations fought. For more than a century, humanity faced two enemies: the Sun above, and itself.",
      },
    ],
  },
  {
    image: "Corporate towers in a ring under one sky. A pixel handshake.",
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
    image: "Black. The music stops. A snore.",
    // The countdown is typed like any caption, with a second's gap between the numbers. It
    // stops on "4…" because beat 1 cuts it off there: Joe slaps the screen off.
    caption: [
      { text: "Module 2 of 14 will begin in 5… ", emphasis: true, pauseAfterMs: 1000 },
      { text: "4…", emphasis: true },
    ],
  },
];

/** The ident: shown at the gate and held briefly once the player opts in. */
export const IDENT_CARD = 0;

/** The last card, and the one the sequence ends — or is skipped — onto. */
export const END_CARD = INTRO_CARDS.length - 1;

/** A caption as one string, for the live region and for tests. */
export function captionText(card: IntroCard): string {
  return card.caption.map((segment) => segment.text).join("");
}
