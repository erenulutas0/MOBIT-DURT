import { useCallback, useEffect, useState } from "react";
import { Building2, Gavel, History, Loader2, MapPin, TrendingDown, Users } from "lucide-react";

import {
  getAuthorityProfile, getTenderResults,
  type AuthorityProfile, type TenderResult,
} from "../api";

/**
 * "Sonuçlanan İhaleler" — who took the work, for how much, against how many bidders.
 *
 * <p>The announcements bulletin says what an idare wants. This says what somebody else got it for,
 * beside the idare's own estimate — the number every bid is really priced against, and the one
 * nobody publishes in a form you can read.
 *
 * <p>The discount appears only where it can be computed honestly. A tender divided into kısım is
 * awarded lot by lot: the estimate covers the whole tender, each contract covers one lot, and
 * dividing the two produces a 98% saving that is arithmetic fiction. Those say why instead.
 */

const BULLETIN_TYPES = [
  { code: "yapim", label: "Yapım" },
  { code: "mal", label: "Mal" },
  { code: "hizmet", label: "Hizmet" },
  { code: "danismanlik", label: "Danışmanlık" },
];

function money(amount: string | null, currency: string | null): string | null {
  if (!amount) return null;
  const value = Number(amount);
  return Number.isFinite(value)
    ? `${value.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} ${currency || "TRY"}`
    : null;
}

function percent(value: string | null): string | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? `%${parsed.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}`
    : null;
}

export function TenderResultsPage() {
  const [results, setResults] = useState<TenderResult[]>([]);
  const [bulletinType, setBulletinType] = useState<string | null>(null);
  const [mineOnly, setMineOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authority, setAuthority] = useState<AuthorityProfile | null>(null);
  const [authorityLoading, setAuthorityLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setResults(await getTenderResults({ type: bulletinType, mine: mineOnly }));
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "İhale sonuçları alınamadı.");
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [bulletinType, mineOnly]);

  useEffect(() => { void load(); }, [load]);

  const openAuthority = async (name: string) => {
    setAuthorityLoading(true);
    setAuthority(null);
    try {
      setAuthority(await getAuthorityProfile(name));
    } catch {
      // A bonus on top of the list; losing it must not cost the list.
      setAuthority(null);
    } finally {
      setAuthorityLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
          <Gavel className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-slate-900">Sonuçlanan İhaleler</h1>
          <p className="text-sm text-slate-500">
            Kim aldı, ne bedelle, yaklaşık maliyetin ne kadar altına
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setMineOnly(!mineOnly)}
          className={`h-8 px-3 rounded-lg border text-xs ${
            mineOnly
              ? "border-sky-300 bg-sky-50 text-sky-700"
              : "border-slate-200 bg-white text-slate-600"
          }`}
        >
          Bize uygun
        </button>
        {BULLETIN_TYPES.map(entry => (
          <button
            key={entry.code}
            onClick={() => setBulletinType(bulletinType === entry.code ? null : entry.code)}
            className={`h-8 px-3 rounded-lg border text-xs ${
              bulletinType === entry.code
                ? "border-slate-400 bg-slate-100 text-slate-900"
                : "border-slate-200 bg-white text-slate-600"
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Sonuçlar yükleniyor…
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {!loading && !error && results.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center space-y-1">
          <Gavel className="w-6 h-6 text-slate-400 mx-auto" />
          <p className="text-sm text-slate-900">Bu süzgeçle sonuçlanmış ihale yok</p>
          <p className="text-xs text-slate-500">
            Sonuç ilanları her sabah bültenle gelir; süzgeci genişletmeyi deneyebilirsiniz.
          </p>
        </div>
      )}

      {authorityLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> İdare geçmişi yükleniyor…
        </div>
      )}

      {authority && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
          <div className="flex items-start gap-2">
            <History className="w-4 h-4 text-sky-700 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-slate-900">{authority.authority}</p>
              {authority.median_discount !== null ? (
                <p className="text-sm text-slate-700">
                  <span className="font-semibold tabular-nums">
                    {percent(authority.median_discount)}
                  </span>{" "}
                  ortanca kırım · {authority.sample_size} ihalede
                  {authority.lowest_discount !== null && authority.highest_discount !== null
                    && ` (${percent(authority.lowest_discount)} – ${percent(authority.highest_discount)})`}
                </p>
              ) : (
                // Naming the shortage: "not enough yet" and "this buyer gives nothing away" are
                // opposite readings of the same blank.
                <p className="text-sm text-slate-600">
                  Ortanca kırım için henüz yeterli veri yok — {authority.sample_size} ihale.
                </p>
              )}
              <p className="text-xs text-slate-500">
                Toplam {authority.total_awards} sözleşme
                {authority.average_bidders !== null
                  && ` · ortalama ${Number(authority.average_bidders).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} teklif`}
              </p>
            </div>
            <button onClick={() => setAuthority(null)}
              className="text-xs text-slate-500 hover:text-slate-800">Kapat</button>
          </div>
          {authority.top_winners.length > 0 && (
            <div className="text-xs text-slate-600 space-y-0.5 pl-6">
              <p className="text-slate-500">En çok iş alanlar</p>
              {authority.top_winners.slice(0, 3).map(entry => (
                <p key={entry.winner}>{entry.winner} · {entry.awards} sözleşme</p>
              ))}
            </div>
          )}
        </section>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {results.map(result => {
          const discount = result.discount_percent === null ? null : Number(result.discount_percent);
          return (
            <article key={result.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-4 pt-3 pb-2 space-y-1">
                <p className="text-sm font-semibold text-slate-900">{result.title || result.ikn}</p>
                <button
                  onClick={() => result.authority && void openAuthority(result.authority)}
                  className="text-xs text-slate-500 hover:text-sky-700 flex items-center gap-1 text-left"
                >
                  <Building2 className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{result.authority || "İdare belirtilmemiş"}</span>
                </button>
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
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
                </div>
              </div>

              {/* The two figures together, because neither means much alone: an eight-million
                  contract is cheap against twelve and dear against seven. */}
              <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-slate-500">Sözleşme bedeli</p>
                  <p className="text-sm font-semibold text-slate-900 tabular-nums">
                    {money(result.contract_amount, result.currency) || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Yaklaşık maliyet</p>
                  <p className="text-sm text-slate-600 tabular-nums">
                    {money(result.estimated_cost, result.currency) || "—"}
                  </p>
                </div>
              </div>

              <div className="px-4 py-2 border-t border-slate-100 flex items-center gap-2">
                {discount !== null ? (
                  <>
                    <TrendingDown className="w-3.5 h-3.5 text-sky-700" />
                    <span className="text-xs text-slate-800">
                      <span className="font-semibold tabular-nums">
                        %{discount.toLocaleString("tr-TR", { maximumFractionDigits: 1 })}
                      </span>{" "}kırım
                    </span>
                  </>
                ) : (
                  <span className="text-xs text-slate-500">
                    {result.partial_award
                      ? "Kısımlara bölünmüş ihale — kırım hesaplanmadı"
                      : "Kırım hesaplanamadı"}
                  </span>
                )}
              </div>

              {result.winner && (
                <div className="px-4 py-2 border-t border-slate-100">
                  <p className="text-xs text-slate-500">Yüklenici</p>
                  <p className="text-xs text-slate-800">
                    {result.winner}
                    {result.winner_province && (
                      <span className="text-slate-500"> · {result.winner_province}</span>
                    )}
                  </p>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
