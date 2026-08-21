import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft, CircleHelp, Clock, Loader2, Swords, Trophy, TrendingDown,
} from "lucide-react";

import { getBidMemory, type BidMemory, type BidOutcomeRow } from "../api";

/**
 * "Neden kaybediyoruz?" — the company's own bids beside what the bulletin later said happened.
 *
 * <p>This is the one screen no competing service can build. They all read the same public bulletin
 * and can say what a job went for; none of them knows what <em>this</em> company offered, because
 * that number never leaves the company. Put the two together and the public record becomes a
 * private lesson: three percent over, for the third time, against the same firm.
 *
 * <p>Nothing is summarised below three comparable losses. Two near misses are an anecdote, and
 * printing a median over them would be the same failure as inventing a discount for a lot award —
 * a figure that looks like knowledge and is a coin flip.
 */

const STATUS: Record<BidOutcomeRow["status"], { label: string; icon: typeof Trophy; tone: string }> = {
  WON: { label: "Kazandık", icon: Trophy, tone: "text-primary" },
  LOST: { label: "Kaybettik", icon: TrendingDown, tone: "text-red-400" },
  PENDING: { label: "Sonuç bekliyor", icon: Clock, tone: "text-muted-foreground" },
  UNCLEAR: { label: "Belirsiz", icon: CircleHelp, tone: "text-amber-400" },
};

function money(value: string | null): string | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? `${parsed.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TRY`
    : null;
}

function percent(value: string | null): string | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? `%${parsed.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`
    : null;
}

export function BidMemoryPanel({ onClose, onOpenBulletin }: {
  onClose: () => void;
  /** Where the empty state sends people. Nothing lands here until a bid is recorded on an ilan. */
  onOpenBulletin: () => void;
}) {
  const [memory, setMemory] = useState<BidMemory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setMemory(await getBidMemory());
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Teklif geçmişi alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="px-4 pt-12 pb-3 border-b border-border flex items-center gap-3">
        <button onClick={onClose} className="p-2 -ml-2 text-muted-foreground active:scale-95"
          aria-label="Geri">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Swords className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">Tekliflerimiz</p>
          <p className="text-xs text-muted-foreground truncate">
            Ne teklif ettik, ne oldu, kime kaybettik
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Yükleniyor…
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}

        {memory && memory.total_bids === 0 && (
          <div className="rounded-xl bg-white/[0.03] border border-white/10 px-4 py-8 text-center space-y-1.5">
            <Swords className="w-6 h-6 text-muted-foreground mx-auto" />
            <p className="text-sm text-foreground">Henüz kayıtlı teklifiniz yok</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Bir ilanı açıp verdiğiniz teklifi kaydedin. Sonuç yayımlandığında kaç fark kaybettiğinizi
              ve kime kaybettiğinizi kendiliğinden söyler.
            </p>
            {/* Advice with no way to follow it is where a first morning ends. The one thing this
                screen asks for happens on another screen, so it opens that screen. */}
            <button
              onClick={onOpenBulletin}
              className="mt-3 h-9 px-4 rounded-xl bg-primary/15 text-primary text-sm font-medium active:scale-[0.98] transition-transform"
            >
              Bülteni aç
            </button>
          </div>
        )}

        {memory && memory.total_bids > 0 && (
          <>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Teklif", value: memory.total_bids, tone: "text-foreground" },
                { label: "Kazanılan", value: memory.won, tone: "text-primary" },
                { label: "Kaybedilen", value: memory.lost, tone: "text-red-400" },
                { label: "Bekleyen", value: memory.pending, tone: "text-muted-foreground" },
              ].map(cell => (
                <div key={cell.label} className="rounded-xl border border-border bg-card px-2 py-3 text-center">
                  <p className={`text-lg font-semibold tabular-nums ${cell.tone}`}>{cell.value}</p>
                  <p className="text-[11px] text-muted-foreground">{cell.label}</p>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-1">
              {memory.median_gap_percent !== null ? (
                <>
                  <p className="text-sm text-foreground">
                    Kaybettiğinizde genelde{" "}
                    <span className="font-semibold tabular-nums">
                      {percent(memory.median_gap_percent)}
                    </span>{" "}
                    yukarıdasınız
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {memory.lost} kayıp üzerinden ortanca
                    {memory.smallest_gap_percent !== null
                      && ` · en yakını ${percent(memory.smallest_gap_percent)}`}
                  </p>
                </>
              ) : (
                // Naming the shortage rather than printing a dash: "not enough yet" and "you are
                // always far off" are opposite readings of the same blank.
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Ortalama fark için henüz yeterli veri yok — karşılaştırılabilir {memory.lost} kayıp.
                  {memory.smallest_gap_percent !== null
                    && ` En yakın teklifiniz ${percent(memory.smallest_gap_percent)} farkla kaybetti.`}
                </p>
              )}
            </div>

            {memory.rivals.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Sizi geçen firmalar</h2>
                <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                  {memory.rivals.map(rival => (
                    <div key={rival.rival} className="px-4 py-3">
                      <p className="text-sm text-foreground leading-snug">{rival.rival}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {rival.beat_us} kez geçti
                        {rival.median_gap_percent !== null
                          && ` · genelde ${percent(rival.median_gap_percent)} farkla`}
                      </p>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Teklif geçmişi</h2>
              <div className="space-y-2">
                {memory.outcomes.map(outcome => {
                  const style = STATUS[outcome.status];
                  const Icon = style.icon;
                  return (
                    <article key={outcome.id} className="rounded-xl border border-border bg-card px-4 py-3 space-y-1.5">
                      <div className="flex items-start gap-2">
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${style.tone}`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground leading-snug">
                            {outcome.title || outcome.ikn}
                          </p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {outcome.authority || outcome.ikn}
                          </p>
                        </div>
                        <span className={`text-[11px] shrink-0 ${style.tone}`}>{style.label}</span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 text-[11px] text-muted-foreground tabular-nums">
                        <span>Teklifimiz: {money(outcome.bid_amount)}</span>
                        {outcome.winning_amount && <span>Kazanan: {money(outcome.winning_amount)}</span>}
                        {outcome.gap_percent !== null && outcome.status === "LOST" && (
                          <span className="text-red-400">{percent(outcome.gap_percent)} fark</span>
                        )}
                      </div>
                      {outcome.winner && outcome.status === "LOST" && (
                        <p className="text-[11px] text-foreground leading-snug">{outcome.winner}</p>
                      )}
                      {outcome.note && (
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{outcome.note}</p>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          </>
        )}
        <div className="h-4" />
      </div>
    </div>
  );
}
