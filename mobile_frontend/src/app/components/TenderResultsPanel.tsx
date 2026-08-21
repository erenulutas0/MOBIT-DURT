import { useCallback, useEffect, useState } from "react";
import {
  Building2, Gavel, History, Loader2, MapPin, TrendingDown, Users, X,
} from "lucide-react";

import {
  getAuthorityProfile, getTenderResultDetail, getTenderResults,
  type AuthorityProfile, type TenderResult,
} from "../api";
import { DiscountSourceNote } from "./DiscountSourceNote";

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

/**
 * How this idare has been letting work, shown above the announcement it was opened from.
 *
 * <p>"What did this tender go for" is a fact; "what does this buyer usually pay" is the question
 * somebody actually has before pricing a bid. The sample size is printed beside the figure rather
 * than behind it, and below three usable awards there is no figure at all — a middle drawn from
 * two contracts is an anecdote, and dressing it up as a habit is the same failure as inventing a
 * discount for a lot award.
 */
function AuthorityHistory({ profile }: { profile: AuthorityProfile }) {
  const median = profile.median_discount === null ? null : Number(profile.median_discount);
  const bidders = profile.average_bidders === null ? null : Number(profile.average_bidders);
  const percent = (value: number) =>
    `%${value.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`;

  return (
    <section className="px-4 py-3 border-b border-border bg-white/[0.02] space-y-2.5">
      <div className="flex items-center gap-2">
        <History className="w-3.5 h-3.5 text-primary shrink-0" />
        <p className="text-xs font-semibold text-foreground">Bu idarenin geçmişi</p>
      </div>

      {median !== null ? (
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-lg font-semibold text-foreground tabular-nums">
            {percent(median)}
          </span>
          <span className="text-xs text-muted-foreground">
            ortanca kırım · {profile.sample_size} ihalede
          </span>
          {profile.lowest_discount !== null && profile.highest_discount !== null && (
            <span className="text-[11px] text-muted-foreground tabular-nums">
              ({percent(Number(profile.lowest_discount))} – {percent(Number(profile.highest_discount))})
            </span>
          )}
        </div>
      ) : (
        // Naming the shortage instead of printing a dash: the reader can tell "we have not seen
        // enough yet" from "this buyer gives nothing away", and those are opposite conclusions.
        <p className="text-xs text-muted-foreground leading-relaxed">
          {profile.sample_size === 0
            ? "Bu idare için kırım hesaplanabilen sonuç yok."
            : `Ortanca kırım için henüz yeterli veri yok — ${profile.sample_size} ihale. Sonuçlar her gün birikiyor.`}
        </p>
      )}

      {/* Only where a figure was actually printed: a note under "not enough data yet" would be
          attributing a number that is not there. */}
      {median !== null && <DiscountSourceNote />}

      <p className="text-[11px] text-muted-foreground">
        Toplam {profile.total_awards} sözleşme
        {bidders !== null && ` · ortalama ${bidders.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} teklif`}
      </p>

      {profile.top_winners.length > 0 && (
        <div className="space-y-1 pt-0.5">
          <p className="text-[11px] text-muted-foreground">En çok iş alanlar</p>
          {profile.top_winners.slice(0, 3).map(entry => (
            <p key={entry.winner} className="text-[11px] text-foreground leading-snug">
              {entry.winner}
              <span className="text-muted-foreground"> · {entry.awards} sözleşme</span>
            </p>
          ))}
        </div>
      )}
    </section>
  );
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
  const [opened, setOpened] = useState<{ result: TenderResult; body: string } | null>(null);
  const [profile, setProfile] = useState<AuthorityProfile | null>(null);

  const open = useCallback(async (result: TenderResult) => {
    try {
      const detail = await getTenderResultDetail(result.id);
      setOpened({ result: detail.result, body: detail.body });
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Sonuç ilanı açılamadı.");
      return;
    }
    // Fetched after the sheet is already up and allowed to fail on its own: the printed
    // announcement is what the tap asked for, and the buyer's history is a bonus on top of it.
    setProfile(null);
    if (result.authority) {
      try {
        setProfile(await getAuthorityProfile(result.authority));
      } catch {
        setProfile(null);
      }
    }
  }, []);

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
            onClick={() => void open(result)}
            className="rounded-xl bg-card border border-border overflow-hidden active:scale-[0.99] transition-transform cursor-pointer"
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

      {opened && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-end" onClick={() => setOpened(null)}>
          <div
            className="w-full max-h-[85vh] bg-background rounded-t-2xl border-t border-border flex flex-col"
            onClick={event => event.stopPropagation()}
          >
            <div className="px-4 pt-4 pb-3 border-b border-border flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground leading-snug">
                  {opened.result.title || opened.result.ikn}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {opened.result.ikn}
                  {opened.result.procedure && ` · ${opened.result.procedure}`}
                </p>
              </div>
              <button onClick={() => setOpened(null)} className="p-1 text-muted-foreground active:scale-95"
                aria-label="Kapat">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              {profile && <AuthorityHistory profile={profile} />}
              {/* As printed, whitespace and all. The card's figures were read out of this text, and
                  somebody deciding what to bid is entitled to check them against the bulletin's own
                  words rather than take a parser's word for it. */}
              <pre className="px-4 py-3 text-[11px] text-foreground whitespace-pre-wrap font-sans leading-relaxed">
                {opened.body}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
