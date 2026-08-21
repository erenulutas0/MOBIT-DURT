import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Building2, Loader2, MapPin, Search, TrendingDown, Users, X,
} from "lucide-react";

import {
  getRivalProfile, searchRivals, type RivalMatch, type RivalProfile,
} from "../api";
import { DiscountSourceNote } from "./DiscountSourceNote";

/**
 * "Kime karşı teklif veriyoruz?" — one firm's record in the public results.
 *
 * <p>The mirror of the idare history. That one answers what a buyer usually pays; this answers how
 * the firm across the table prices. A company that knows a rival habitually goes eleven percent
 * under is deciding with information; one that does not is guessing against somebody who has done
 * this two hundred times.
 *
 * <p>One line here cannot come from the public record at all: how many of <em>our</em> bids this
 * firm has taken. The bulletin says who won; only our own bid memory says who won against us.
 */

function money(value: string | null, currency: string | null): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed)
    ? `${parsed.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ${currency || "TRY"}`
    : "—";
}

function percent(value: string | null): string | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? `%${parsed.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`
    : null;
}

export function RivalPanel({ onClose, initialWinner }: {
  onClose: () => void;
  /** Opened from a result card or the bid memory, with the firm already named. */
  initialWinner?: string | null;
}) {
  const [term, setTerm] = useState("");
  const [matches, setMatches] = useState<RivalMatch[]>([]);
  const [profile, setProfile] = useState<RivalProfile | null>(null);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const open = useCallback(async (winner: string) => {
    setLoading(true);
    setError("");
    setMatches([]);
    try {
      setProfile(await getRivalProfile(winner));
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Firma bilgisi alınamadı.");
      setProfile(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialWinner) {
      void open(initialWinner);
    } else {
      inputRef.current?.focus();
    }
  }, [initialWinner, open]);

  const search = async (event: React.FormEvent) => {
    event.preventDefault();
    if (term.trim().length < 2) return;
    setSearching(true);
    setError("");
    setProfile(null);
    try {
      setMatches(await searchRivals(term.trim()));
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Arama yapılamadı.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[55] bg-background flex flex-col">
      <div className="px-4 pt-12 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 -ml-2 text-muted-foreground active:scale-95"
            aria-label="Geri">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">Firma Takibi</p>
            <p className="text-xs text-muted-foreground truncate">
              Hangi işleri alıyor, hangi idareden, ne kırımla
            </p>
          </div>
        </div>

        <form onSubmit={search} className="mt-3 flex items-center gap-2">
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              value={term}
              onChange={event => setTerm(event.target.value)}
              placeholder="Firma adı yazın…"
              enterKeyHint="search"
              className="w-full h-10 pl-3 pr-9 rounded-xl bg-black/30 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
            />
            {term && (
              <button
                type="button"
                onClick={() => { setTerm(""); setMatches([]); inputRef.current?.focus(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground"
                aria-label="Temizle"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={term.trim().length < 2 || searching}
            className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center active:scale-95 disabled:opacity-40"
            aria-label="Ara"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </button>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Yükleniyor…
          </div>
        )}

        {!loading && !profile && matches.length === 0 && !error && !searching && (
          <p className="text-xs text-muted-foreground leading-relaxed px-1">
            Bir rakibin adını yazın. Kamu İhale Bülteni'nde sonuçlanan ihalelerden derlenen kaydını
            görürsünüz: aldığı işler, çalıştığı idareler ve kırım alışkanlığı.
          </p>
        )}

        {matches.map(match => (
          <button
            key={match.winner}
            onClick={() => void open(match.winner)}
            className="w-full text-left rounded-xl border border-border bg-card px-4 py-3 active:scale-[0.99]"
          >
            <p className="text-sm text-foreground leading-snug">{match.winner}</p>
            <p className="text-[11px] text-muted-foreground">{match.contracts} sözleşme</p>
          </button>
        ))}

        {!searching && term.trim().length >= 2 && matches.length === 0 && !profile && !error && (
          <p className="text-xs text-muted-foreground px-1">
            Bu adla sonuçlanmış ihale bulunamadı. Kayıtlar yalnız bültende yayımlanan sonuçlardan
            derlenir.
          </p>
        )}

        {profile && (
          <>
            <div className="rounded-xl border border-border bg-card px-4 py-3 space-y-1">
              <p className="text-sm font-semibold text-foreground leading-snug">{profile.winner}</p>
              <p className="text-xs text-muted-foreground">
                {profile.contracts} sözleşme · {profile.distinct_authorities} idare
              </p>
              <p className="text-base font-semibold text-foreground tabular-nums">
                {money(profile.total_amount, profile.currency)}
              </p>
            </div>

            {profile.beat_us > 0 && (
              // The line no bulletin service can print: it needs our own bid, which never leaves
              // the company.
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 flex items-start gap-3">
                <TrendingDown className="w-4 h-4 mt-0.5 text-red-400 shrink-0" />
                <p className="text-xs text-foreground leading-relaxed">
                  Bu firma sizin teklif verdiğiniz {profile.beat_us} ihaleyi almış.
                </p>
              </div>
            )}

            <div className="rounded-xl border border-border bg-card px-4 py-3">
              {profile.median_discount !== null ? (
                <>
                  <p className="text-sm text-foreground">
                    Genelde{" "}
                    <span className="font-semibold tabular-nums">
                      {percent(profile.median_discount)}
                    </span>{" "}
                    kırımla alıyor
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Kırımı hesaplanabilen sözleşmelerin ortancası
                  </p>
                  <div className="mt-2"><DiscountSourceNote /></div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Kırım alışkanlığı için henüz yeterli veri yok. Kısımlara bölünmüş ihaleler ve
                  yaklaşık maliyeti okunamayanlar hesaba katılmaz.
                </p>
              )}
            </div>

            {profile.authorities.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">En çok iş aldığı idareler</h2>
                <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                  {profile.authorities.map(entry => (
                    <div key={entry.name} className="px-4 py-2.5 flex items-start gap-2">
                      <Building2 className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
                      <p className="text-xs text-foreground flex-1 leading-snug">{entry.name}</p>
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {entry.contracts}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {profile.provinces.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {profile.provinces.map(entry => (
                  <span
                    key={entry.name}
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-full border border-white/10 bg-white/[0.04] text-[11px] text-muted-foreground"
                  >
                    <MapPin className="w-3 h-3" />{entry.name} {entry.contracts}
                  </span>
                ))}
              </div>
            )}

            {profile.recent.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Aldığı son işler</h2>
                <div className="space-y-2">
                  {profile.recent.map(contract => (
                    <article key={contract.id ?? contract.ikn}
                      className="rounded-xl border border-border bg-card px-4 py-3 space-y-1">
                      <p className="text-sm text-foreground leading-snug">
                        {contract.title || contract.ikn}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {contract.authority || contract.ikn}
                      </p>
                      <div className="flex flex-wrap gap-x-3 text-[11px] tabular-nums">
                        <span className="text-foreground">
                          {money(contract.amount, profile.currency)}
                        </span>
                        {contract.discount_percent !== null && (
                          <span className="text-muted-foreground">
                            {percent(contract.discount_percent)} kırım
                          </span>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
        <div className="h-4" />
      </div>
    </div>
  );
}
