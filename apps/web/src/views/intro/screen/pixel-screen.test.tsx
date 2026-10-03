import { act, render } from "@testing-library/react";

import { CARD_00_ART } from "../art/cards/card-00";
import { CARD_01_ART } from "../art/cards/card-01";
import { FRAME_HEIGHT, FRAME_WIDTH } from "../art/grid";
import { IntroCardFrame } from "../intro-card-frame";
import { glitchMs } from "../intro-timeline";
import { INTRO_CARDS } from "../script";
import type { CardClock } from "../use-intro-timeline";
import { composeScreen } from "./compose";
import { PixelScreen } from "./pixel-screen";

// The real composition, watched: what the screen asks for is what these tests check.
vi.mock("./compose", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./compose")>();
  return { ...actual, composeScreen: vi.fn(actual.composeScreen) };
});

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
  vi.mocked(composeScreen).mockClear();
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

/** A clock for `card` that runs with the faked frame clock, as the timeline's does while it plays. */
function running(card = 0): { readonly current: CardClock } {
  const started = performance.now();
  return {
    get current() {
      return { card, ms: performance.now() - started };
    },
  };
}

/** A clock that stands still: the timeline's, while the page is hidden. */
const standing = (ms: number, card = 0): { current: CardClock } => ({ current: { card, ms } });

const caption = INTRO_CARDS[1]!.caption;
const base = { card: 0, art: CARD_00_ART, caption, prompt: undefined } as const;
/** The times the screen has asked to compose, in order. */
const composedTimes = () => vi.mocked(composeScreen).mock.calls.map(([content]) => content.timeMs);

it("is a 384×216 canvas, hidden from assistive technology", () => {
  fakeContext();
  const { container } = render(<PixelScreen {...base} clock={running()} shownChars={0} still={false} />);
  const canvas = container.querySelector("canvas")!;

  expect([canvas.width, canvas.height]).toEqual([FRAME_WIDTH, FRAME_HEIGHT]);
  expect(canvas).toHaveAttribute("aria-hidden", "true");
});

it("repaints at 12 frames a second, not at the display's rate", () => {
  const putImageData = fakeContext();
  render(<PixelScreen {...base} clock={running()} shownChars={0} still={false} />);

  advance(1000);

  expect(putImageData.mock.calls.length).toBeGreaterThanOrEqual(12);
  expect(putImageData.mock.calls.length).toBeLessThanOrEqual(14);
});

it("paints a newly typed character straight away, not at the next art frame", () => {
  const putImageData = fakeContext();
  const clock = running();
  const { rerender } = render(<PixelScreen {...base} clock={clock} shownChars={0} still={false} />);
  advance(20);
  const before = putImageData.mock.calls.length;

  rerender(<PixelScreen {...base} clock={clock} shownChars={1} still={false} />);
  advance(17);

  expect(putImageData.mock.calls.length).toBe(before + 1);
});

it("holds still for reduced motion, repainting only when the text changes", () => {
  const putImageData = fakeContext();
  const clock = running();
  const { rerender } = render(<PixelScreen {...base} clock={clock} shownChars={0} still />);
  advance(5000);
  expect(putImageData).toHaveBeenCalledTimes(1);

  rerender(<PixelScreen {...base} clock={clock} shownChars={caption[0]!.text.length} still />);
  advance(5000);

  expect(putImageData).toHaveBeenCalledTimes(2);
});

it("stops painting when it unmounts", () => {
  const putImageData = fakeContext();
  const { unmount } = render(<PixelScreen {...base} clock={running()} shownChars={0} still={false} />);
  advance(500);
  unmount();
  const painted = putImageData.mock.calls.length;

  advance(2000);

  expect(putImageData.mock.calls.length).toBe(painted);
});

it("under reduced motion, still repaints a card's cuts and fade steps, and nothing in between", () => {
  const putImageData = fakeContext();
  render(<PixelScreen card={1} clock={running(1)} art={CARD_01_ART} caption={[]} shownChars={0} prompt={undefined} still />);

  advance(7000);

  // Card 1 changes picture 1 + 6 + 1 + 6 times (start, bleed, cut, hand-over): a handful of
  // paints, where moving at 12 fps would be 84.
  expect(putImageData.mock.calls.length).toBeGreaterThanOrEqual(14);
  expect(putImageData.mock.calls.length).toBeLessThanOrEqual(16);
});

describe("the clock it paints from", () => {
  it("paints the time its clock says, so a clock that stands still — a hidden page — holds the picture", () => {
    const putImageData = fakeContext();
    render(<PixelScreen {...base} clock={standing(2000)} shownChars={0} still={false} />);

    advance(3000);

    expect(putImageData).toHaveBeenCalledTimes(1);
    expect(composedTimes()).toEqual([2000]);
  });

  it("holds its picture while the clock still counts another card's time", () => {
    const putImageData = fakeContext();
    const clock = standing(500, 0);
    render(<PixelScreen {...base} card={1} clock={clock} shownChars={0} still={false} />);
    advance(1000);
    expect(putImageData).not.toHaveBeenCalled();

    clock.current = { card: 1, ms: 0 };
    advance(20);

    expect(putImageData).toHaveBeenCalledTimes(1);
    expect(composedTimes()).toEqual([0]);
  });

  it("keeps the card's time when reduced motion is turned on, rather than starting the card over", () => {
    fakeContext();
    const clock = standing(4000);
    const { rerender } = render(<PixelScreen {...base} clock={clock} shownChars={0} still={false} />);
    advance(20);

    rerender(<PixelScreen {...base} clock={clock} shownChars={0} still />);
    advance(20);

    expect(new Set(composedTimes())).toEqual(new Set([4000]));
  });
});

it("is handed card 6's glitch moment by the card frame, and no other card's", () => {
  fakeContext();
  const frame = (index: number) => (
    <IntroCardFrame
      index={index}
      card={INTRO_CARDS[index]!}
      clock={standing(0, index)}
      shownChars={0}
      art={undefined}
      prompt={undefined}
      still={false}
    />
  );

  const { rerender } = render(frame(6));
  advance(20);
  expect(vi.mocked(composeScreen).mock.lastCall![0].glitchAtMs).toBe(glitchMs(6));
  expect(glitchMs(6)).toBeGreaterThan(0);

  rerender(frame(5));
  advance(20);
  expect(vi.mocked(composeScreen).mock.lastCall![0].glitchAtMs).toBeUndefined();
});
