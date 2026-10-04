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
   * How long the card stays once its caption is typed, if not the usual hold: a card whose sound
   * needs more time than its caption gives it.
   */
  readonly holdMs?: number;
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
      "White; out of it, a launch field on a bleached white Earth under a white sky, the great ships dark on their pads. They light one after another, and the sky fills with ships rising on columns of smoke. The camera climbs with them into the black. From orbit: the white Earth, its ships gathering into rivers of light, a few ending at Mars and Deimos, most streaming on past Mars, bound for the stations beyond. Then the camera dives into the Earth, down to its cracked ground.",
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
    image:
      "The dive goes on into the glare, all white; out of it, a cliff of bleached rock towering out of the frame, a white sky and a swollen Sun beside it, and in the cliff a few caverns where the ones who stayed live, the rock their shelter from the light: dark mouths, ledges, awnings, fires, small figures in the shade; on the cracked plain, a ship that never left. The camera closes in on one cave, and from inside it: a single small figure, cloaked, alone at the edge of the shade, a hand to the brow, looking up at the white sky where a last ship climbs away.",
    caption: [
      // The caption waits while the picture falls on from card 7 into the glare and out of it, and
      // while it closes in on the one who looks up.
      { text: "", pauseAfterMs: 1900 },
      { text: "Some chose to stay. ", pauseAfterMs: 1900 },
      { text: "Absolute Connections respects every choice." },
    ],
  },
  {
    image:
      "Card 8's light goes out. Out of the dark, stars, and the camera tilts down to the Martian surface at dusk, the sunset blue, Deimos high up with Externa's lights, shuttles climbing to it from a far port. On the plain, a dome half sunk in the dunes, a small ship by it, a ring of dark windows, and one lit. Close: through that window, a dark room, its walls lit only by the flicker of this video, playing on a screen out of sight. Above the dome, Externa's beacon blinks teal.",
    caption: [
      // The caption waits while card 8's glare goes out and the camera tilts down from Mars's sky,
      // and again while it closes in on the window.
      { text: "", pauseAfterMs: 1900 },
      { text: "158 years later, ", pauseAfterMs: 700 },
      { text: "the Corridor carries us all — and it is carried by contractors like you. ", pauseAfterMs: 900 },
      { text: "Your assignment awaits at Externa Prima." },
    ],
  },
  {
    // No caption: the snore is the whole card. It holds a second longer than a caption's hold, so
    // the snore ends in silence before Module 2 starts the music again.
    image: "Black. The music stops. A snore. A beat of silence.",
    caption: [],
    holdMs: 4000,
  },
  {
    // The next module's ident, mirroring card 0: one module down, thirteen to go. It waits for a
    // key the way the first one did, but with its music playing, and that music wakes Joe with a
    // snort. In beat 1 he presses the key, by slapping the screen off.
    image: `${IDENT_IMAGE} The music starts again, and in the dark someone wakes with a snort.`,
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

/** Card 10, black and captionless: the music stops on it, and someone snores. */
export const SNORE_CARD = END_CARD - 1;

/** A caption as one string, for the live region and for tests. */
export function captionText(card: IntroCard): string {
  return card.caption.map((segment) => segment.text).join("");
}
