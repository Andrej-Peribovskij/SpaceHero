/**
 * Whether this browser gives a canvas a 2D context to paint the screen into. Without one — a
 * hardened privacy mode, a crashed GPU process, some embedded web views — the screen paints
 * nothing, and the view shows its text instead.
 */
export function canvasDraws(): boolean {
  return document.createElement("canvas").getContext("2d") !== null;
}
