import { deflateSync } from "node:zlib";

import { PALETTE, type PaletteChar } from "../art/palette";

/**
 * PNG and animated PNG (APNG) from palette frames: for reviewing card art as images, never shipped.
 *
 * Indexed colour, one byte a pixel, with the intro's palette as the PNG's. Small files, and the
 * colours are exactly the game's. Frames are scaled up by whole pixels so they stay sharp.
 */

const COLOURS = Object.keys(PALETTE) as PaletteChar[];
const INDEX = Object.fromEntries(COLOURS.map((colour, index) => [colour, index])) as Record<PaletteChar, number>;
const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let bit = 0; bit < 8; bit += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(bytes: Buffer): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function header(width: number, height: number): Buffer[] {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bits per index
  ihdr[9] = 3; // indexed colour
  const plte = Buffer.from(COLOURS.flatMap((colour) => [1, 3, 5].map((at) => Number.parseInt(PALETTE[colour].slice(at, at + 2), 16))));
  return [SIGNATURE, chunk("IHDR", ihdr), chunk("PLTE", plte)];
}

export interface Frame {
  readonly width: number;
  readonly height: number;
  readonly pixels: readonly PaletteChar[];
}

/** Frames laid out in a grid, `columns` wide, each pixel scaled to `scale × scale`; grey fills gaps. */
function raster(frames: readonly Frame[], columns: number, scale: number) {
  const { width: fw, height: fh } = frames[0]!;
  const rows = Math.ceil(frames.length / columns);
  const width = fw * columns * scale;
  const height = fh * rows * scale;
  const data = Buffer.alloc((width + 1) * height); // each row: a filter byte, then indices

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const frame = frames[Math.floor(y / scale / fh) * columns + Math.floor(x / scale / fw)];
      const colour = frame ? frame.pixels[(Math.floor(y / scale) % fh) * fw + (Math.floor(x / scale) % fw)]! : "g";
      data[y * (width + 1) + 1 + x] = INDEX[colour];
    }
  }
  return { width, height, data };
}

/** One PNG: a single frame, or a contact sheet of several. */
export function encodePng(frames: readonly Frame[], { columns = 1, scale = 1 } = {}): Buffer {
  const { width, height, data } = raster(frames, columns, scale);
  return Buffer.concat([...header(width, height), chunk("IDAT", deflateSync(data)), chunk("IEND", Buffer.alloc(0))]);
}

/** An animated PNG, looping forever, one frame every `1 / fps` of a second. */
export function encodeApng(frames: readonly Frame[], { fps, scale = 1 }: { fps: number; scale?: number }): Buffer {
  const first = raster(frames.slice(0, 1), 1, scale);
  const parts = header(first.width, first.height);

  const actl = Buffer.alloc(8);
  actl.writeUInt32BE(frames.length, 0); // frame count; plays: 0, forever
  parts.push(chunk("acTL", actl));

  let sequence = 0;
  frames.forEach((frame, index) => {
    const fctl = Buffer.alloc(26);
    fctl.writeUInt32BE(sequence++, 0);
    fctl.writeUInt32BE(first.width, 4);
    fctl.writeUInt32BE(first.height, 8);
    fctl.writeUInt16BE(1, 20); // delay: 1 / fps of a second
    fctl.writeUInt16BE(fps, 22);
    parts.push(chunk("fcTL", fctl));

    const pixels = deflateSync(raster([frame], 1, scale).data);
    if (index === 0) parts.push(chunk("IDAT", pixels));
    else {
      const number = Buffer.alloc(4);
      number.writeUInt32BE(sequence++, 0);
      parts.push(chunk("fdAT", Buffer.concat([number, pixels])));
    }
  });

  parts.push(chunk("IEND", Buffer.alloc(0)));
  return Buffer.concat(parts);
}
