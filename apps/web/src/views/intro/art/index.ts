import { END_CARD, IDENT_CARD } from "../script";
import { CARD_00_ART } from "./cards/card-00";
import { CARD_01_ART } from "./cards/card-01";
import { CARD_02_ART } from "./cards/card-02";
import type { CardArt } from "./render";

/**
 * Which art each card shows, by the script's card number.
 *
 * Card 11 is Module 2's ident and mirrors card 0 on purpose, so it shares card 0's art rather
 * than a copy of it. A card with no art yet shows the flat placeholder; the test that every
 * card has art lands once all twelve are drawn (tasks.md, slice 2).
 */
const CARD_ART: ReadonlyMap<number, CardArt> = new Map([
  [IDENT_CARD, CARD_00_ART],
  [1, CARD_01_ART],
  [2, CARD_02_ART],
  [END_CARD, CARD_00_ART],
]);

export function artFor(card: number): CardArt | undefined {
  return CARD_ART.get(card);
}
