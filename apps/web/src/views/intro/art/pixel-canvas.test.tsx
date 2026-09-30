import { act, render } from "@testing-library/react";

import { FRAME_HEIGHT, FRAME_WIDTH } from "./grid";
import { CARD_00_ART } from "./cards/card-00";
import { PixelCanvas } from "./pixel-canvas";

/** A stand-in 2D context: jsdom has no canvas, so count the paints instead of looking at them. */
function fakeContext() {
  const putImageData = vi.fn();
  const context = {
    createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
    putImageData,
  };

  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(context as unknown as CanvasRenderingContext2D);
  return putImageData;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance"] });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

it("is a 96×54 canvas, hidden from assistive technology", () => {
  fakeContext();
  const { container } = render(<PixelCanvas art={CARD_00_ART} still={false} />);
  const canvas = container.querySelector("canvas")!;

  expect([canvas.width, canvas.height]).toEqual([FRAME_WIDTH, FRAME_HEIGHT]);
  expect(canvas).toHaveAttribute("aria-hidden", "true");
});

it("repaints at 12 frames a second, not at the display's rate", () => {
  const putImageData = fakeContext();
  render(<PixelCanvas art={CARD_00_ART} still={false} />);

  advance(1000);

  // The first paint on mount, then one per twelfth of a second; the browser's ~60 fps frames
  // in between paint nothing. A frame either side of the second is slack for timer rounding.
  expect(putImageData.mock.calls.length).toBeGreaterThanOrEqual(12);
  expect(putImageData.mock.calls.length).toBeLessThanOrEqual(14);
});

it("paints once and holds still for reduced motion", () => {
  const putImageData = fakeContext();
  render(<PixelCanvas art={CARD_00_ART} still />);

  advance(5000);

  expect(putImageData).toHaveBeenCalledTimes(1);
});

it("stops painting when it unmounts", () => {
  const putImageData = fakeContext();
  const { unmount } = render(<PixelCanvas art={CARD_00_ART} still={false} />);
  advance(500);
  unmount();
  const painted = putImageData.mock.calls.length;

  advance(2000);

  expect(putImageData.mock.calls.length).toBe(painted);
});
