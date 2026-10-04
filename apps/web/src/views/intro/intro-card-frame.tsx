import type { CardArt } from "./art/render";
import { glitchMs, punchMs } from "./intro-timeline";
import { PixelScreen } from "./screen/pixel-screen";
import { captionText, type IntroCard } from "./script";
import type { CardClock } from "./use-intro-timeline";

interface IntroCardFrameProps {
  /** The card's number in the script. */
  readonly index: number;
  readonly card: IntroCard;
  /** The clock the screen paints from: the timeline's. */
  readonly clock: { readonly current: CardClock };
  readonly shownChars: number;
  /** The card's animated pixel art; a black picture until the card is drawn. */
  readonly art: CardArt | undefined;
  /** The line asking for a key, under an ident. */
  readonly prompt: string | undefined;
  /** Hold the screen still, for players who prefer reduced motion. */
  readonly still: boolean;
}

/**
 * One card of the orientation video, as one pixel screen: its picture, and under it its caption
 * and any prompt, drawn in the same pixels.
 *
 * The screen carries the script's description of the picture as its text alternative. What has
 * been typed so far is also kept in `data-caption-shown`, so tests can read what the canvas shows.
 */
export function IntroCardFrame({ index, card, clock, shownChars, art, prompt, still }: IntroCardFrameProps) {
  return (
    <div
      role="img"
      aria-label={card.image}
      data-caption-shown={captionText(card).slice(0, shownChars)}
      className="w-full max-w-3xl"
    >
      <PixelScreen
        card={index}
        clock={clock}
        art={art}
        caption={card.caption}
        shownChars={shownChars}
        prompt={prompt}
        still={still}
        glitchAtMs={glitchMs(index)}
        powerOffAtMs={punchMs(index)}
      />
    </div>
  );
}
