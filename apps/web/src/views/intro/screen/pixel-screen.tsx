import { useEffect, useLayoutEffect, useRef } from "react";

import { FRAME_HEIGHT, FRAME_WIDTH } from "../art/grid";
import { FRAME_MS, writeRgba, type CardArt } from "../art/render";
import type { CaptionSegment } from "../script";
import { composeScreen, isLit } from "./compose";

interface PixelScreenProps {
  readonly art: CardArt | undefined;
  readonly caption: readonly CaptionSegment[];
  readonly shownChars: number;
  readonly prompt: string | undefined;
  /** Freeze the art at time 0 and stop the prompt blinking: for players who prefer reduced motion. */
  readonly still: boolean;
}

/**
 * The orientation's screen: art, caption and prompt on one 384×216 canvas, scaled up with hard
 * pixel edges.
 *
 * It paints from its own animation loop, not through React state: a frame is pixels on a canvas,
 * and re-rendering the view for each one would be work for nothing. The art moves at 12 frames a
 * second; a newly typed character is painted on the next display frame, so typing is not held
 * back to the art's cadence. The art's clock starts when the card's art does.
 *
 * The canvas is hidden from assistive technology: the view carries the picture's description,
 * the caption in a live region, and the prompt as text.
 */
export function PixelScreen({ art, caption, shownChars, prompt, still }: PixelScreenProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const text = useRef({ caption, shownChars, prompt });
  const changed = useRef(true);

  // What the text shows is read by the loop below, which outlives any one render.
  useLayoutEffect(() => {
    text.current = { caption, shownChars, prompt };
    changed.current = true;
  }, [caption, shownChars, prompt]);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;

    const image = context.createImageData(FRAME_WIDTH, FRAME_HEIGHT);
    let frame = 0;
    let painted = -1;
    let start: number | undefined;
    changed.current = true;

    const loop = (now: number) => {
      start ??= now;
      const due = still ? 0 : Math.floor((now - start) / FRAME_MS);

      if (due !== painted || changed.current) {
        const timeMs = due * FRAME_MS;
        painted = due;
        changed.current = false;
        writeRgba(composeScreen({ art, ...text.current, timeMs, promptLit: still || isLit(timeMs) }), image.data);
        context.putImageData(image, 0, 0);
      }

      frame = requestAnimationFrame(loop);
    };

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [art, still]);

  return (
    <canvas
      ref={canvasRef}
      width={FRAME_WIDTH}
      height={FRAME_HEIGHT}
      aria-hidden="true"
      className="block h-auto w-full [image-rendering:pixelated]"
    />
  );
}
