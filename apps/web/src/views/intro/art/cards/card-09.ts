import { FRAME_WIDTH, parsePicture, type Picture } from "../grid";
import { VISIBLE, clamp01, cueOn, ease, frameOf, lastFrameOf, noise, offscreen, paintPicture, rungOf, smoothNoise } from "../paint";
import { STEPS_TO_BLACK, darker, type CycleChar, type PaletteChar } from "../palette";
import { FRAME_MS, ditherAt, type Canvas, type CardArt, type Scene } from "../render";
import { CARD_08_ART } from "./card-08";

/**
 * Card 9: Mars, 158 A.D. — where the story begins.
 *
 * Script: "The Martian surface. A dome. One lit window." It opens on card 8's last frame, the one
 * who stayed under the white sky, and the light goes out of it a step at a time: 158 years pass in
 * the dark. Out of the dark, stars, and the camera tilts down from them to the Martian horizon at
 * dusk — the sunset blue, as it is on Mars, with a bright white star low in it that was home.
 * Deimos high up, Externa's lights on it; Phobos crossing; shuttles climbing from a far port to
 * Deimos, one leaving on "the Corridor". On the plain, a dome half sunk in the dunes, a small ship
 * parked by it, a ring of dark windows, and one lit.
 *
 * On "contractors like you" the camera closes in on that window, and dissolves to it close: a dark
 * room, its walls lit only by this video, playing on a screen out of sight — its light flickering
 * and changing colour at every cut. Joe is asleep in there; the video started on its own, and the
 * picture does not show him. Above the dome, Deimos, its beacon blinking Absolute Connections teal
 * as the caption names Externa Prima — the card's one corporate touch.
 *
 * The scenery is code (design.md §11); the numbers worth tweaking are named below. The ship is
 * pixel data, a silhouette, and can be redrawn a pixel at a time.
 */

/** When the first letter of `words` appears, on the card's clock: the beats follow the caption. */
const cue = cueOn(9);

// ── timings, on the card's clock ──
/** The light goes out of card 8's picture, a step at a time, from just after the cut. */
const DARK_STEP_MS = 110;
const DARK_FROM_MS = FRAME_MS;
/** Under the black, Mars's sky cuts in, high up; it comes out of the black a step at a time. */
export const NIGHT_MS = DARK_FROM_MS + STEPS_TO_BLACK * DARK_STEP_MS + 150;
const EMERGE_STEP_MS = 90;
/** The tilt down from the stars to the horizon. The caption waits for it (script.ts). */
const TILT_MS = 2200;
export const LANDED_MS = NIGHT_MS + TILT_MS;
/** "the Corridor": a shuttle leaves the far port for Deimos, and one every period after. */
export const CORRIDOR_MS = cue("the Corridor");
const LAUNCH_PERIOD_MS = 1700;
const TRIP_MS = 4200;
/** "contractors like you": the camera closes in on the lit window, and dissolves to it close. */
export const CONTRACTORS_MS = cue("contractors like you");
const PUSH_MS = 1300;
export const CLOSE_MS = CONTRACTORS_MS + PUSH_MS;
/** How far into the push-in the close view shows through, a dither at a time. */
const DISSOLVE_FROM = 0.5;
/** "Externa Prima": Deimos's beacon blinks Absolute Connections teal. */
export const EXTERNA_MS = cue("Externa Prima");

// ── the wide shot ──
export const HORIZON = 118;
/** How far up the sky the tilt starts: this many pixels above the landed frame. */
const TILT = 150;
/** Where the Sun went down: the blue glow on the horizon, Mars's sunset. */
const GLOW_X = 70;
/** Home: a bright white star, low in the glow. */
export const EARTH = { x: 104, y: 86 } as const;
/** Deimos, high up, with Externa on it; the port the shuttles leave from, on the horizon. */
export const DEIMOS = { x: 146, y: 28 } as const;
const PORT = { x: 334, y: HORIZON - 2 } as const;
/** The dome: its middle, the foot of its wall, its half-width, the wall's height and the glass's. */
export const DOME = { x: 246, base: 146, half: 36, wall: 7, glass: 28 } as const;
/**
 * The ring of windows round its wall, and the one that is lit: the first, near the wall's western
 * end, where the close shot finds it.
 */
const WINDOWS = 8;
const WINDOW_GAP = 8;
const LIT_WINDOW = 0;
export const LIT_X = DOME.x - ((WINDOWS - 1) * WINDOW_GAP) / 2 + LIT_WINDOW * WINDOW_GAP;
const WINDOW_Y = DOME.base - 4;

// ═══ the light goes out ═══

const card8Frame = () => lastFrameOf(8, CARD_08_ART);

/** Card 8's last frame, a shade darker every step, until it is gone. */
function paintDarkening(canvas: Canvas, t: number): void {
  const frame = card8Frame();
  const steps = Math.max(0, Math.floor((t - DARK_FROM_MS) / DARK_STEP_MS) + 1);
  for (let y = 0; y < VISIBLE; y += 1) {
    for (let x = 0; x < FRAME_WIDTH; x += 1) canvas.set(x, y, darker(frame[y * FRAME_WIDTH + x]!, steps));
  }
}

// ═══ the sky ═══

/**
 * The dusk sky at a point, `horizon` being where the ground meets it: black and starry overhead,
 * dusk violet along the horizon, and round where the Sun went down, Mars's blue glow.
 */
function skyAt(x: number, y: number, horizon: number, glowX: number): PaletteChar {
  const above = horizon - y;
  const glow = clamp01(1 - Math.hypot((x - glowX) / 190, above / 44)) ** 1.6;
  const dusk = clamp01(1 - above / 110) ** 1.5 * 0.42;
  return rungOf([".", "n", "b", "s", "p"], Math.max(glow, dusk), x, y);
}

const TWINKLE: readonly CycleChar[] = ["1", "2", "3", "4", "5", "6"];

/** The stars of the whole tilt, from high above the frame down to the dusk. */
const STARS = Array.from({ length: 260 }, (_, index) => ({
  x: Math.floor(noise(index, 1) * FRAME_WIDTH),
  y: Math.floor(-TILT + noise(index, 2) * (HORIZON + TILT - 20)),
  twinkle: TWINKLE[index % TWINKLE.length]!,
  bright: noise(index, 3) < 0.12,
}));

/** The sky, `rise` pixels of it above the frame's top, with its stars where the dusk lets them show. */
function paintSky(canvas: Canvas, rise: number, horizon: number, glowX: number): void {
  for (let y = 0; y < VISIBLE; y += 1) {
    if (y - rise >= horizon) break;
    for (let x = 0; x < FRAME_WIDTH; x += 1) canvas.set(x, y, skyAt(x, y - rise, horizon, glowX));
  }
  for (const star of STARS) {
    const y = star.y + rise;
    if (y < 0 || y >= VISIBLE || star.y >= horizon) continue;
    if (canvas.get(star.x, y) !== "." && !(star.bright && canvas.get(star.x, y) === "n")) continue;
    canvas.set(star.x, y, star.bright ? "p" : star.twinkle);
  }
}

/** Home, from here: a steady white star in the glow. Planets do not twinkle. */
function paintEarth(canvas: Canvas, rise: number): void {
  canvas.set(EARTH.x, EARTH.y + rise, "w");
}

/** Deimos: a speck of lit rock, lit from below, where the Sun went; Externa's lights on its dark side. */
const DEIMOS_ROCK: Picture = parsePicture(
  "card 9 Deimos",
  `
  _gnn_
  pgbnn
  ppgbn
  _pg__
`,
);

/** Externa's beacon: red, blinking — until the caption names Externa Prima, and then it is ours. */
function paintDeimos(canvas: Canvas, t: number, x: number, y: number): void {
  paintPicture(canvas, DEIMOS_ROCK, x - 2, y - 2);
  const flick = frameOf(t);
  canvas.set(x + 1, y - 1, (flick >> 2) % 3 === 0 ? "Y" : "a");
  canvas.set(x + 2, y, (flick >> 2) % 4 === 1 ? "p" : "a");
  canvas.set(x, y - 2, "a");
  if (Math.floor(t / 450) % 2 === 0) canvas.set(x + 1, y - 3, t >= EXTERNA_MS ? "t" : "r");
}

/** Phobos: a lumpy dark moon, crossing the sky west to east, lit on its western side. */
const PHOBOS: Picture = parsePicture(
  "card 9 Phobos",
  `
  __gbn__
  _pgbnn_
  ppgbnnn
  _pgbnn_
  __gb___
`,
);

function paintPhobos(canvas: Canvas, t: number, rise: number): void {
  paintPicture(canvas, PHOBOS, Math.round(262 + (t / 1000) * 1.6), 50 + rise);
}

/** A shuttle's place on its way from the port to Deimos, from 0 to 1: straight up, then over. */
function shuttleAt(progress: number): readonly [number, number] {
  const x = PORT.x + (DEIMOS.x - PORT.x) * progress ** 1.6;
  const y = PORT.y + (DEIMOS.y - PORT.y) * (1 - (1 - progress) ** 2);
  return [x, y];
}

/** The launches, on "the Corridor" and every period either side of it. */
const LAUNCHES = Array.from({ length: 10 }, (_, index) => CORRIDOR_MS + (index - 4) * LAUNCH_PERIOD_MS);

/** Shuttles climbing from the port to Deimos, each with its dotted trail, the one on cue with a flare. */
function paintShuttles(canvas: Canvas, t: number, rise: number): void {
  for (const launch of LAUNCHES) {
    const progress = (t - launch) / TRIP_MS;
    if (progress < 0 || progress > 1) continue;
    for (let step = 1; step < 40; step += 1) {
      const back = progress - step * 0.007;
      if (back < 0) break;
      if (noise(step, Math.floor(launch)) < 0.3 + step / 60) continue;
      const [x, y] = shuttleAt(back);
      canvas.set(x, y + rise, step < 8 ? "s" : "b");
    }
    const [x, y] = shuttleAt(progress);
    canvas.set(x, y + rise, progress < 0.9 ? "w" : "p");
    if (progress < 0.85) canvas.set(x, y + rise + 1, frameOf(t) % 2 === 0 ? "Y" : "o");
    // The flare on the horizon as it lifts off.
    if (t - launch < 300) {
      for (let u = -2; u <= 2; u += 1) canvas.set(PORT.x + u, PORT.y + rise, Math.abs(u) < 2 ? "Y" : "o");
      canvas.set(PORT.x, PORT.y - 1 + rise, "y");
    }
  }
}

// ═══ the ground ═══

/** Mesas along the horizon: flat-topped, dark against the dusk. */
function paintMesas(canvas: Canvas, rise: number, horizon: number): void {
  for (let x = 0; x < FRAME_WIDTH; x += 1) {
    const raw = (smoothNoise(x / 30, 3) - 0.45) * 40;
    const top = Math.min(raw, 6 + smoothNoise(x / 70, 9) * 7);
    for (let h = 0; h < top; h += 1) canvas.set(x, horizon - 1 - h + rise, h > top - 2 && x > GLOW_X + 40 ? "m" : "d");
  }
}

/** The plain: dunes in rows, the faces towards the glow catching the last of it, the rest in the dark. */
function paintDunes(canvas: Canvas, rise: number, horizon: number): void {
  for (let y = Math.max(0, horizon + rise); y < VISIBLE; y += 1) {
    const depth = y - rise - horizon + 1;
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      const u = ((x - FRAME_WIDTH / 2) * 1.2) / depth;
      // Each dune: a long face rising towards the glow, lit, up to its crest; behind it, shadow.
      const phase = u * 0.22 + smoothNoise(u * 0.06 + 40, 30 / depth) * 0.9 + 20 / depth;
      const along = phase - Math.floor(phase);
      const face = along < 0.7 ? 0.2 + along * 0.22 : 0.12;
      const far = clamp01(1 - depth / 14);
      const light = face + far * 0.2 - depth / 300;
      canvas.set(x, y, rungOf([".", "d", "m", "r"], light, x, y));
    }
  }
}

/** The port the shuttles leave from: low and far, a few lights and a blinking mast. */
function paintPort(canvas: Canvas, t: number, rise: number): void {
  for (let u = -9; u <= 9; u += 1) {
    const h = Math.abs(u) < 3 ? 3 : noise(u, 4) < 0.5 ? 2 : 1;
    for (let v = 0; v < h; v += 1) canvas.set(PORT.x + u, PORT.y + 1 - v + rise, "n");
    if (noise(u, 5) < 0.3) canvas.set(PORT.x + u, PORT.y + 1 + rise, "a");
  }
  for (let v = 0; v < 7; v += 1) canvas.set(PORT.x + 6, PORT.y - v + rise, "n");
  if (Math.floor(t / 600) % 2 === 0) canvas.set(PORT.x + 6, PORT.y - 7 + rise, "r");
}

/** A small, fast ship parked by the dome on its legs, nose to the west: a silhouette. */
const SHIP: Picture = parsePicture(
  "card 9 ship",
  `
  ______________________sn___
  _____________________snn___
  __________ssssssssssnnnn___
  _____sssnnbbnnnnnnnnnnnnn__
  sssnnnnnnnnnnnnnnnnnnnnnnnn
  __nnnnnnnnnnnnnnnnnnnnnnnn_
  ______n____________n_______
  _____nnn__________nnn______
`,
);
const SHIP_AT = { x: DOME.x - DOME.half - 36, y: DOME.base - SHIP.height + 1 } as const;

/**
 * The dome, wide: dark glass reflecting the dusk, its panes' frames, a berm of dunes against its
 * wall, a ring of dark windows and the lit one, an aerial with its light, a tube out to the ship.
 */
function paintDome(canvas: Canvas, t: number): void {
  const wallTop = DOME.base - DOME.wall;
  for (let y = wallTop - DOME.glass; y < wallTop; y += 1) {
    const v = (wallTop - y) / DOME.glass;
    const half = DOME.half * Math.sqrt(1 - v * v);
    for (let x = Math.ceil(DOME.x - half); x <= DOME.x + half; x += 1) {
      const nx = (x + 0.5 - DOME.x) / half;
      const angle = Math.asin(Math.max(-1, Math.min(1, nx)));
      // The glass catches the glow on its western side, and a highlight high on that side.
      let light = 0.32 - nx * 0.22 + (1 - v) * 0.06;
      if (nx < -0.45 && nx > -0.7 && v > 0.35 && v < 0.75) light += 0.3;
      const meridian = Math.abs(((angle / (Math.PI / 9)) % 1 + 1) % 1 - 0.5) > 0.42;
      const ring = Math.abs(((v * 4) % 1) - 0.5) > 0.4;
      if (Math.abs(nx) > 0.93 || v > 0.95) light += 0.15;
      if (meridian || ring) light -= 0.18;
      canvas.set(x, y, rungOf([".", "n", "b", "s", "p"], light, x, y));
    }
  }
  // The wall: plates, dark, its rim lit.
  for (let y = wallTop; y <= DOME.base; y += 1) {
    for (let x = DOME.x - DOME.half - 1; x <= DOME.x + DOME.half + 1; x += 1) {
      canvas.set(x, y, y === wallTop ? "g" : (x - DOME.x) % 6 === 0 ? "n" : "b");
    }
  }
  // The windows: dark, but one.
  for (let index = 0; index < WINDOWS; index += 1) {
    const x = DOME.x - ((WINDOWS - 1) * WINDOW_GAP) / 2 + index * WINDOW_GAP;
    for (let u = -1; u <= 1; u += 1) {
      for (let v = 0; v < 2; v += 1) {
        const lit = index === LIT_WINDOW;
        canvas.set(x + u, WINDOW_Y + v, lit ? rungOf(videoLight(t).ladder, videoLight(t).level + 0.25, x + u, WINDOW_Y + v) : ".");
      }
    }
  }
  // The berm: dunes heaped against the foot of the wall.
  for (let x = DOME.x - DOME.half - 8; x <= DOME.x + DOME.half + 8; x += 1) {
    const height = 2 + Math.round(Math.abs(Math.sin(x / 7)) * 2 + noise(x, 6) * 1.2);
    for (let v = 0; v < height; v += 1) canvas.set(x, DOME.base - v + 1, v === height - 1 ? "m" : "d");
  }
  // The window's light, spilling out on the dunes in front of it.
  for (let v = 2; v < 8; v += 1) {
    for (let u = Math.floor(-2 - v / 2); u <= 2 + v / 2; u += 1) {
      const fade = (1 - v / 8) * (1 - Math.abs(u) / (3 + v / 2));
      if (ditherAt(LIT_X + u, DOME.base + v) < fade * videoLight(t).level) canvas.set(LIT_X + u, DOME.base + v, videoLight(t).ladder[fade > 0.5 ? 2 : 1]!);
    }
  }
  // The aerial, and its light.
  const aerial = DOME.x + 22;
  for (let v = 0; v < 16; v += 1) canvas.set(aerial, wallTop - 18 - v, "g");
  canvas.set(aerial - 1, wallTop - 28, "g");
  canvas.set(aerial + 1, wallTop - 28, "g");
  if (Math.floor(t / 700) % 2 === 0) canvas.set(aerial, wallTop - 34, "r");
  // The tube out to the ship.
  for (let x = SHIP_AT.x + SHIP.width - 6; x < DOME.x - DOME.half; x += 1) {
    canvas.set(x, DOME.base - 3, "g");
    canvas.set(x, DOME.base - 2, "n");
    canvas.set(x, DOME.base - 1, "n");
  }
  paintPicture(canvas, SHIP, SHIP_AT.x, SHIP_AT.y);
}

// ═══ the video's light ═══

/** How long each shot of the video lasts, as its light on the walls shows it: a cut, a new colour. */
const SHOT_MS = 650;

/**
 * The light a shot throws, from the dark up to its colour: the logo's teal and steel blue, the
 * glare's white, a fire's amber, Mars's red.
 */
const SHOT_LIGHTS: readonly (readonly PaletteChar[])[] = [
  [".", "n", "b", "s"],
  [".", "n", "b", "t"],
  [".", "n", "s", "p"],
  [".", "d", "m", "a"],
  [".", "d", "m", "r"],
];

/** The video's light at a moment: the shot's colours, and how bright, flickering frame to frame. */
function videoLight(t: number): { readonly ladder: readonly PaletteChar[]; readonly level: number } {
  const shot = Math.floor(t / SHOT_MS);
  const ladder = SHOT_LIGHTS[Math.floor(noise(shot, 21) * SHOT_LIGHTS.length)]!;
  const level = 0.55 + noise(shot, 22) * 0.35 + (noise(frameOf(t), 23) - 0.5) * 0.16;
  return { ladder, level };
}

// ═══ the close shot ═══

const CLOSE_HORIZON = 118;
/** The sunset is off to the left of the close shot: only the edge of its glow is in frame. */
const CLOSE_GLOW_X = -30;
export const CLOSE_DEIMOS = { x: 44, y: 30 } as const;
/** The dome close: its middle and how wide its wall runs; the wall's top and foot at the middle. */
const WALL = { x: 320, half: 236, top: 74, foot: 166 } as const;
/** The lit window, close: its middle and half-size. */
export const WINDOW = { x: 196, y: 120, halfW: 36, halfH: 21 } as const;

/** Where the wall's top and foot run at a column: the cylinder's rims, bowed by the view. */
const wallTopAt = (x: number) => WALL.top + 12 * ((x - WALL.x) / WALL.half) ** 2;
const wallFootAt = (x: number) => WALL.foot - 6 * ((x - WALL.x) / WALL.half) ** 2;

function paintCloseDome(canvas: Canvas, t: number): void {
  const left = WALL.x - WALL.half;
  // The glass, above the wall: a great curve of dark panes, reflecting the dusk on its western side.
  for (let y = 0; y < VISIBLE; y += 1) {
    for (let x = Math.max(0, left); x < FRAME_WIDTH; x += 1) {
      const top = wallTopAt(x);
      if (y >= top) continue;
      const nx = (x - WALL.x) / WALL.half;
      const reach = Math.hypot(nx, (top - y) / 260);
      if (reach > 1) continue;
      const angle = Math.asin(Math.max(-1, Math.min(1, nx)));
      // Dark panes, the western edge catching the glow, a sheen running up across them.
      let light = 0.36 - Math.max(0, nx) * 0.1;
      if (reach > 0.975) light += 0.3;
      const sheen = Math.abs(x - 150 + (top - y) * 0.9);
      if (sheen < 12) light += 0.2 * (1 - sheen / 12);
      const meridian = Math.abs((((angle / (Math.PI / 12)) % 1) + 1) % 1 - 0.5) > 0.47;
      const ring = Math.abs((((top - y) / 26) % 1) - 0.5) > 0.46;
      if (meridian || ring) light = 0;
      canvas.set(x, y, rungOf([".", "n", "b", "s"], light, x, y));
    }
  }
  // The wall: plates and their seams, the rim lit, and round the window, its light.
  for (let x = Math.max(0, left); x < FRAME_WIDTH; x += 1) {
    const top = Math.floor(wallTopAt(x));
    const foot = Math.ceil(wallFootAt(x));
    for (let y = top; y <= foot; y += 1) {
      const seam = (x - WALL.x) % 40 === 0 || (y - top) % 30 === 0;
      // Just below the window, its sill catches the light.
      const sill = y === WINDOW.y + WINDOW.halfH + 3 && Math.abs(x - WINDOW.x) <= WINDOW.halfW + 3;
      if (y <= top + 1) canvas.set(x, y, y === top ? "g" : "b");
      else if (sill) canvas.set(x, y, videoLight(t).ladder[Math.abs(x - WINDOW.x) < WINDOW.halfW - 4 ? 2 : 1]!);
      else if (seam) canvas.set(x, y, ".");
      else canvas.set(x, y, nx2(x) < -0.85 ? "b" : "n");
    }
  }
  // The window: its frame, and the room behind it.
  for (let y = WINDOW.y - WINDOW.halfH - 2; y <= WINDOW.y + WINDOW.halfH + 2; y += 1) {
    for (let x = WINDOW.x - WINDOW.halfW - 2; x <= WINDOW.x + WINDOW.halfW + 2; x += 1) {
      const dx = Math.abs(x - WINDOW.x);
      const dy = Math.abs(y - WINDOW.y);
      const corner = dx > WINDOW.halfW - 3 && dy > WINDOW.halfH - 3 && Math.hypot(dx - WINDOW.halfW + 3, dy - WINDOW.halfH + 3) > 4;
      if (corner && Math.hypot(dx - WINDOW.halfW + 3, dy - WINDOW.halfH + 3) > 6) continue;
      const inside = dx <= WINDOW.halfW && dy <= WINDOW.halfH && !corner;
      canvas.set(x, y, inside ? roomAt(x, y, t) : y < WINDOW.y ? "g" : "b");
    }
  }
  // The aerial, standing off the wall's top into the sky, and its light.
  const aerial = 352;
  for (let y = 0; y < wallTopAt(aerial); y += 1) canvas.set(aerial, y, y % 9 === 0 ? "g" : "n");
  if (Math.floor(t / 700) % 2 === 0) canvas.set(aerial, 2, "r");
}

/** How far across the wall a column is, from -1 at its left end to 1 at its right. */
const nx2 = (x: number) => (x - WALL.x) / WALL.half;

/** Where, through the window, the room's side wall meets its back wall. */
const CORNER = WINDOW.x - 14;

/**
 * The room through the window: dark, lit only by the video playing on a screen off to the right,
 * out of sight. The side wall faces it and takes the most light; the back wall takes it raking,
 * brighter towards the screen; the ceiling stays darker than the rest.
 */
function roomAt(x: number, y: number, t: number): PaletteChar {
  if (x === CORNER) return ".";
  const { ladder, level } = videoLight(t);
  const low = (y - (WINDOW.y - WINDOW.halfH)) / (WINDOW.halfH * 2);
  const across = x < CORNER ? 1.25 + (x - CORNER) / 90 : 0.6 + (x - CORNER) / 80;
  return rungOf(ladder, level * across * (0.7 + low * 0.45), x, y);
}

/** The ground close: the dunes, the window's light thrown out across them. */
function paintCloseGround(canvas: Canvas, t: number): void {
  paintDunes(canvas, 0, CLOSE_HORIZON);
  for (let y = Math.floor(wallFootAt(WINDOW.x)) - 2; y < VISIBLE; y += 1) {
    const out = y - (WINDOW.y + WINDOW.halfH) + 4;
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      if (y < wallFootAt(x) - 2) continue;
      const spread = WINDOW.halfW + out * 0.9;
      const across = Math.abs(x - WINDOW.x + out * 0.4) / spread;
      if (across > 1) continue;
      const light = (1 - across) * clamp01(1 - (y - wallFootAt(x)) / 30) * 0.9;
      if (light > 0.05) canvas.set(x, y, rungOf(videoLight(t).ladder, light * videoLight(t).level, x, y));
    }
  }
}

function paintClose(canvas: Canvas, t: number): void {
  paintSky(canvas, 0, CLOSE_HORIZON, CLOSE_GLOW_X);
  paintDeimos(canvas, t, CLOSE_DEIMOS.x, CLOSE_DEIMOS.y);
  paintMesas(canvas, 0, CLOSE_HORIZON);
  paintCloseGround(canvas, t);
  paintCloseDome(canvas, t);
}

// ═══ the wide shot ═══

/** Mars at dusk, the camera `rise` pixels up the sky from where it lands. */
function paintWide(canvas: Canvas, t: number, rise: number): void {
  paintSky(canvas, rise, HORIZON, GLOW_X);
  paintEarth(canvas, rise);
  paintPhobos(canvas, t, rise);
  paintShuttles(canvas, t, rise);
  paintDeimos(canvas, t, DEIMOS.x, DEIMOS.y + rise);
  paintMesas(canvas, rise, HORIZON);
  paintPort(canvas, t, rise);
  paintDunes(canvas, rise, HORIZON);
  if (rise < VISIBLE) {
    const shifted: Canvas = { timeMs: canvas.timeMs, set: (x, y, pixel) => canvas.set(x, y + rise, pixel), get: (x, y) => canvas.get(x, y + rise) };
    paintDome(shifted, t);
  }
}

/** The tilt: from high in the sky down to the horizon, easing in and out, out of the black. */
function paintTilt(canvas: Canvas, t: number): void {
  const progress = clamp01((t - NIGHT_MS) / TILT_MS);
  paintWide(canvas, t, Math.round(TILT * (1 - ease(progress))));
  const steps = STEPS_TO_BLACK - Math.floor((t - NIGHT_MS) / EMERGE_STEP_MS);
  if (steps <= 0) return;
  for (let y = 0; y < VISIBLE; y += 1) for (let x = 0; x < FRAME_WIDTH; x += 1) canvas.set(x, y, darker(canvas.get(x, y), steps));
}

// ═══ the push-in ═══

/** The point of the wide shot the push closes in on: the lit window. */
const PUSH_TO = { x: LIT_X + 0.5, y: WINDOW_Y + 1 } as const;
/** The push ends with the small window as big as the close one, where the close one is. */
const PUSH_SCALE = (WINDOW.halfW * 2) / 3;

/** The wide shot, magnified pixel by pixel onto the lit window, and the close view showing through. */
function paintPush(canvas: Canvas, t: number): void {
  const progress = (t - CONTRACTORS_MS) / PUSH_MS;
  const scale = PUSH_SCALE ** ease(progress);
  const anchorX = PUSH_TO.x + (WINDOW.x - PUSH_TO.x) * ease(progress);
  const anchorY = PUSH_TO.y + (WINDOW.y - PUSH_TO.y) * ease(progress);
  const wide = offscreen(canvas.timeMs, (buffer) => paintWide(buffer, t, 0));
  const dissolve = clamp01((progress - DISSOLVE_FROM) / (1 - DISSOLVE_FROM));
  const close = dissolve > 0 ? offscreen(canvas.timeMs, (buffer) => paintClose(buffer, t)) : undefined;

  for (let y = 0; y < VISIBLE; y += 1) {
    for (let x = 0; x < FRAME_WIDTH; x += 1) {
      if (close && ditherAt(x, y) < dissolve) {
        canvas.set(x, y, close[y * FRAME_WIDTH + x]!);
        continue;
      }
      const u = Math.floor(PUSH_TO.x + (x + 0.5 - anchorX) / scale);
      const v = Math.floor(PUSH_TO.y + (y + 0.5 - anchorY) / scale);
      canvas.set(x, y, u >= 0 && v >= 0 && u < FRAME_WIDTH && v < VISIBLE ? wide[v * FRAME_WIDTH + u]! : ".");
    }
  }
}

// ═══ the card ═══

function paintCard(canvas: Canvas, t: number): void {
  if (t < NIGHT_MS) paintDarkening(canvas, t);
  else if (t < LANDED_MS) paintTilt(canvas, t);
  else if (t < CONTRACTORS_MS) paintWide(canvas, t, 0);
  else if (t < CLOSE_MS) paintPush(canvas, t);
  else paintClose(canvas, t);
}

/**
 * The card from `fromMs` on, painted on the card's own clock. It is one shot after another, split
 * into scenes at its beats so that under reduced motion each beat is a still of its own.
 */
function beat(fromMs: number): Scene {
  return { fromMs, layers: [{ kind: "painted", paint: (canvas) => paintCard(canvas, canvas.timeMs + fromMs) }] };
}

/** Under reduced motion: card 8's last frame, then Mars and the dome, then the window close. */
export const CARD_09_ART: CardArt = {
  scenes: [beat(0), beat(LANDED_MS), beat(CLOSE_MS)],
};
