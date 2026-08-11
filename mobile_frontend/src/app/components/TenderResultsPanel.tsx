import { useCallback, useEffect, useState } from "react";
import { Building2, Gavel, Loader2, MapPin, TrendingDown, Users } from "lucide-react";

import { getTenderResults, type TenderResult } from "../api";

/**
 * "Sonuçlanan İhaleler" — who took the work, for how much, against how many bidders.
 *
 * <p>The announcements bulletin tells a company what an idare wants. This one tells it what
 * somebody else got the job for, beside the idare's own estimate — which is the number every bid
 * is really priced against and the one nobody publishes in a form you can read. On an ordinary day
 * the gap runs from nothing to nearly sixty percent, and the announcement gives no clue which.
 *
 * <p>The discount is shown only where the server was willing to compute it. A tender divided into
 * kısım is awarded lot by lot: the estimate covers the whole tender, each contract covers one lot,
 * and dividing the two produces a 98% saving that is pure arithmetic fiction. Those say "kısımlara
 * bölünmüş" instead, which is a fact rather than a number.
 */

/** Turkish grouping and no kuruş: contract sums run to nine figures and the change is noise. */
function money(amount: string | null, currency: string | null): string | null {
  if (!amount) return null;
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  return `${value.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ${currency || "TRY"}`;
}

function shortDate(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" });
}

export function TenderResultsPanel({ mineOnly, province, category, bulletinType }: {
  /** Narrowed by the same watch profile as the announcements — it is the same company. */
  mineOnly: boolean;
  province: string | null;
  category: string | null;
  bulletinType: string | null;
}) {
  const [results, setResults] = useState<TenderResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setResults(await getTenderResults({ province, category, type: bulletinType, mine: mineOnly }));
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "İhale sonuçları alınamadı.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [province, category, bulletinType, mineOnly]);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Sonuçlar yükleniyor…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2.5 text-sm text-red-300">
        {error}
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="rounded-xl bg-white/[0.03] border border-white/10 px-4 py-8 text-center space-y-1.5">
        <Gavel className="w-6 h-6 text-muted-foreground mx-auto" />
        <p className="text-sm text-foreground">Bu süzgeçle sonuçlanmış ihale yok</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Sonuç ilanları her sabah bültenle birlikte gelir; süzgeci genişletmeyi deneyebilirsiniz.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {results.map(result => {
        const discount = result.discount_percent === null ? null : Number(result.discount_percent);
        const estimate = money(result.estimated_cost, result.currency);
        const amount = money(result.contract_amount, result.currency);
        return (
          <article
            key={result.id}
            className="rounded-xl bg-card border border-border overflow-hidden"
          >
            <div className="px-4 pt-3.5 pb-3 space-y-1.5">
              <p className="text-sm font-semibold text-foreground leading-snug">
                {result.title || result.ikn}
              </p>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{result.authority || "İdare belirtilmemiş"}</span>
              </p>
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                {result.province && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />{result.province}
                  </span>
                )}
                {result.bid_count !== null && (
                  <span className="flex items-center gap-1">
                    <Users className="w-3 h-3" />{result.bid_count} teklif
                  </span>
                )}
                {shortDate(result.contract_date) && <span>{shortDate(result.contract_date)}</span>}
              </div>
            </div>

            {/* The two figures side by side, because neither means much alone: an eight-million
                contract is cheap against a twelve-million estimate and dear against a seven. */}
            <div className="px-4 py-3 bg-black/20 border-t border-border grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">Sözleşme bedeli</p>
                <p className="text-sm font-semibold text-foreground tabular-nums truncate">
                  {amount || "—"}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-muted-foreground">Yaklaşık maliyet</p>
                <p className="text-sm text-muted-foreground tabular-nums truncate">
                  {estimate || "—"}
                </p>
              </div>
            </div>

            <div className="px-4 py-2.5 border-t border-border flex items-center gap-2">
              {discount !== null ? (
                <>
                  <TrendingDown className="w-3.5 h-3.5 text-primary shrink-0" />
                  <span className="text-xs text-foreground">
                    <span className="font-semibold tabular-nums">
                      %{discount.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
                    </span>
                    {" "}kırım
                  </span>
                </>
              ) : (
                // Naming the reason rather than printing a dash: "we did not compute this" and
                // "there was nothing to compute" are different, and only one of them is a defect.
                <span className="text-xs text-muted-foreground">
                  {result.partial_award
                    ? "Kısımlara bölünmüş ihale — kırım hesaplanmadı"
                    : "Kırım hesaplanamadı"}
                </span>
              )}
            </div>

            {result.winner && (
              <div className="px-4 py-2.5 border-t border-border">
                <p className="text-[11px] text-muted-foreground">Yüklenici</p>
                <p className="text-xs text-foreground leading-snug">
                  {result.winner}
                  {result.winner_province && (
                    <span className="text-muted-foreground"> · {result.winner_province}</span>
                  )}
                </p>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
