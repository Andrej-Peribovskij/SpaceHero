/**
 * The generator of card 2's big fighters: stick-figure skeletons, fleshed out and rasterised into
 * the pixel grids `cards/card-02.ts` stores. Card art keeps its figures as pixel data
 * (design.md §11), so this does not run when the game does; it is how those grids were drawn, kept
 * so a pose can be changed by moving a joint rather than pixel by pixel. `fighters.test.ts` holds
 * it to the grids in the card, and `pnpm run intro:draw-fighters` prints them, ready to paste.
 *
 * A skeleton's joints are pixel positions in a 36×78 box, facing right, feet on the bottom row.
 * Each bone is a capsule (a line with a round end at each joint); a pixel is the figure's when its
 * centre lies inside any of them.
 */

/** The box every fighter is drawn in: wide enough for an arm thrown forward. */
export const FIGHTER_WIDTH = 36;
export const FIGHTER_HEIGHT = 78;

type Joint = readonly [x: number, y: number];

/** A leg: knee, foot, and optionally a toe for a foot that points. */
type Leg = readonly [knee: Joint, foot: Joint, toe?: Joint];

/** An arm: shoulder, elbow, hand, and optionally the size of the fist. */
type Arm = readonly [shoulder: Joint, elbow: Joint, hand: Joint, fist?: number];

export interface Skeleton {
  readonly head: Joint;
  readonly shoulder: Joint;
  readonly hip: Joint;
  readonly legs: readonly Leg[];
  readonly arms: readonly Arm[];
}

/** How thick each part is, as a radius in pixels. */
const HEAD = 5.2;
const NECK = 2.6;
const TORSO = 4.8;
const THIGH = 3.6;
const SHIN = 2.8;
const FOOT = 1.8;
const UPPER_ARM = 2.1;
const FOREARM = 1.8;
const FIST = 2.6;

/** The poses of the close shot. The bearer's top hand is its picture's `CHARGE_GRIP`. */
export const FIGHTER_POSES = {
  RUN_A: {
    hip: [14, 44],
    shoulder: [19, 22],
    head: [22, 12],
    legs: [
      [[22, 57], [26, 72], [30, 75]],
      [[9, 58], [2, 66]],
    ],
    arms: [
      [[21, 23], [29, 18], [33, 8], 2.8],
      [[17, 24], [11, 31], [6, 28]],
    ],
  },
  RUN_B: {
    hip: [14, 43],
    shoulder: [19, 21],
    head: [22, 11],
    legs: [
      [[18, 58], [17, 74], [22, 76]],
      [[11, 57], [5, 67]],
    ],
    arms: [
      [[21, 22], [29, 20], [33, 11], 2.8],
      [[17, 23], [13, 31], [9, 35]],
    ],
  },
  WIND_UP: {
    hip: [14, 44],
    shoulder: [17, 22],
    head: [21, 13],
    legs: [
      [[22, 59], [27, 74], [31, 76]],
      [[8, 60], [3, 75]],
    ],
    arms: [
      [[15, 21], [9, 13], [9, 3], 2.8],
      [[19, 24], [25, 28], [30, 23]],
    ],
  },
  BLOW: {
    hip: [14, 45],
    shoulder: [21, 24],
    head: [25, 15],
    legs: [
      [[23, 60], [28, 75], [32, 76]],
      [[8, 60], [2, 74]],
    ],
    arms: [
      [[23, 25], [29, 26], [33, 32], 2.8],
      [[19, 26], [14, 32], [10, 37]],
    ],
  },
  CHARGING_BEARER: {
    hip: [14, 44],
    shoulder: [19, 22],
    head: [21, 12],
    legs: [
      [[22, 57], [26, 72], [30, 75]],
      [[9, 58], [2, 66]],
    ],
    arms: [
      [[21, 23], [28, 23], [29, 15]],
      [[19, 24], [25, 30], [26, 24]],
    ],
  },
} as const satisfies Record<string, Skeleton>;

export type FighterPose = keyof typeof FIGHTER_POSES;

interface Bone {
  readonly from: Joint;
  readonly to: Joint;
  readonly radius: number;
}

const bone = (from: Joint, to: Joint, radius: number): Bone => ({ from, to, radius });

function bonesOf(skeleton: Skeleton): Bone[] {
  const bones = [bone(skeleton.head, skeleton.head, HEAD), bone(skeleton.shoulder, skeleton.head, NECK), bone(skeleton.shoulder, skeleton.hip, TORSO)];

  for (const [knee, foot, toe] of skeleton.legs) {
    bones.push(bone(skeleton.hip, knee, THIGH), bone(knee, foot, SHIN));
    if (toe) bones.push(bone(foot, toe, FOOT));
  }
  for (const [shoulder, elbow, hand, fist] of skeleton.arms) {
    bones.push(bone(shoulder, elbow, UPPER_ARM), bone(elbow, hand, FOREARM), bone(hand, hand, fist ?? FIST));
  }
  return bones;
}

/** Whether a point lies inside a bone: within its radius of the line between its joints. */
function inside(x: number, y: number, { from: [ax, ay], to: [bx, by], radius }: Bone): boolean {
  const dx = bx - ax;
  const dy = by - ay;
  const length = dx * dx + dy * dy;
  const along = length === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length));
  return Math.hypot(x - (ax + along * dx), y - (ay + along * dy)) <= radius;
}

/** A fighter as rows of pixels: `.` the figure, `_` not, as a card's picture is written. */
export function drawFighter(skeleton: Skeleton): string[] {
  const bones = bonesOf(skeleton);
  const rows: string[] = [];

  for (let y = 0; y < FIGHTER_HEIGHT; y += 1) {
    let row = "";
    for (let x = 0; x < FIGHTER_WIDTH; x += 1) row += bones.some((part) => inside(x + 0.5, y + 0.5, part)) ? "." : "_";
    rows.push(row);
  }
  return rows;
}
