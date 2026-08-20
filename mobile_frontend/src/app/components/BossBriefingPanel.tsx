import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft, CalendarClock, ClipboardCheck, Loader2, ShieldAlert, TrendingUp, Wallet,
} from "lucide-react";

import { getBossBriefing, type BossBriefing } from "../api";

/**
 * The owner's screen, as opposed to the one whoever prepares the files opens.
 *
 * <p>The home screen already answers "what do I have to deal with today" and is shaped for the
 * person doing the work. An owner asks two other questions — <em>what is stopped because of me</em>
 * and <em>where is the money</em> — and gets neither from a task list.
 *
 * <p>Nothing on it is estimated. A won tender is worth what it was let for once the bulletin has
 * said so, and the company's own bid until then; when any of the month's total rests on our own
 * figure the screen says so, because a number an owner cannot defend in a meeting is worse than
 * no number.
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

export function BossBriefingPanel({ onClose, onOpenTasks, onOpenBids }: {
  onClose: () => void;
  onOpenTasks: () => void;
  onOpenBids: () => void;
}) {
  const [briefing, setBriefing] = useState<BossBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setBriefing(await getBossBriefing());
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Özet alınamadı.");
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
          <TrendingUp className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground truncate">Şirket Özeti</p>
          <p className="text-xs text-muted-foreground truncate">
            {briefing ? monthName(briefing.period_start) : "Yükleniyor…"}
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

        {briefing && (
          <>
            {/* First, and on its own: the only thing on this screen that is stopped because of the
                person reading it. Everything else is information; this is a queue. */}
            {briefing.pending_approval > 0 && (
              <button
                onClick={onOpenTasks}
                className="w-full rounded-xl border border-primary/40 bg-primary/10 px-4 py-3.5 flex items-center gap-3 text-left active:scale-[0.99]"
              >
                <ClipboardCheck className="w-5 h-5 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground">
                    {briefing.pending_approval} iş onayınızı bekliyor
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Onaylanana kadar tamamlanmış sayılmıyor.
                  </p>
                </div>
              </button>
            )}

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">Para</h2>
              <button
                onClick={onOpenBids}
                className="w-full rounded-xl border border-border bg-card divide-y divide-border overflow-hidden text-left"
              >
                <div className="px-4 py-3">
                  <p className="text-[11px] text-muted-foreground">Bu ay kazanılan iş</p>
                  <p className="text-lg font-semibold text-foreground tabular-nums">
                    {money(briefing.won_amount_this_month)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {briefing.won_this_month} ihale · bu ay {briefing.bids_this_month} teklif verildi
                  </p>
                  {briefing.won_amount_from_our_own_figure > 0 && (
                    // The one place this screen could mislead, so it says it out loud.
                    <p className="text-[11px] text-amber-400 mt-1 leading-relaxed">
                      {briefing.won_amount_from_our_own_figure} tanesinin bedeli henüz
                      yayımlanmadı; kendi teklifinizle sayıldı.
                    </p>
                  )}
                </div>
                <div className="px-4 py-3">
                  <p className="text-[11px] text-muted-foreground">Sonucu bekleyen teklifler</p>
                  <p className="text-base font-semibold text-foreground tabular-nums">
                    {money(briefing.awaiting_amount)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {briefing.awaiting_result} ihale · henüz karara bağlanmadı
                  </p>
                </div>
              </button>
            </section>

            <section className="space-y-2">
              <h2 className="text-sm font-semibold text-foreground">İş yükü</h2>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={onOpenTasks}
                  className="rounded-xl border border-border bg-card px-4 py-3 text-left"
                >
                  <p className={`text-lg font-semibold tabular-nums ${
                    briefing.overdue_tasks > 0 ? "text-red-400" : "text-foreground"
                  }`}>
                    {briefing.overdue_tasks}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Geciken iş</p>
                </button>
                <button
                  onClick={onOpenTasks}
                  className="rounded-xl border border-border bg-card px-4 py-3 text-left"
                >
                  <p className="text-lg font-semibold text-foreground tabular-nums">
                    {briefing.due_this_week}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Bu hafta teslim</p>
                </button>
              </div>
            </section>

            {(briefing.lapsed_credentials > 0 || briefing.expiring_credentials > 0) && (
              <div className={`rounded-xl border px-4 py-3 flex items-start gap-3 ${
                briefing.lapsed_credentials > 0
                  ? "border-red-500/30 bg-red-500/10"
                  : "border-amber-500/30 bg-amber-500/10"
              }`}>
                <ShieldAlert className={`w-4 h-4 mt-0.5 shrink-0 ${
                  briefing.lapsed_credentials > 0 ? "text-red-400" : "text-amber-400"
                }`} />
                <p className="text-xs text-foreground leading-relaxed">
                  {briefing.lapsed_credentials > 0
                    ? `${briefing.lapsed_credentials} belgenizin süresi dolmuş. Süresi geçmiş belgeyle teklif verilemez.`
                    : `${briefing.expiring_credentials} belgenizin süresi 30 gün içinde doluyor.`}
                </p>
              </div>
            )}

            {briefing.upcoming.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-sm font-semibold text-foreground">Hazırlanan ihaleler</h2>
                <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                  {briefing.upcoming.map(item => (
                    <div key={item.notice_id} className="px-4 py-3">
                      <p className="text-sm text-foreground leading-snug">
                        {item.title || item.ikn}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {item.authority || item.ikn}
                      </p>
                      {item.tender_at_text && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                          <CalendarClock className="w-3 h-3" />{item.tender_at_text}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {briefing.bids_this_month === 0 && briefing.awaiting_result === 0 && (
              <div className="rounded-xl bg-white/[0.03] border border-white/10 px-4 py-6 text-center space-y-1.5">
                <Wallet className="w-6 h-6 text-muted-foreground mx-auto" />
                <p className="text-sm text-foreground">Henüz kayıtlı teklif yok</p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Bir ihaleye teklif verdiğinizde kaydedin; bu ekran kazanılan işi ve bekleyen
                  parayı buradan toplar.
                </p>
              </div>
            )}
          </>
        )}
        <div className="h-4" />
      </div>
    </div>
  );
}
