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
  /**
   * A beat of silence once this run is typed, before the next one starts. An empty run with a
   * pause holds the whole caption back: the picture has something to show first.
   */
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
      "Towers rise out of the ruins, too tall for the frame, and their shadows swallow the people. From below: corporate towers in a ring under one sky, their lights coming on together. In the sky between them, the Absolute Connections square appears, turning against them. Then the dark closes in from the edges, onto the square.",
    caption: [
      {
        text: "2251. The corporations did what governments could not. They united the world. Order returned. ",
        pauseAfterMs: 600,
      },
      { text: "One world. Many partners.", emphasis: true },
    ],
  },
  {
    image: "Black. A spark at the centre of a dark server hall grows into a small sun hung in cables; its warm light spreads along the racks, and their lights come on in every company's colour. Round itself it draws the Plan: three orbits, and a dotted line of stations reaching out, one by one, into the dark.",
    caption: [
      {
        text: "2256. Helios — the mind every corporation built together — delivered the Plan. Humanity would leave. Not all at once. Station by station.",
      },
    ],
  },
  {
    image:
      "The Plan, zoomed into along Mars's orbit until Mars and Deimos fill the frame; Externa's lights come on across Deimos. Close: Externa Prima on Deimos's horizon, Mars dark above it, its cities lit. Jumps along the Corridor: to Steady Foot among Mars's trojans, then through the belt to Steady Hand, Jupiter ahead. Pulled out: the Sun, Mars, the belt, Jupiter, and between them a dotted line of stations lighting up, a corridor of light.",
    caption: [
      // The caption waits while the picture zooms from card 4's Plan onto Mars and Deimos, and
      // after each place while the picture closes in on it or jumps on to the next.
      { text: "", pauseAfterMs: 1700 },
      { text: "Externa, 2312. ", pauseAfterMs: 3200 },
      { text: "Steady Foot, 2389. ", pauseAfterMs: 1300 },
      { text: "Steady Hand, 2427. ", pauseAfterMs: 1300 },
      { text: "A corridor of light across the dark." },
    ],
  },
  {
    image:
      "Jupiter's dot on the Corridor, dived into, down into the Great Red Spot until the storm fills the frame; then back out to Jupiter, a giant behind four dark moons. The moons light up one by one as the line of light reaches them: Callisto, Europa, Io. One stays dark: Ganymede.",
    caption: [
      // The caption waits while the picture dives from card 5's map into Jupiter's spot and back out.
      { text: "", pauseAfterMs: 2400 },
      { text: CARD_6_LEAD, pauseAfterMs: 400 },
      { text: GANYMEDE_LINE },
    ],
    glitchAtChar: CARD_6_LEAD.length + GANYMEDE_LINE.length,
  },
  {
    image:
      "White; out of it, a launch field on a bleached white Earth under a white sky, the great ships dark on their pads. They light one after another, and the sky fills with ships rising on columns of smoke. The camera climbs with them into the black. From orbit: the white Earth, its ships gathering into rivers of light, a few ending at Mars and Deimos, most streaming on past Mars, bound for the stations beyond. Then white again.",
    caption: [
      // The caption waits while the launch field comes out of the white, while the ships rise, and
      // while the camera climbs with them into orbit.
      { text: "", pauseAfterMs: 800 },
      { text: "2547. The Diaspora began, ", pauseAfterMs: 1700 },
      { text: "and the calendar began again with it. ", pauseAfterMs: 1300 },
      { text: "Year Zero." },
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
