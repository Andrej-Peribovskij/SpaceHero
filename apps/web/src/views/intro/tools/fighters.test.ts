import { CLOSE_FIGHTERS } from "../art/cards/card-02";
import { parsePicture } from "../art/grid";
import { FIGHTER_HEIGHT, FIGHTER_POSES, FIGHTER_WIDTH, drawFighter, type FighterPose } from "./fighters";

const poses = Object.keys(FIGHTER_POSES) as FighterPose[];

describe("the fighter generator", () => {
  it("draws every fighter in its box", () => {
    for (const pose of poses) {
      const rows = drawFighter(FIGHTER_POSES[pose]);

      expect(rows).toHaveLength(FIGHTER_HEIGHT);
      rows.forEach((row) => expect(row).toMatch(new RegExp(`^[._]{${FIGHTER_WIDTH}}$`)));
    }
  });

  it("stands every fighter on the bottom of its box", () => {
    for (const pose of poses) expect(drawFighter(FIGHTER_POSES[pose]).slice(-4).join("")).toContain(".");
  });

  it("draws exactly the fighters card 2 stores, pose for pose", () => {
    expect(Object.keys(CLOSE_FIGHTERS).sort()).toEqual([...poses].sort());

    for (const pose of poses) {
      const drawn = parsePicture(`drawn ${pose}`, drawFighter(FIGHTER_POSES[pose]).join("\n"));
      expect({ pose, pixels: drawn.pixels }).toEqual({ pose, pixels: CLOSE_FIGHTERS[pose].pixels });
    }
  });
});
