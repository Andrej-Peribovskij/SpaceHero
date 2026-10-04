import type { IntroAudio } from "./intro-audio";

export type IntroAudioCall = keyof IntroAudio;

/** An `IntroAudio` for tests: plays nothing, and remembers every call in order. */
export interface RecordingIntroAudio extends IntroAudio {
  readonly calls: readonly IntroAudioCall[];
}

export function recordingIntroAudio(): RecordingIntroAudio {
  const calls: IntroAudioCall[] = [];
  const record = (call: IntroAudioCall) => () => void calls.push(call);

  return {
    calls,
    start: record("start"),
    dropOut: record("dropOut"),
    resume: record("resume"),
    stop: record("stop"),
    snore: record("snore"),
    wake: record("wake"),
    pause: record("pause"),
    unpause: record("unpause"),
    close: record("close"),
  };
}
