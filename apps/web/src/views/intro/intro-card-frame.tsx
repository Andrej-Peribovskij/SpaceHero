import { PixelCanvas } from "./art/pixel-canvas";
import type { CardArt } from "./art/render";
import { IntroCaption } from "./intro-caption";
import type { IntroCard } from "./script";

interface IntroCardFrameProps {
  readonly card: IntroCard;
  readonly shownChars: number;
  /** The card's animated pixel art; a flat placeholder until the card is drawn. */
  readonly art: CardArt | undefined;
  /** Hold the art still, for players who prefer reduced motion. */
  readonly still: boolean;
}

/**
 * One card of the orientation video: its picture above, its caption below.
 *
 * The picture carries the script's description of the image as its text alternative, so a
 * screen reader is told the same thing whether the card is drawn yet or not.
 */
export function IntroCardFrame({ card, shownChars, art, still }: IntroCardFrameProps) {
  return (
    <figure className="flex w-full max-w-3xl flex-col gap-6">
      <div
        role="img"
        aria-label={card.image}
        className="aspect-video w-full border border-[var(--border)] bg-[var(--color-slate-950)]"
      >
        {art && <PixelCanvas art={art} still={still} />}
      </div>
      <figcaption>
        <IntroCaption caption={card.caption} shownChars={shownChars} />
      </figcaption>
    </figure>
  );
}
