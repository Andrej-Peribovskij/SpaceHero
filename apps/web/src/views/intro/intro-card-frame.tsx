import { IntroCaption } from "./intro-caption";
import type { IntroCard } from "./script";

interface IntroCardFrameProps {
  readonly card: IntroCard;
  readonly shownChars: number;
}

/**
 * One card of the orientation video: its picture above, its caption below.
 *
 * The picture is a flat placeholder until the pixel art lands (tasks.md, slice 2). It already
 * carries the script's description of the image as its text alternative, so the art can
 * replace it without changing what a screen reader is told.
 */
export function IntroCardFrame({ card, shownChars }: IntroCardFrameProps) {
  return (
    <figure className="flex w-full max-w-3xl flex-col gap-6">
      <div
        role="img"
        aria-label={card.image}
        className="aspect-video w-full border border-[var(--border)] bg-[var(--color-slate-950)]"
      />
      <figcaption>
        <IntroCaption caption={card.caption} shownChars={shownChars} />
      </figcaption>
    </figure>
  );
}
