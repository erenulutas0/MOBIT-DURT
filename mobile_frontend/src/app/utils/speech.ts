// Spoken-assistant helpers: plays server-synthesized Turkish speech (Piper via the backend) and
// holds the user's "voice nudge" (sesli bildirim) preference. One utterance at a time — starting a
// new one stops the previous, mirroring how a human assistant would interrupt itself.

import { getAssistantSpeech } from "../api";

const VOICE_NUDGE_KEY = "docsbot.voiceNudge";

let currentAudio: HTMLAudioElement | null = null;
let currentUrl: string | null = null;

// Piper reads letter-by-letter Turkish ("AI" → "a ı"), which sounds wrong for common English
// tech terms. Rewrite them phonetically before synthesis. Word-boundary matched and
// case-sensitive where casing matters, so Turkish words are never touched.
const PRONUNCIATIONS: Array<[RegExp, string]> = [
  [/\bAI\b/g, "ey-ay"],
  [/\bIT\b/g, "ay-ti"],
  [/\bOK\b/gi, "okey"],
  [/\bWhatsApp\b/gi, "vatsap"],
  [/\be-?mail\b/gi, "i-meyl"],
  [/\bonline\b/gi, "onlayn"],
  [/\boffline\b/gi, "oflayn"],
  [/\bdeadline\b/gi, "dedlayn"],
  [/\bupdate\b/gi, "apdeyt"],
  [/\blink\b/gi, "link"],
  // Tech / business terms that otherwise get read letter-by-letter in Turkish.
  [/\bintegration\b/gi, "integreyşın"],
  [/\bscaling\b/gi, "skeyling"],
  [/\bdeployment\b/gi, "diploymınt"],
  [/\bdeploy\b/gi, "diploy"],
  [/\bsoftware\b/gi, "softver"],
  [/\bhardware\b/gi, "hardver"],
  [/\bserver\b/gi, "sörvır"],
  [/\bdatabase\b/gi, "deytabeys"],
  [/\bbackup\b/gi, "bekap"],
  [/\bfeedback\b/gi, "fiidbek"],
  [/\bmeeting\b/gi, "miiting"],
  [/\bbudget\b/gi, "bacıt"],
  [/\bupload\b/gi, "aplod"],
  [/\bdownload\b/gi, "davnlod"],
  [/\bdashboard\b/gi, "deşbord"],
  [/\breview\b/gi, "rivyu"],
  [/\brelease\b/gi, "riliis"],
];

/** Strips markdown/emoji clutter and fixes English-term pronunciation so the TTS reads prose. */
export function cleanForSpeech(text: string): string {
  let cleaned = text
    .replace(/[*_#>`~|]/g, " ")
    .replace(/https?:\/\/\S+/g, "")
    // Pictographs & symbols read as garbage — drop them.
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu, " ");
  for (const [pattern, replacement] of PRONUNCIATIONS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  // Long texts both take ages to synthesize on the VPS CPU and used to be chopped mid-word at the
  // cap. Cut at the last sentence boundary before the cap instead, so speech always ends cleanly.
  const MAX_LENGTH = 600;
  if (cleaned.length > MAX_LENGTH) {
    const head = cleaned.slice(0, MAX_LENGTH);
    const lastSentenceEnd = Math.max(
      head.lastIndexOf(". "), head.lastIndexOf("! "), head.lastIndexOf("? "));
    cleaned = lastSentenceEnd > 200 ? head.slice(0, lastSentenceEnd + 1) : head;
  }
  return cleaned;
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

async function fetchSpeechBlob(text: string): Promise<Blob | null> {
  const cleaned = cleanForSpeech(text);
  if (!cleaned) return null;
  return getAssistantSpeech(cleaned);
}

async function playBlob(blob: Blob): Promise<void> {
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

/**
 * Fetches TTS audio for the text and plays it. Resolves when playback finishes (or is stopped),
 * so callers can drive a speaking indicator. Throws when the synthesizer is unavailable.
 */
export async function speakText(text: string): Promise<void> {
  const blob = await fetchSpeechBlob(text);
  if (blob) await playBlob(blob);
}

export function isSpeaking(): boolean {
  return currentAudio !== null && !currentAudio.paused && !currentAudio.ended;
}

// Long-form narration: synthesize sentence-grouped chunks sequentially so arbitrarily long reports
// are read in full (each Piper request stays small and fast). A new speakLong/stop invalidates the
// running sequence via the token.
let sequenceToken = 0;

function buildChunks(text: string, maxLength: number): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current && (current.length + sentence.length + 1) > maxLength) {
      chunks.push(current);
      current = sentence;
    } else {
      current = current ? `${current} ${sentence}` : sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function speakLong(text: string): Promise<void> {
  const token = ++sequenceToken;
  // Short chunks synthesize fast even on a CPU-capped Piper; the pipeline below prefetches the
  // next chunk WHILE the current one plays, so there are no 10-15s gaps mid-report.
  const chunks = buildChunks(text, 260);
  if (chunks.length === 0) return;
  let blob: Blob | null;
  try {
    blob = await fetchSpeechBlob(chunks[0]);
  } catch (firstError) {
    // One retry for the opening chunk; if it fails twice, surface the error to the caller.
    await new Promise(resolve => setTimeout(resolve, 2000));
    if (token !== sequenceToken) return;
    blob = await fetchSpeechBlob(chunks[0]);
  }
  for (let index = 0; index < chunks.length; index += 1) {
    if (token !== sequenceToken || !blob) return;
    const nextPromise = index + 1 < chunks.length
      ? fetchSpeechBlob(chunks[index + 1]).catch(() => null)
      : null;
    await playBlob(blob);
    if (token !== sequenceToken) return;
    if (!nextPromise) return;
    blob = await nextPromise;
    if (!blob) {
      // Prefetch failed (rate limit / blip): one paced retry, then end gracefully mid-report.
      await new Promise(resolve => setTimeout(resolve, 2000));
      if (token !== sequenceToken) return;
      blob = await fetchSpeechBlob(chunks[index + 1]).catch(() => null);
    }
  }
}

/** Stops current audio AND cancels any in-flight speakLong sequence. */
export function stopAllSpeech(): void {
  sequenceToken++;
  stopSpeaking();
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
