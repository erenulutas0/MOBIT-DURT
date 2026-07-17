// Spoken-assistant helpers: plays server-synthesized Turkish speech (Piper via the backend) and
// holds the user's "voice nudge" (sesli bildirim) preference. One utterance at a time — starting a
// new one stops the previous, mirroring how a human assistant would interrupt itself.

import { getAssistantSpeech } from "../api";

const VOICE_NUDGE_KEY = "docsbot.voiceNudge";

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

/** Strips markdown/emoji clutter so the TTS reads prose, not symbols. */
export function cleanForSpeech(text: string): string {
  return text
    .replace(/[*_#>`~|]/g, " ")
    .replace(/https?:\/\/\S+/g, "")
    // Pictographs & symbols read as garbage — drop them.
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

export function stopSpeaking(): void {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  if (currentUrl) {
    URL.revokeObjectURL(currentUrl);
    currentUrl = null;
  }
}

/**
 * Fetches TTS audio for the text and plays it. Resolves when playback finishes (or is stopped),
 * so callers can drive a speaking indicator. Throws when the synthesizer is unavailable.
 */
export async function speakText(text: string): Promise<void> {
  const cleaned = cleanForSpeech(text);
  if (!cleaned) return;
  const blob = await getAssistantSpeech(cleaned);
  stopSpeaking();
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  currentAudio = audio;
  currentUrl = url;
  await audio.play();
  await new Promise<void>(resolve => {
    const finish = () => {
      if (currentAudio === audio) stopSpeaking();
      resolve();
    };
    audio.onended = finish;
    // stopSpeaking() pauses the element — treat that as finished too so awaits never hang.
    audio.onpause = finish;
  });
}

export function isSpeaking(): boolean {
  return currentAudio !== null && !currentAudio.paused && !currentAudio.ended;
}

export function isVoiceNudgeEnabled(): boolean {
  try {
    return window.localStorage.getItem(VOICE_NUDGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setVoiceNudgeEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(VOICE_NUDGE_KEY, enabled ? "1" : "0");
  } catch {
    // Preference simply won't persist — speech still works for this session.
  }
}
