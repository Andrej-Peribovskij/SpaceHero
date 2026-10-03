import "@testing-library/jest-dom/vitest";

// jsdom has no canvas: without the native `canvas` package, getContext logs "Not implemented"
// and returns null. Components must already cope with null — the intro's pixel canvas simply
// skips painting — so say so up front instead of logging an error for every render. What a
// canvas would show is tested through the pure renderer (views/intro/art/render.ts).
HTMLCanvasElement.prototype.getContext = () => null;
