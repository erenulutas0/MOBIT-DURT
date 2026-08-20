import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock, ClipboardCheck, Loader2, ShieldAlert, TrendingUp, Wallet,
} from "lucide-react";

import { getBossBriefing, type BossBriefing } from "../api";

/**
 * "Şirket Özeti" — the owner's page, and the reason the web panel exists at all.
 *
 * <p>The task board answers "what is everyone doing". An owner asks two other things — what is
 * stopped because of me, and where is the money — and gets neither from a list of jobs. This is
 * also the screen most likely to be open on a laptop during a meeting, which is why nothing on it
 * is an estimate a person could be caught out on.
 *
 * <p>A won tender is worth what it was let for once the bulletin has published a price, and the
 * company's own bid until then. When any of the month's total rests on our own figure the page
 * says so out loud.
 */

function money(value: string | null | undefined): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed)
    ? `${parsed.toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TRY`
    : "—";
}

function monthName(iso: string | null): string {
  if (!iso) return "Bu ay";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? "Bu ay"
    : date.toLocaleDateString("tr-TR", { month: "long", year: "numeric" });
}

export function CompanyBriefingPage() {
  const [briefing, setBriefing] = useState<BossBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setBriefing(await getBossBriefing());
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Şirket özeti alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
          <TrendingUp className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-slate-900">Şirket Özeti</h1>
          <p className="text-sm text-slate-500">
            {briefing ? monthName(briefing.period_start) : "Yükleniyor…"} — kazanılan iş, bekleyen
            para ve onayınızı bekleyenler
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

      {briefing && (
        <>
          {/* First and alone: the only thing on this page that is stopped because of the person
              reading it. Everything else is information; this is a queue. */}
          {briefing.pending_approval > 0 && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 flex items-start gap-3">
              <ClipboardCheck className="w-5 h-5 text-emerald-700 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {briefing.pending_approval} iş onayınızı bekliyor
                </p>
                <p className="text-xs text-slate-600">
                  Onaylanana kadar tamamlanmış sayılmıyor.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Bu ay kazanılan iş</p>
              <p className="text-2xl font-semibold text-slate-900 tabular-nums">
                {money(briefing.won_amount_this_month)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {briefing.won_this_month} ihale · bu ay {briefing.bids_this_month} teklif verildi
              </p>
              {briefing.won_amount_from_our_own_figure > 0 && (
                // The one place this page could mislead, so it says it rather than hides it.
                <p className="text-xs text-amber-700 mt-2 leading-relaxed">
                  {briefing.won_amount_from_our_own_figure} tanesinin sözleşme bedeli henüz
                  yayımlanmadı; kendi teklifinizle sayıldı.
                </p>
              )}
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs text-slate-500">Sonucu bekleyen teklifler</p>
              <p className="text-2xl font-semibold text-slate-900 tabular-nums">
                {money(briefing.awaiting_amount)}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                {briefing.awaiting_result} ihale · henüz karara bağlanmadı
              </p>
            </section>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Geciken iş", value: briefing.overdue_tasks, alarm: briefing.overdue_tasks > 0 },
              { label: "Bu hafta teslim", value: briefing.due_this_week, alarm: false },
              { label: "Onay bekleyen", value: briefing.pending_approval, alarm: false },
            ].map(cell => (
              <div key={cell.label} className="rounded-xl border border-slate-200 bg-white p-4">
                <p className={`text-2xl font-semibold tabular-nums ${
                  cell.alarm ? "text-red-600" : "text-slate-900"
                }`}>
                  {cell.value}
                </p>
                <p className="text-xs text-slate-500">{cell.label}</p>
              </div>
            ))}
          </div>

          {(briefing.lapsed_credentials > 0 || briefing.expiring_credentials > 0) && (
            <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${
              briefing.lapsed_credentials > 0
                ? "border-red-200 bg-red-50"
                : "border-amber-200 bg-amber-50"
            }`}>
              <ShieldAlert className={`w-5 h-5 shrink-0 ${
                briefing.lapsed_credentials > 0 ? "text-red-600" : "text-amber-600"
              }`} />
              <p className="text-sm text-slate-800">
                {briefing.lapsed_credentials > 0
                  ? `${briefing.lapsed_credentials} belgenizin süresi dolmuş. Süresi geçmiş belgeyle teklif verilemez.`
                  : `${briefing.expiring_credentials} belgenizin süresi 30 gün içinde doluyor.`}
              </p>
            </div>
          )}

          {briefing.upcoming.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-900">Hazırlanan ihaleler</h2>
              <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                {briefing.upcoming.map(item => (
                  <div key={item.notice_id} className="px-4 py-3">
                    <p className="text-sm text-slate-900">{item.title || item.ikn}</p>
                    <p className="text-xs text-slate-500">{item.authority || item.ikn}</p>
                    {item.tender_at_text && (
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <CalendarClock className="w-3 h-3" />{item.tender_at_text}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {briefing.bids_this_month === 0 && briefing.awaiting_result === 0 && (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-8 text-center space-y-1">
              <Wallet className="w-6 h-6 text-slate-400 mx-auto" />
              <p className="text-sm text-slate-900">Henüz kayıtlı teklif yok</p>
              <p className="text-xs text-slate-500">
                Bir ihaleye teklif verdiğinizde kaydedin; bu sayfa kazanılan işi ve bekleyen parayı
                buradan toplar.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
