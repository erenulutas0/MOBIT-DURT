// In-app text-size control. Scaling the root font-size makes every rem-based size (which is most of
// the UI) grow proportionally — text and spacing together — so the layout stays balanced instead of
// only the glyphs getting bigger. The choice is persisted so it survives app restarts.

const STORAGE_KEY = "docsbot.fontScale";
const BASE_FONT_PX = 16;

export type FontScaleOption = { value: number; label: string };

export const FONT_SCALE_OPTIONS: FontScaleOption[] = [
  { value: 0.9, label: "Küçük" },
  { value: 1.0, label: "Normal" },
  { value: 1.15, label: "Büyük" },
  { value: 1.3, label: "Çok Büyük" },
];

const DEFAULT_SCALE = 1.0;

function isKnownScale(value: number): boolean {
  return FONT_SCALE_OPTIONS.some(option => option.value === value);
}

export function loadFontScale(): number {
  try {
    const raw = Number(window.localStorage.getItem(STORAGE_KEY));
    return isKnownScale(raw) ? raw : DEFAULT_SCALE;
  } catch {
    return DEFAULT_SCALE;
  }
}

/** Applies the scale to the document root; call on startup and whenever the user changes it. */
export function applyFontScale(scale: number): void {
  const safe = isKnownScale(scale) ? scale : DEFAULT_SCALE;
  document.documentElement.style.fontSize = `${BASE_FONT_PX * safe}px`;
}

export function saveFontScale(scale: number): void {
  const safe = isKnownScale(scale) ? scale : DEFAULT_SCALE;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(safe));
  } catch {
    // Ignore storage failures — the scale still applies for this session.
  }
  applyFontScale(safe);
}
