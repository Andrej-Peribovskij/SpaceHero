import { inflateSync } from "node:zlib";

import { encodeApng, encodePng, type Frame } from "./png";

const frame = (pixels: Frame["pixels"]): Frame => ({ width: 2, height: 1, pixels });

/** The chunks of a PNG, by type, in order. */
function chunks(png: Buffer): { type: string; data: Buffer }[] {
  const found = [];
  for (let at = 8; at < png.length; ) {
    const length = png.readUInt32BE(at);
    found.push({ type: png.toString("latin1", at + 4, at + 8), data: png.subarray(at + 8, at + 8 + length) });
    at += 12 + length;
  }
  return found;
}

describe("encodePng", () => {
  it("writes an indexed PNG of the frame, scaled by whole pixels", () => {
    const png = encodePng([frame([".", "w"])], { scale: 3 });
    const [ihdr, plte, idat] = chunks(png);

    expect(png.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    expect([ihdr!.data.readUInt32BE(0), ihdr!.data.readUInt32BE(4), ihdr!.data[9]]).toEqual([6, 3, 3]);
    expect(plte!.data.length).toBe(16 * 3);
    // Each row: a filter byte, then three pixels of "." and three of "w".
    expect([...inflateSync(idat!.data).subarray(0, 7)]).toEqual([0, 0, 0, 0, 5, 5, 5]);
  });

  it("lays several frames out as a contact sheet", () => {
    const png = encodePng([frame([".", "."]), frame(["w", "w"]), frame(["w", "."])], { columns: 2 });
    const ihdr = chunks(png)[0]!.data;

    expect([ihdr.readUInt32BE(0), ihdr.readUInt32BE(4)]).toEqual([4, 2]);
  });
});

describe("encodeApng", () => {
  it("writes one frame-control chunk per frame, and counts them in acTL", () => {
    const apng = encodeApng([frame([".", "w"]), frame(["w", "."]), frame([".", "."])], { fps: 12 });
    const types = chunks(apng).map((chunk) => chunk.type);

    expect(types.filter((type) => type === "fcTL")).toHaveLength(3);
    expect(types.filter((type) => type === "fdAT")).toHaveLength(2);
    expect(chunks(apng).find((chunk) => chunk.type === "acTL")!.data.readUInt32BE(0)).toBe(3);
  });
});
