import { act, fireEvent, render, screen, within } from "@testing-library/react";

import { server, installMockApi } from "../../testing/msw";
import { GLITCH_SILENCE_MS, cardDurationMs, glitchMs, snoreMs } from "./intro-timeline";
import { recordingIntroAudio } from "./music/recording-intro-audio";
import { END_CARD, INTRO_CARDS, SNORE_CARD, captionText } from "./script";
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

/** The part of the caption typed so far: what the screen's canvas is drawing. */
function typed(): string {
  return document.querySelector("[data-caption-shown]")?.getAttribute("data-caption-shown") ?? "";
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
const CONTINUE_PROMPT = "PRESS ANY KEY TO CONTINUE ORIENTATION";

/**
 * On the last card, Module 2's ident, before Joe's punch. Its picture is card 0's by design, so the
 * picture alone cannot tell the end from the start: the continue prompt and the Module 2 caption
 * can.
 */
function onModule2(): boolean {
  return screen.queryByText(CONTINUE_PROMPT) !== null && announced() === captionText(INTRO_CARDS[END_CARD]!);
}

/** Over: Joe has punched the screen, and the caption, the prompt and the skip have gone with it. */
function over(): boolean {
  return (
    showsCard(END_CARD) &&
    announced() === "" &&
    screen.queryByText(CONTINUE_PROMPT) === null &&
    within(screen.getByRole("main")).queryByRole("button") === null
  );
}

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

  it.each([
    ["Escape", {}],
    ["Shift", { shiftKey: true }],
    ["Control", { ctrlKey: true }],
    ["Alt", { altKey: true }],
    ["Meta", { metaKey: true }],
    ["r", { ctrlKey: true }],
    ["Tab", { altKey: true }],
  ])("does not start on %s %o: no audio permission, or a shortcut on its way elsewhere", (key, modifiers) => {
    render(<IntroView />);

    fireEvent.keyDown(window, { key, ...modifiers });

    expect(screen.getByText(PROMPT)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("still starts on a shifted key, which is a real key press", () => {
    render(<IntroView />);

    fireEvent.keyDown(window, { key: "A", shiftKey: true });

    expect(screen.queryByText(PROMPT)).not.toBeInTheDocument();
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
  it("jumps to Module 2's ident, where the ending plays, and records nothing, anywhere", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    render(<IntroView />);
    fireEvent.keyDown(window, { key: "a" });
    advance(cardDurationMs(0) + cardDurationMs(1) + cardDurationMs(2) + 100);
    expect(showsCard(3)).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Skipping is recorded." }));

    expect(onModule2()).toBe(true);
    expect(requests).toEqual([]);
    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe("");
  });

  it("keeps keyboard focus on the video when the focused skip button goes away", () => {
    render(<IntroView />);
    fireEvent.keyDown(window, { key: "a" });
    const button = screen.getByRole("button", { name: "Skipping is recorded." });
    button.focus();

    fireEvent.click(button);

    expect(button).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole("main"));
  });

  it("is also on Escape", () => {
    render(<IntroView />);
    fireEvent.keyDown(window, { key: "a" });

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onModule2()).toBe(true);
  });
});

describe("the end state", () => {
  it("shows Module 2's ident whole, asking for a key that no key answers, with nothing left to skip", () => {
    render(<IntroView />);
    fireEvent.keyDown(window, { key: "a" });
    fireEvent.keyDown(window, { key: "Escape" });
    advance(1000);
    fireEvent.keyDown(window, { key: "a" });
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("main"));

    expect(onModule2()).toBe(true);
    expect(showsCard(END_CARD)).toBe(true);
    expect(typed()).toBe("ABSOLUTE CONNECTIONS · Contractor Orientation\nModule 2 of 14: What's the Drill");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(PROMPT)).not.toBeInTheDocument();
  });

  it("ends once Joe has punched the screen, and holds there, whatever is pressed", () => {
    render(<IntroView />);
    fireEvent.keyDown(window, { key: "a" });
    fireEvent.keyDown(window, { key: "Escape" });

    advance(INTRO_CARDS[END_CARD]!.punchAtMs! - 200);
    expect(onModule2()).toBe(true);

    advance(cardDurationMs(END_CARD));
    expect(over()).toBe(true);

    advance(600_000);
    fireEvent.keyDown(window, { key: "a" });
    fireEvent.click(screen.getByRole("main"));
    expect(over()).toBe(true);
  });

  it("goes from Joe's window straight to Module 2's ident, with no black card between them", () => {
    render(<IntroView />);
    fireEvent.keyDown(window, { key: "a" });
    const toModule2 = INTRO_CARDS.slice(0, END_CARD).reduce((sum, _card, index) => sum + cardDurationMs(index), 0);

    advance(toModule2 - 100);
    expect(showsCard(SNORE_CARD)).toBe(true);
    expect(announced()).toBe(captionText(INTRO_CARDS[SNORE_CARD]!));

    advance(200);
    expect(onModule2()).toBe(true);
  });

  it("is reached on its own when nobody skips", () => {
    render(<IntroView />);
    fireEvent.keyDown(window, { key: "a" });
    advance(INTRO_CARDS.slice(0, END_CARD).reduce((sum, _card, index) => sum + cardDurationMs(index), 0) + 1000);
    expect(onModule2()).toBe(true);
    expect(within(screen.getByRole("main")).queryByRole("button")).not.toBeInTheDocument();

    advance(cardDurationMs(END_CARD));
    expect(over()).toBe(true);
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

describe("the music", () => {
  /** When card `index` starts, counted from the key press. */
  const cardStartMs = (index: number) =>
    INTRO_CARDS.slice(0, index).reduce((sum, _card, before) => sum + cardDurationMs(before), 0);

  /** The Ganymede card: the one card with a glitch. */
  const GANYMEDE_CARD = INTRO_CARDS.findIndex((card) => card.glitchAtChar !== undefined);

  /** Lets a few frames go by: the first frame only starts the clock, so the video runs behind the timers. */
  const FRAMES = 100;

  function playWithMusic() {
    const audio = recordingIntroAudio();
    const view = render(<IntroView openAudio={() => audio} />);
    return { audio, view };
  }

  it("plays nothing before the gate, whatever is pressed that does not open it", () => {
    const opened = vi.fn(recordingIntroAudio);
    render(<IntroView openAudio={opened} />);

    advance(60_000);
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.keyDown(window, { key: "r", ctrlKey: true });

    expect(opened).not.toHaveBeenCalled();
  });

  it("opens and starts inside the key press, while the browser still counts it as the player's", () => {
    const { audio } = playWithMusic();

    fireEvent.keyDown(window, { key: "a" });

    expect(audio.calls).toEqual(["start"]);
  });

  it("works the music out ahead while the gate waits, not inside the key press", () => {
    const prepare = vi.fn();
    render(<IntroView openAudio={recordingIntroAudio} prepareAudio={prepare} />);
    expect(prepare).not.toHaveBeenCalled();

    advance(FRAMES);
    expect(prepare).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "a" });
    advance(FRAMES);
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("works nothing out for an intro that has already left the screen", () => {
    const prepare = vi.fn();
    const view = render(<IntroView openAudio={recordingIntroAudio} prepareAudio={prepare} />);

    view.unmount();
    advance(FRAMES);

    expect(prepare).not.toHaveBeenCalled();
  });

  it("plays on when working the music out ahead fails", () => {
    const audio = recordingIntroAudio();
    const broken = () => {
      throw new Error("RangeError");
    };
    render(<IntroView openAudio={() => audio} prepareAudio={broken} />);

    advance(FRAMES);
    fireEvent.keyDown(window, { key: "a" });

    expect(audio.calls).toEqual(["start"]);
  });

  it("starts on a click too", () => {
    const { audio } = playWithMusic();

    fireEvent.click(screen.getByRole("main"));

    expect(audio.calls).toEqual(["start"]);
  });

  it("drops out as the Ganymede line finishes typing, and comes back while card 6 holds", () => {
    const { audio } = playWithMusic();
    fireEvent.keyDown(window, { key: "a" });
    const glitch = cardStartMs(GANYMEDE_CARD) + glitchMs(GANYMEDE_CARD)!;

    advance(glitch - 200);
    expect(audio.calls).toEqual(["start"]);

    advance(200 + FRAMES);
    expect(audio.calls).toEqual(["start", "dropOut"]);

    advance(GLITCH_SILENCE_MS);
    expect(audio.calls).toEqual(["start", "dropOut", "resume"]);
    expect(showsCard(GANYMEDE_CARD)).toBe(true);
  });

  it("still drops out under reduced motion, where the picture does not flash: the clue survives", () => {
    preferReducedMotion();
    const { audio } = playWithMusic();
    fireEvent.keyDown(window, { key: "a" });

    advance(cardStartMs(GANYMEDE_CARD) + glitchMs(GANYMEDE_CARD)! + FRAMES);

    expect(audio.calls).toEqual(["start", "dropOut"]);
  });

  it("snores over the music on card 9, then Module 2's ident cuts the loop back to its top, Joe wakes to it, and punches it dead", () => {
    const { audio } = playWithMusic();
    const { wakeAtMs, punchAtMs } = INTRO_CARDS[END_CARD]!;
    fireEvent.keyDown(window, { key: "a" });

    advance(cardStartMs(SNORE_CARD) + snoreMs(SNORE_CARD)! - FRAMES);
    expect(showsCard(SNORE_CARD)).toBe(true);
    expect(audio.calls).toEqual(["start", "dropOut", "resume"]);

    // The snore comes over the music: nothing stops it.
    advance(2 * FRAMES);
    expect(audio.calls).toEqual(["start", "dropOut", "resume", "snore"]);

    advance(cardStartMs(END_CARD) - cardStartMs(SNORE_CARD) - snoreMs(SNORE_CARD)!);
    expect(onModule2()).toBe(true);
    expect(audio.calls).toEqual(["start", "dropOut", "resume", "snore", "stop", "start"]);

    advance(wakeAtMs!);
    expect(audio.calls.slice(-1)).toEqual(["wake"]);

    advance(punchAtMs! - wakeAtMs!);
    expect(audio.calls.slice(-2)).toEqual(["wake", "punch"]);

    // Over, the video holds in silence, and no input touches it.
    advance(600_000);
    fireEvent.keyDown(window, { key: "a" });
    fireEvent.click(screen.getByRole("main"));

    expect(audio.calls).toEqual(["start", "dropOut", "resume", "snore", "stop", "start", "wake", "punch"]);
  });

  it("on skip, stops Module 1's music and starts Module 2's from the top, with no snore, and Joe still wakes and punches it", () => {
    const { audio } = playWithMusic();
    fireEvent.keyDown(window, { key: "a" });
    advance(cardStartMs(3) + FRAMES);

    fireEvent.click(screen.getByRole("button", { name: "Skipping is recorded." }));
    advance(600_000);

    // One cut, once: Module 1's loop stopped and Module 2's started, not stopped twice.
    expect(audio.calls).toEqual(["start", "stop", "start", "wake", "punch"]);
  });

  it("on skip during the snore, cuts it as Module 2's music starts", () => {
    const { audio } = playWithMusic();
    fireEvent.keyDown(window, { key: "a" });
    advance(cardStartMs(SNORE_CARD) + snoreMs(SNORE_CARD)! + FRAMES);
    expect(audio.calls.slice(-1)).toEqual(["snore"]);

    fireEvent.keyDown(window, { key: "Escape" });

    expect(audio.calls.slice(-2)).toEqual(["stop", "start"]);
  });

  describe("in a hidden tab", () => {
    function setVisibility(state: DocumentVisibilityState): void {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: state });
      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
    }

    afterEach(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    });

    it("pauses the music with the video, and goes on with it when the tab is back", () => {
      const { audio } = playWithMusic();
      fireEvent.keyDown(window, { key: "a" });

      setVisibility("hidden");
      expect(audio.calls).toEqual(["start", "pause"]);

      setVisibility("visible");
      expect(audio.calls).toEqual(["start", "pause", "unpause"]);
    });

    it("opens nothing when the tab is hidden before the gate", () => {
      const opened = vi.fn(recordingIntroAudio);
      render(<IntroView openAudio={opened} />);

      setVisibility("hidden");
      setVisibility("visible");

      expect(opened).not.toHaveBeenCalled();
    });

    it("stops listening once the intro leaves the screen", () => {
      const { audio, view } = playWithMusic();
      fireEvent.keyDown(window, { key: "a" });
      view.unmount();

      setVisibility("hidden");

      expect(audio.calls).toEqual(["start", "close"]);
    });
  });

  it("lets go of the audio when the intro leaves the screen", () => {
    const { audio, view } = playWithMusic();
    fireEvent.keyDown(window, { key: "a" });

    view.unmount();

    expect(audio.calls).toEqual(["start", "close"]);
  });

  describe("when the browser cannot play it", () => {
    function playsEveryCard(): void {
      fireEvent.keyDown(window, { key: "a" });

      for (let index = 1; index <= END_CARD; index += 1) {
        advance(cardDurationMs(index - 1));
        advance(FRAMES);
        expect(showsCard(index)).toBe(true);
        expect(announced()).toBe(captionText(INTRO_CARDS[index]!));
      }
      expect(onModule2()).toBe(true);
    }

    it("plays every card, silently and with no error shown, where AudioContext throws", () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.stubGlobal(
        "AudioContext",
        class {
          constructor() {
            throw new Error("NotSupportedError");
          }
        },
      );
      render(<IntroView />);

      playsEveryCard();

      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(error).not.toHaveBeenCalled();
    });

    it("plays every card where there is no AudioContext at all", () => {
      vi.stubGlobal("AudioContext", undefined);
      render(<IntroView />);

      playsEveryCard();
    });

    it("plays every card, and lets go of the music for good, when it breaks partway", () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});
      const audio = recordingIntroAudio();
      const broken = {
        ...audio,
        dropOut: () => {
          throw new Error("InvalidStateError");
        },
      };
      render(<IntroView openAudio={() => broken} />);

      playsEveryCard();

      // Closed the moment it broke, so the loop it had started cannot play on; nothing after.
      expect(audio.calls).toEqual(["start", "close"]);
      expect(error).not.toHaveBeenCalled();
    });
  });
});

describe("without a canvas to paint on", () => {
  it("shows the prompt and the caption as text, so the player can still see how to start", () => {
    // jsdom's canvas, like a browser that refuses one, gives no 2D context (vitest.setup.ts).
    render(<IntroView />);

    expect(screen.getByText(PROMPT)).not.toHaveClass("sr-only");
    expect(document.querySelector("[aria-live]")).not.toHaveClass("sr-only");
  });

  it("goes dark with the screen when Joe punches it: no caption and no prompt left showing", () => {
    render(<IntroView />);
    fireEvent.keyDown(window, { key: "a" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(announced()).toBe(captionText(INTRO_CARDS[END_CARD]!));

    advance(cardDurationMs(END_CARD) + 100);

    expect(announced()).toBe("");
    expect(screen.queryByText(CONTINUE_PROMPT)).not.toBeInTheDocument();
  });

  it("keeps that text for assistive technology alone when the screen can paint it", () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      createImageData: (width: number, height: number) => ({ data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: () => {},
    } as unknown as CanvasRenderingContext2D);
    render(<IntroView />);

    expect(screen.getByText(PROMPT)).toHaveClass("sr-only");
    expect(document.querySelector("[aria-live]")).toHaveClass("sr-only");
  });
});

describe("jumping card by card, in the dev server only", () => {
  /** Where a test puts the page: an address with or without `?card=N`. */
  function at(search: string): void {
    window.history.replaceState(null, "", `/${search}`);
  }

  afterEach(() => at(""));

  it("jumps to the next card on →, back on ←, and keeps the card in the address", () => {
    render(<IntroView debugSeek />);
    fireEvent.keyDown(window, { key: "a" });

    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(showsCard(2)).toBe(true);
    expect(window.location.search).toBe("?card=2");

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(showsCard(1)).toBe(true);
    expect(window.location.search).toBe("?card=1");

    // From the start of the card: it plays on to the next one in its own time.
    advance(cardDurationMs(1) + 100);
    expect(showsCard(2)).toBe(true);
  });

  it("starts at the card the address names, once a key opens the gate", () => {
    at("?card=6");
    const audio = recordingIntroAudio();
    render(<IntroView debugSeek openAudio={() => audio} />);

    expect(showsCard(0)).toBe(true);
    expect(screen.getByText(PROMPT)).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "a" });
    expect(showsCard(6)).toBe(true);
    expect(audio.calls).toEqual(["start", "stop", "start"]);
  });

  it("starts Module 2's music once on a jump to its ident, not once for the jump and again for the card", () => {
    at(`?card=${END_CARD}`);
    const audio = recordingIntroAudio();
    render(<IntroView debugSeek openAudio={() => audio} />);

    fireEvent.keyDown(window, { key: "a" });

    expect(onModule2()).toBe(true);
    expect(audio.calls).toEqual(["start", "stop", "start"]);
  });

  it.each(["?card=0", "?card=99", "?card=six"])("starts at the beginning for %s, a card that is not one to jump to", (search) => {
    at(search);
    render(<IntroView debugSeek />);
    fireEvent.keyDown(window, { key: "a" });

    expect(showsCard(0)).toBe(true);
  });

  it("restarts the music from the top on a jump, and a jump during the snore cuts it", () => {
    at(`?card=${SNORE_CARD}`);
    const audio = recordingIntroAudio();
    render(<IntroView debugSeek openAudio={() => audio} />);
    fireEvent.keyDown(window, { key: "a" });
    expect(audio.calls).toEqual(["start", "stop", "start"]);

    advance(snoreMs(SNORE_CARD)! + 100);
    expect(audio.calls.slice(-1)).toEqual(["snore"]);

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(showsCard(SNORE_CARD - 1)).toBe(true);
    expect(audio.calls.slice(-2)).toEqual(["stop", "start"]);
  });

  it("goes back from Module 2's ident to Joe's window, and no further forward", () => {
    render(<IntroView debugSeek />);
    fireEvent.keyDown(window, { key: "a" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onModule2()).toBe(true);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(onModule2()).toBe(true);

    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(showsCard(SNORE_CARD)).toBe(true);
  });

  it("is not there at all outside the dev server: arrows do nothing, and the address is not read", () => {
    at("?card=6");
    render(<IntroView debugSeek={false} />);
    fireEvent.keyDown(window, { key: "a" });
    expect(showsCard(0)).toBe(true);

    fireEvent.keyDown(window, { key: "ArrowRight" });
    expect(showsCard(0)).toBe(true);
    expect(window.location.search).toBe("?card=6");
  });
});
