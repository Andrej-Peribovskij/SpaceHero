import { act, render } from "@testing-library/react";

import { CARD_00_ART } from "../art/cards/card-00";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../art/grid";
import { INTRO_CARDS } from "../script";
import { PixelScreen } from "./pixel-screen";

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

const caption = INTRO_CARDS[1]!.caption;

it("is a 384×216 canvas, hidden from assistive technology", () => {
  fakeContext();
  const { container } = render(<PixelScreen art={CARD_00_ART} caption={caption} shownChars={0} prompt={undefined} still={false} />);
  const canvas = container.querySelector("canvas")!;

  expect([canvas.width, canvas.height]).toEqual([FRAME_WIDTH, FRAME_HEIGHT]);
  expect(canvas).toHaveAttribute("aria-hidden", "true");
});

it("repaints at 12 frames a second, not at the display's rate", () => {
  const putImageData = fakeContext();
  render(<PixelScreen art={CARD_00_ART} caption={caption} shownChars={0} prompt={undefined} still={false} />);

  advance(1000);

  expect(putImageData.mock.calls.length).toBeGreaterThanOrEqual(12);
  expect(putImageData.mock.calls.length).toBeLessThanOrEqual(14);
});

it("paints a newly typed character straight away, not at the next art frame", () => {
  const putImageData = fakeContext();
  const props = { art: CARD_00_ART, caption, prompt: undefined, still: false } as const;
  const { rerender } = render(<PixelScreen {...props} shownChars={0} />);
  advance(20);
  const before = putImageData.mock.calls.length;

  rerender(<PixelScreen {...props} shownChars={1} />);
  advance(17);

  expect(putImageData.mock.calls.length).toBe(before + 1);
});

it("holds still for reduced motion, repainting only when the text changes", () => {
  const putImageData = fakeContext();
  const props = { art: CARD_00_ART, caption, prompt: undefined, still: true } as const;
  const { rerender } = render(<PixelScreen {...props} shownChars={0} />);
  advance(5000);
  expect(putImageData).toHaveBeenCalledTimes(1);

  rerender(<PixelScreen {...props} shownChars={caption[0]!.text.length} />);
  advance(5000);

  expect(putImageData).toHaveBeenCalledTimes(2);
});

it("stops painting when it unmounts", () => {
  const putImageData = fakeContext();
  const { unmount } = render(<PixelScreen art={CARD_00_ART} caption={caption} shownChars={0} prompt={undefined} still={false} />);
  advance(500);
  unmount();
  const painted = putImageData.mock.calls.length;

  advance(2000);

  expect(putImageData.mock.calls.length).toBe(painted);
});
