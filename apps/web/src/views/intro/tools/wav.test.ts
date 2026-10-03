import { encodeWav } from "./wav";

describe("encodeWav", () => {
  const wav = encodeWav(new Float32Array([0, 1, -1, 0.5, 2]), 22_050);
  const view = new DataView(wav.buffer);
  const text = (offset: number) => String.fromCharCode(...wav.slice(offset, offset + 4));

  it("writes a RIFF WAVE header for mono 16-bit PCM at the given rate", () => {
    expect(text(0)).toBe("RIFF");
    expect(view.getUint32(4, true)).toBe(wav.length - 8);
    expect(text(8)).toBe("WAVE");
    expect(text(12)).toBe("fmt ");
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(22_050);
    expect(view.getUint16(34, true)).toBe(16);
    expect(text(36)).toBe("data");
    expect(view.getUint32(40, true)).toBe(10);
  });

  it("scales each sample to 16 bits, and clamps what is out of range rather than wrapping it", () => {
    const samples = Array.from({ length: 5 }, (_, i) => view.getInt16(44 + i * 2, true));

    expect(samples).toEqual([0, 32767, -32767, 16384, 32767]);
  });
});
