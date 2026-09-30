import type { ReactNode } from "react";

import type { CaptionSegment } from "./script";

interface IntroCaptionProps {
  readonly caption: readonly CaptionSegment[];
  /** How many characters, counted across every segment, have been typed so far. */
  readonly shownChars: number;
}

/**
 * A caption, typed out.
 *
 * The untyped rest is rendered too, invisibly, so the caption holds its final size from the
 * first character and the picture above it never shifts. The whole thing is hidden from
 * assistive technology: a screen reader hears the caption once, from the view's live region,
 * rather than a character at a time (design.md §7).
 */
export function IntroCaption({ caption, shownChars }: IntroCaptionProps) {
  let remaining = shownChars;
  const parts: ReactNode[] = [];

  caption.forEach((segment, index) => {
    const shown = segment.text.slice(0, Math.max(0, remaining));
    const hidden = segment.text.slice(shown.length);
    remaining -= segment.text.length;

    const content = (
      <>
        {shown}
        {hidden && <span className="invisible">{hidden}</span>}
      </>
    );

    parts.push(segment.emphasis ? <em key={index}>{content}</em> : <span key={index}>{content}</span>);
  });

  return (
    <p aria-hidden="true" data-testid="intro-caption" className="font-mono text-lg leading-relaxed">
      {parts}
    </p>
  );
}
