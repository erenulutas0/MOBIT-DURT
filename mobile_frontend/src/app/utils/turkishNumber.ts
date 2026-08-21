/**
 * The two halves of one format contract: what a stored number looks like in a Turkish input box,
 * and how that box's text becomes a stored number again.
 *
 * <p>They live together because they only work as a pair. The bug that produced them had the two
 * halves disagreeing: the server's `0.85` was written into the box verbatim, and saving re-read it
 * as Turkish, where a dot is a thousands separator — so an untouched cari oran was posted back as
 * `85`. Every ratio and every amount grew a hundredfold each time the form was saved for an
 * unrelated reason, and nothing on screen said so.
 *
 * <p>Formatted from the string rather than through Number: an amount is NUMERIC(18,2), which runs
 * past what a double holds exactly, and a format helper is the last place that should quietly
 * round. Every test in this file is a round trip, because "looks right" is not the property that
 * matters — `parseTurkishNumber(formatTurkishNumber(x)) === x` is.
 */

/** Server number ("0.850", "6200000") to what belongs in the box ("0,85", "6.200.000"). */
export function formatTurkishNumber(raw: string | number | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  const text = String(raw).trim();
  // Anything that is not a plain decimal is passed through untouched — a date or a free-text
  // subject must never be regrouped, and a value we cannot read is better shown than mangled.
  if (!/^-?\d+(\.\d+)?$/.test(text)) return text;

  const negative = text.startsWith("-");
  const [whole, fraction = ""] = text.replace("-", "").split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  // NUMERIC(6,3) hands back "0.850"; the trailing zero is noise in a box a person types into, and
  // dropping it is safe because it changes the text, not the number.
  const kept = fraction.replace(/0+$/, "");
  return `${negative ? "-" : ""}${grouped}${kept ? `,${kept}` : ""}`;
}

/** What is in the box ("0,85", "6.200.000") to a server number ("0.85", "6200000"). */
export function parseTurkishNumber(value: string): string | null {
  const cleaned = value.trim().replace(/\./g, "").replace(",", ".");
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? String(parsed) : null;
}
