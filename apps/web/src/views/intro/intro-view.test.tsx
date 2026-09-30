import { act, fireEvent, render, screen, within } from "@testing-library/react";

import { server, installMockApi } from "../../testing/msw";
import { cardDurationMs } from "./intro-timeline";
import { END_CARD, INTRO_CARDS, captionText } from "./script";
import { IntroView } from "./intro-view";

installMockApi();

/** Every request the page makes, whether or not a handler answers it. */
let requests: string[] = [];

beforeEach(() => {
  requests = [];
  server.events.on("request:start", ({ request }) => {
    requests.push(request.url);
  });
  // The frame clock is faked along with the timers: the video runs on requestAnimationFrame.
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame", "cancelAnimationFrame", "performance", "Date"],
  });
});

afterEach(() => {
  server.events.removeAllListeners();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function advance(ms: number): void {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

/** The caption the page announces — the script's text, whole. */
function announced(): string {
  return document.querySelector("[aria-live]")?.textContent ?? "";
}

/** The part of the on-screen caption that has been typed so far. */
function typed(): string {
  const caption = screen.getByTestId("intro-caption").cloneNode(true) as HTMLElement;
  caption.querySelectorAll(".invisible").forEach((node) => node.remove());
  return caption.textContent ?? "";
}

function showsCard(index: number): boolean {
  return screen.queryByRole("img", { name: INTRO_CARDS[index]!.image }) !== null;
}

function preferReducedMotion(): void {
  vi.stubGlobal(
    "matchMedia",
    (query: string) =>
      ({
        matches: query === "(prefers-reduced-motion: reduce)",
        media: query,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

const PROMPT = "PRESS ANY KEY TO BEGIN ORIENTATION";

describe("the start gate", () => {
  it("opens on the ident and waits, with nothing to skip", () => {
    render(<IntroView />);
    advance(60_000);

    expect(screen.getByRole("heading", { name: /contractor orientation/i })).toBeInTheDocument();
    expect(screen.getByText(PROMPT)).toBeInTheDocument();
    expect(showsCard(0)).toBe(true);
    expect(announced()).toBe(captionText(INTRO_CARDS[0]!));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("starts on any key: the prompt goes and card 1 follows the ident", () => {
    render(<IntroView />);

    fireEvent.keyDown(window, { key: "a" });

    expect(screen.queryByText(PROMPT)).not.toBeInTheDocument();
    advance(cardDurationMs(0) + 100);
    expect(showsCard(1)).toBe(true);
  });

  it("starts on a click or tap", () => {
    render(<IntroView />);

    fireEvent.click(screen.getByRole("main"));

    expect(screen.queryByText(PROMPT)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Skipping is recorded." })).toBeInTheDocument();
  });
});

describe("the card sequence", () => {
  it("plays cards 1 to 10 in order, each announcing its caption word for word", () => {
    render(<IntroView />);
    fireEvent.keyDown(window, { key: "Enter" });

    for (let index = 1; index <= END_CARD; index += 1) {
      advance(cardDurationMs(index - 1));
      // A few frames past the boundary: the first frame only starts the clock, so the video
      // runs a frame behind the timers.
      advance(100);

      expect(showsCard(index)).toBe(true);
      expect(announced()).toBe(captionText(INTRO_CARDS[index]!));
    }
  });

  it("types a caption out rather than showing it whole", () => {
    render(<IntroView />);
    fireEvent.keyDown(window, { key: " " });
    advance(cardDurationMs(0) + 400);

    const caption = captionText(INTRO_CARDS[1]!);

    expect(typed().length).toBeGreaterThan(0);
    expect(typed().length).toBeLessThan(caption.length);
    expect(caption.startsWith(typed())).toBe(true);
  });

  it("ignores keys other than Escape once started", () => {
    render(<IntroView />);
    fireEvent.keyDown(window, { key: "a" });
    fireEvent.keyDown(window, { key: "b" });

    expect(screen.getByRole("button", { name: "Skipping is recorded." })).toBeInTheDocument();
    expect(showsCard(0)).toBe(true);
  });
});

describe("skip", () => {
  it("jumps to the end state and records nothing, anywhere", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(<IntroView />);
    fireEvent.keyDown(window, { key: "a" });
    advance(cardDurationMs(0) + cardDurationMs(1) + cardDurationMs(2) + 100);
    expect(showsCard(3)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Skipping is recorded." }));

    expect(showsCard(END_CARD)).toBe(true);
    expect(requests).toEqual([]);
    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe("");
  });

  it("is also on Escape", () => {
    render(<IntroView />);
    fireEvent.keyDown(window, { key: "a" });

    fireEvent.keyDown(window, { key: "Escape" });

    expect(showsCard(END_CARD)).toBe(true);
  });
});

describe("the end state", () => {
  it("holds on card 10's countdown at '4…', with nothing left to press", () => {
    render(<IntroView />);
    fireEvent.keyDown(window, { key: "a" });
    fireEvent.keyDown(window, { key: "Escape" });
    advance(600_000);

    expect(showsCard(END_CARD)).toBe(true);
    expect(typed()).toBe("Module 2 of 14 will begin in 5… 4…");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(PROMPT)).not.toBeInTheDocument();
  });

  it("is reached on its own when nobody skips", () => {
    render(<IntroView />);
    fireEvent.keyDown(window, { key: "a" });
    advance(INTRO_CARDS.reduce((sum, _card, index) => sum + cardDurationMs(index), 0) + 1000);

    expect(showsCard(END_CARD)).toBe(true);
    expect(within(screen.getByRole("main")).queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("the frame clock", () => {
  /**
   * A frame clock the test controls: frames every `frameMs` while `visible`, none while
   * hidden — which is what a browser does to a background tab.
   */
  function stubFrames(frameMs: number): { hide: () => void; show: () => void } {
    let visible = true;
    const pending = new Map<number, FrameRequestCallback>();
    let nextId = 1;

    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      const id = nextId++;
      pending.set(id, callback);
      const fire = () => {
        if (!pending.has(id)) return;
        if (!visible) return void setTimeout(fire, frameMs);
        pending.delete(id);
        callback(performance.now());
      };
      setTimeout(fire, frameMs);
      return id;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => pending.delete(id));

    const setVisibility = (state: DocumentVisibilityState) => {
      visible = state === "visible";
      Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
    };

    return { hide: () => setVisibility("hidden"), show: () => setVisibility("visible") };
  }

  afterEach(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  });

  it("keeps real time on a machine that draws five frames a second", () => {
    stubFrames(200);
    render(<IntroView />);
    fireEvent.keyDown(window, { key: "a" });

    advance(cardDurationMs(0) + 500);

    expect(showsCard(1)).toBe(true);
  });

  it("pauses while the tab is hidden, rather than jumping ahead on return", () => {
    const tab = stubFrames(16);
    render(<IntroView />);
    fireEvent.keyDown(window, { key: "a" });
    // Close enough to card 1 that any jump on return — even the one-second backstop — would
    // cross into it.
    advance(cardDurationMs(0) - 500);

    tab.hide();
    advance(600_000);
    tab.show();
    advance(100);

    expect(showsCard(0)).toBe(true);
  });
});

describe("reduced motion", () => {
  it("shows each caption whole instead of typing it", () => {
    preferReducedMotion();
    render(<IntroView />);
    fireEvent.keyDown(window, { key: "a" });
    advance(cardDurationMs(0) + 100);

    expect(showsCard(1)).toBe(true);
    expect(typed()).toBe(captionText(INTRO_CARDS[1]!));
  });
});
