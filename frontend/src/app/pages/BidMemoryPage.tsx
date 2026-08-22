import { useCallback, useEffect, useState } from "react";
import {
  CircleHelp, Clock, Loader2, Search, Swords, TrendingDown, Trophy, X,
} from "lucide-react";

import {
  getBidMemory, getRivalProfile, searchRivals,
  type BidMemory, type BidOutcomeRow, type RivalMatch, type RivalProfile,
} from "../api";
import type { Page } from "../lib/types";

/**
 * "Tekliflerimiz" — what this company offered, beside what the bulletin later said happened.
 *
 * <p>The one page no competing service can build. They all read the same public bulletin and can
 * say what a job went for; none of them knows what <em>this</em> company bid, because that number
 * never leaves the company. Put the two together and the public record becomes a private lesson:
 * three percent over, for the third time, against the same firm.
 *
 * <p>The rival lookup shares the page because it is the same question asked the other way round —
 * "who keeps taking our work, and how do they price".
 */

const STATUS: Record<BidOutcomeRow["status"], { label: string; icon: typeof Trophy; tone: string }> = {
  WON: { label: "Kazandık", icon: Trophy, tone: "text-emerald-700" },
  LOST: { label: "Kaybettik", icon: TrendingDown, tone: "text-red-600" },
  PENDING: { label: "Sonuç bekliyor", icon: Clock, tone: "text-slate-500" },
  UNCLEAR: { label: "Belirsiz", icon: CircleHelp, tone: "text-amber-600" },
};

/** A missing amount is a dash. `Number(null)` is 0, and "0 TRY" reads as a contract won for nothing. */
function money(value: string | null, currency = "TRY"): string {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? `${parsed.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ${currency}`
    : "—";
}

function percent(value: string | null): string | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? `%${parsed.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`
    : null;
}

export function BidMemoryPage({ setPage }: { setPage: (page: Page) => void }) {
  const [memory, setMemory] = useState<BidMemory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [term, setTerm] = useState("");
  const [matches, setMatches] = useState<RivalMatch[]>([]);
  const [rival, setRival] = useState<RivalProfile | null>(null);
  const [searching, setSearching] = useState(false);

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

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    if (term.trim().length < 2) return;
    setSearching(true);
    setRival(null);
    try {
      setMatches(await searchRivals(term.trim()));
    } catch {
      setMatches([]);
    } finally {
      setSearching(false);
    }
  };

  const openRival = async (winner: string) => {
    setMatches([]);
    try {
      setRival(await getRivalProfile(winner));
    } catch {
      setRival(null);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-violet-100 text-violet-700 flex items-center justify-center">
          <Swords className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-slate-900">Tekliflerimiz</h1>
          <p className="text-sm text-slate-500">
            Ne teklif ettik, ne oldu, kime kaç farkla kaybettik
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {memory && memory.total_bids === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center space-y-1">
          <Swords className="w-6 h-6 text-slate-400 mx-auto" />
          <p className="text-sm text-slate-900">Henüz kayıtlı teklifiniz yok</p>
          <p className="text-xs text-slate-500">
            Bültenden bir ilanı açıp verdiğiniz teklifi kaydedin. Sonuç yayımlandığında kaç
            farkla ve kime kaybettiğinizi kendiliğinden söyler.
          </p>
          {/* Advice with no way to follow it is where a first morning ends. It says "open an ilan",
              so it opens the bulletin. */}
          <button
            onClick={() => setPage("tender-bulletin")}
            className="mt-3 h-9 px-4 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 transition-colors"
          >
            Bülteni aç
          </button>
        </div>
      )}

      {memory && memory.total_bids > 0 && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { label: "Teklif", value: memory.total_bids, tone: "text-slate-900" },
              { label: "Kazanılan", value: memory.won, tone: "text-emerald-700" },
              { label: "Kaybedilen", value: memory.lost, tone: "text-red-600" },
              { label: "Bekleyen", value: memory.pending, tone: "text-slate-500" },
            ].map(cell => (
              <div key={cell.label} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className={`text-2xl font-semibold tabular-nums ${cell.tone}`}>{cell.value}</p>
                <p className="text-xs text-slate-500">{cell.label}</p>
              </div>
            ))}
          </div>

          <section className="rounded-xl border border-slate-200 bg-white p-4">
            {memory.median_gap_percent !== null ? (
              <>
                <p className="text-sm text-slate-900">
                  Kaybettiğinizde genelde{" "}
                  <span className="font-semibold tabular-nums">
                    {percent(memory.median_gap_percent)}
                  </span>{" "}
                  yukarıdasınız
                </p>
                <p className="text-xs text-slate-500">
                  {memory.lost} kayıp üzerinden ortanca
                  {memory.smallest_gap_percent !== null
                    && ` · en yakını ${percent(memory.smallest_gap_percent)}`}
                </p>
              </>
            ) : (
              // Two near misses are an anecdote; a median over them looks like knowledge and is a
              // coin flip.
              <p className="text-sm text-slate-600">
                Ortalama fark için henüz yeterli veri yok — karşılaştırılabilir {memory.lost} kayıp.
                {memory.smallest_gap_percent !== null
                  && ` En yakın teklifiniz ${percent(memory.smallest_gap_percent)} farkla kaybetti.`}
              </p>
            )}
          </section>

          {memory.rivals.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-900">Sizi geçen firmalar</h2>
              <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                {memory.rivals.map(entry => (
                  <button
                    key={entry.rival}
                    onClick={() => void openRival(entry.rival)}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50"
                  >
                    <p className="text-sm text-slate-900">{entry.rival}</p>
                    <p className="text-xs text-slate-500">
                      {entry.beat_us} kez geçti
                      {entry.median_gap_percent !== null
                        && ` · genelde ${percent(entry.median_gap_percent)} farkla`}
                    </p>
                  </button>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-2">
            <h2 className="text-sm font-semibold text-slate-900">Teklif geçmişi</h2>
            <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
              {memory.outcomes.map(outcome => {
                const style = STATUS[outcome.status];
                const Icon = style.icon;
                return (
                  <div key={outcome.id} className="px-4 py-3 flex items-start gap-3">
                    <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${style.tone}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-900">{outcome.title || outcome.ikn}</p>
                      <p className="text-xs text-slate-500">{outcome.authority || outcome.ikn}</p>
                      <div className="flex flex-wrap gap-x-4 text-xs text-slate-600 tabular-nums mt-0.5">
                        <span>Teklifimiz: {money(outcome.bid_amount)}</span>
                        {outcome.winning_amount && <span>Kazanan: {money(outcome.winning_amount)}</span>}
                        {outcome.gap_percent !== null && outcome.status === "LOST" && (
                          <span className="text-red-600">{percent(outcome.gap_percent)} fark</span>
                        )}
                      </div>
                      {outcome.winner && outcome.status === "LOST" && (
                        <p className="text-xs text-slate-700 mt-0.5">{outcome.winner}</p>
                      )}
                      {outcome.note && (
                        <p className="text-xs text-slate-500 mt-0.5">{outcome.note}</p>
                      )}
                    </div>
                    <span className={`text-xs shrink-0 ${style.tone}`}>{style.label}</span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-slate-900">Firma takibi</h2>
        <form onSubmit={search} className="flex items-center gap-2">
          <input
            value={term}
            onChange={event => setTerm(event.target.value)}
            placeholder="Rakip firma adı…"
            className="flex-1 h-9 px-3 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-violet-400"
          />
          <button
            type="submit"
            disabled={term.trim().length < 2 || searching}
            className="h-9 px-3 rounded-lg border border-slate-200 bg-white text-sm text-slate-700 disabled:opacity-40"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </button>
        </form>

        {matches.map(match => (
          <button
            key={match.winner}
            onClick={() => void openRival(match.winner)}
            className="w-full text-left rounded-lg border border-slate-200 bg-white px-4 py-2.5 hover:bg-slate-50"
          >
            <p className="text-sm text-slate-900">{match.winner}</p>
            <p className="text-xs text-slate-500">{match.contracts} sözleşme</p>
          </button>
        ))}

        {rival && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
            <div className="flex items-start gap-2">
              <div className="flex-1">
                <p className="text-sm font-semibold text-slate-900">{rival.winner}</p>
                <p className="text-xs text-slate-500">
                  {rival.contracts} sözleşme · {rival.distinct_authorities} idare ·{" "}
                  {money(rival.total_amount, rival.currency)}
                </p>
                {/* Said rather than folded in: lira added to euros is not a total that is slightly
                    off, it is a total for a different company. */}
                {rival.contracts_in_other_currencies > 0 && (
                  <p className="text-xs text-slate-500">
                    {rival.contracts_in_other_currencies} sözleşme başka para biriminde; toplama
                    katılmadı.
                  </p>
                )}
              </div>
              <button onClick={() => setRival(null)}
                className="text-slate-400 hover:text-slate-700" aria-label="Kapat">
                <X className="w-4 h-4" />
              </button>
            </div>
            {rival.beat_us > 0 && (
              // Needs our own bid, which never leaves the company — so no public service can
              // print this line.
              <p className="text-xs text-red-700">
                Bu firma sizin teklif verdiğiniz {rival.beat_us} ihaleyi almış.
              </p>
            )}
            <p className="text-sm text-slate-700">
              {rival.median_discount !== null
                ? <>Genelde <span className="font-semibold tabular-nums">
                    {percent(rival.median_discount)}</span> kırımla alıyor</>
                : "Kırım alışkanlığı için henüz yeterli veri yok."}
            </p>
            {rival.authorities.length > 0 && (
              <div className="text-xs text-slate-600 space-y-0.5">
                <p className="text-slate-500">En çok iş aldığı idareler</p>
                {rival.authorities.slice(0, 3).map(entry => (
                  <p key={entry.name}>{entry.name} · {entry.contracts}</p>
                ))}
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
