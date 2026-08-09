import { useMemo, useState } from "react";

import { TURKEY_PROVINCE_PATHS, TURKEY_VIEWBOX } from "../data/turkeyProvinces";

/**
 * Where the day's tenders are, on the map.
 *
 * <p>The list answers "what is open"; this answers "is any of it near us", which is the question a
 * company with three trucks asks first. Most firms bid where they can drive, and eighty numbers in
 * a table do not show that shape — a filled map does, at a glance.
 *
 * <p>Colour is by count, in five steps rather than a smooth gradient: a continuous scale looks
 * precise and reads as nothing, while five bands can be told apart and matched to the legend.
 * Provinces with no tenders are left in the empty colour rather than hidden, because "nothing in
 * Sivas today" is an answer and a missing province is a bug.
 */

/** Five steps, dark to light, over the same amber the bulletin uses elsewhere. */
const STEPS = ["#fef3c7", "#fcd34d", "#f59e0b", "#d97706", "#92400e"];
const EMPTY = "#f1f5f9";

export function TurkeyTenderMap({ counts, selected, onSelect }: {
  counts: Record<string, number>;
  selected: string | null;
  onSelect: (province: string | null) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);

  /**
   * Band boundaries from the data rather than fixed numbers: a quiet Tuesday tops out at four
   * tenders in a province and a Monday at forty, and a scale that cannot tell those apart paints
   * the whole country one colour on one of the two days.
   */
  const bands = useMemo(() => {
    const values = Object.values(counts).filter(count => count > 0).sort((a, b) => a - b);
    if (values.length === 0) return [];
    return STEPS.map((_, index) =>
      values[Math.min(values.length - 1, Math.floor((values.length * (index + 1)) / STEPS.length) - 1)]);
  }, [counts]);

  const colourFor = (count: number) => {
    if (!count) return EMPTY;
    const index = bands.findIndex(edge => count <= edge);
    return STEPS[index === -1 ? STEPS.length - 1 : index];
  };

  const shown = hovered ?? selected;
  const total = useMemo(
    () => Object.values(counts).reduce((sum, count) => sum + count, 0), [counts]);

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-baseline justify-between mb-2">
        <p className="text-sm font-semibold text-slate-800">İllere göre açık ihaleler</p>
        <p className="text-xs text-slate-500">
          {shown ? `${shown}: ${counts[shown] ?? 0} ihale` : `${total} ihale · 81 il`}
        </p>
      </div>

      <svg
        viewBox={TURKEY_VIEWBOX}
        className="w-full h-auto"
        role="img"
        aria-label="Türkiye haritası: illere göre açık ihale sayısı"
      >
        {Object.entries(TURKEY_PROVINCE_PATHS).map(([province, paths]) => {
          const count = counts[province] ?? 0;
          const isSelected = selected === province;
          return (
            <g
              key={province}
              data-province={province}
              onMouseEnter={() => setHovered(province)}
              onMouseLeave={() => setHovered(null)}
              // Clicking a province with nothing in it would filter the list down to an empty
              // screen, which reads as a broken filter rather than an empty province.
              onClick={() => count > 0 && onSelect(isSelected ? null : province)}
              className={count > 0 ? "cursor-pointer" : "cursor-default"}
            >
              <title>{`${province}: ${count} açık ihale`}</title>
              {paths.map((d, index) => (
                <path
                  key={index}
                  d={d}
                  fill={colourFor(count)}
                  stroke={isSelected ? "#0f172a" : "#ffffff"}
                  strokeWidth={isSelected ? 1.6 : 0.5}
                  opacity={hovered && hovered !== province ? 0.75 : 1}
                />
              ))}
            </g>
          );
        })}
      </svg>

      <div className="flex items-center gap-2 mt-2">
        <span className="text-[11px] text-slate-500">az</span>
        {[EMPTY, ...STEPS].map(colour => (
          <span key={colour} className="h-2.5 w-6 rounded-sm border border-slate-200"
            style={{ backgroundColor: colour }} />
        ))}
        <span className="text-[11px] text-slate-500">çok</span>
        {selected && (
          <button onClick={() => onSelect(null)} className="ml-auto text-xs text-amber-700 underline">
            {selected} filtresini kaldır
          </button>
        )}
      </div>
    </div>
  );
}
