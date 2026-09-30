import { useEffect, useRef } from "react";

import { FRAME_HEIGHT, FRAME_WIDTH } from "./grid";
import { FRAME_MS, renderFrame, writeRgba, type CardArt } from "./render";

interface PixelCanvasProps {
  readonly art: CardArt;
  /** Paint time 0 once and stop: the picture holds still for players who prefer reduced motion. */
  readonly still: boolean;
}

/**
 * Card art on a 96×54 canvas, scaled up with hard pixel edges.
 *
 * It repaints at 12 frames a second from its own animation loop, not through React state: a
 * frame is pixels on a canvas, and re-rendering the view for each one would be work for nothing.
 * The art's clock starts when the canvas mounts, so each card animates from its own beginning.
 *
 * The canvas is hidden from assistive technology. The script's description of the picture is its
 * text alternative, and the frame around it carries that (see IntroCardFrame).
 */
export function PixelCanvas({ art, still }: PixelCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) return;

    const image = context.createImageData(FRAME_WIDTH, FRAME_HEIGHT);
    const paint = (timeMs: number) => {
      writeRgba(renderFrame(art, timeMs), image.data);
      context.putImageData(image, 0, 0);
    };

    paint(0);
    if (still) return;

    let frame = 0;
    let painted = 0;
    let start: number | undefined;

    const loop = (now: number) => {
      start ??= now;
      const due = Math.floor((now - start) / FRAME_MS);

      if (due !== painted) {
        painted = due;
        paint(due * FRAME_MS);
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
