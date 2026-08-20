import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, HelpCircle, Info, Loader2, Minus, ShieldQuestion } from "lucide-react";

import {
  getBidForNotice, getQualification, recordBid,
  type QualificationCheck, type QualificationItem,
} from "../api";
import { CompanyQualificationSheet } from "./CompanyQualificationSheet";

/**
 * "Bu ihaleye girebilir miyiz?" — what the announcement demands, beside what the company can prove.
 *
 * <p>Every bar an announcement sets is a ratio of the bid: work experience worth half of what you
 * offer on a yapım tender, a quarter on a hizmet one, turnover the same way. So the bid is the
 * input, and until one is named the screen shows the ratios rather than a verdict — which is still
 * the thing to read before deciding on a price.
 *
 * <p>Five states and not two. "Bilinmiyor" is not "yetersiz": a company that has not typed its
 * turnover in yet must never be told it cannot bid, because that is a claim and a wrong one costs a
 * tender. And whether past work counts as benzer iş is never decided here — the definition is shown
 * and the reader judges it, because an idare can and does reject the comparison.
 */

const STATUS_STYLE: Record<QualificationItem["status"], { icon: typeof Check; tone: string }> = {
  MET: { icon: Check, tone: "text-primary" },
  SHORT: { icon: AlertTriangle, tone: "text-red-400" },
  UNKNOWN: { icon: HelpCircle, tone: "text-amber-400" },
  NOT_REQUIRED: { icon: Minus, tone: "text-muted-foreground" },
  INFORMATION: { icon: Info, tone: "text-muted-foreground" },
};

function money(value: string | null): string | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  // Ratios come through this too, and 0,75 must not be rounded away to 1.
  const digits = Math.abs(parsed) < 100 ? 2 : 0;
  return parsed.toLocaleString("tr-TR", { maximumFractionDigits: digits });
}

export function QualificationPanel({ noticeId }: { noticeId: number }) {
  const [bid, setBid] = useState("");
  const [check, setCheck] = useState<QualificationCheck | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  /** What we already recorded for this tender, so the button says the truth. */
  const [recorded, setRecorded] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async (amount: number | null) => {
    setLoading(true);
    setError("");
    try {
      setCheck(await getQualification(noticeId, amount));
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Yeterlik kontrolü yapılamadı.");
      setCheck(null);
    } finally {
      setLoading(false);
    }
  }, [noticeId]);

  useEffect(() => { void load(null); }, [load]);

  useEffect(() => {
    let cancelled = false;
    // Its own fetch and its own failure: the checklist is what the tap asked for, and whether a
    // bid was already recorded is a detail on top of it.
    void getBidForNotice(noticeId)
      .then(bid => { if (!cancelled) setRecorded(bid.amount); })
      .catch(() => { if (!cancelled) setRecorded(null); });
    return () => { cancelled = true; };
  }, [noticeId]);

  const keepBid = async (amount: string) => {
    setSaving(true);
    try {
      const saved = await recordBid(noticeId, { amount: Number(amount) });
      setRecorded(saved.amount);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Teklif kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const amount = Number(bid.replace(/\./g, "").replace(",", "."));
    void load(Number.isFinite(amount) && amount > 0 ? amount : null);
  };

  if (loading && !check) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" />
        Yeterlik şartları okunuyor…
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

  if (!check?.qualification_published) {
    return (
      <div className="rounded-xl bg-white/[0.03] border border-white/10 px-4 py-5 text-center space-y-1">
        <ShieldQuestion className="w-5 h-5 text-muted-foreground mx-auto" />
        <p className="text-sm text-foreground">Bu ilanda yeterlik şartı yayımlanmamış</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Mal alımı ilanlarının çoğu böyledir; şartlar ihale dokümanında yer alır.
        </p>
      </div>
    );
  }

  return (
    <section className="space-y-3">
      <form onSubmit={submit} className="flex items-center gap-2">
        <div className="flex-1">
          <label className="block text-[11px] text-muted-foreground mb-1">
            Teklif etmeyi düşündüğünüz bedel (TRY)
          </label>
          <input
            value={bid}
            onChange={event => setBid(event.target.value)}
            inputMode="decimal"
            placeholder="örn. 8.000.000"
            className="w-full h-10 px-3 rounded-xl bg-black/30 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
          />
        </div>
        <button
          type="submit"
          className="h-10 mt-5 px-4 rounded-xl bg-primary/10 text-primary text-sm active:scale-95"
        >
          Hesapla
        </button>
      </form>

      {!check.bid_amount && (
        // Said once, plainly: the bars are ratios and nothing can be compared until there is a
        // price to take a ratio of.
        <p className="text-[11px] text-muted-foreground leading-relaxed px-0.5">
          Şartların hepsi teklif bedeline oranlıdır. Bedeli girince ne kadar gerektiğini ve
          elinizdekiyle karşılaştırmasını görürsünüz.
        </p>
      )}

      <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
        {check.items.map(item => {
          const style = STATUS_STYLE[item.status];
          const Icon = style.icon;
          const required = money(item.required);
          const available = money(item.available);
          return (
            <div key={item.key} className="px-4 py-3 flex items-start gap-3">
              <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${style.tone}`} />
              <div className="flex-1 min-w-0 space-y-0.5">
                <p className="text-sm text-foreground">{item.label}</p>
                {required !== null && (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    Gerekli: {required}
                    {available !== null && ` · Sizde: ${available}`}
                  </p>
                )}
                {item.note && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{item.note}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {check.bid_amount && (
        // Offered where the number already is. Recording it turns the public result, weeks from
        // now, into a private lesson — the one thing a bulletin service cannot do for you.
        <button
          onClick={() => void keepBid(check.bid_amount as string)}
          disabled={saving || recorded === check.bid_amount}
          className="w-full h-10 rounded-xl bg-primary/10 text-primary text-sm active:scale-95 disabled:opacity-50"
        >
          {recorded === check.bid_amount
            ? "Teklif kaydedildi"
            : saving ? "Kaydediliyor…" : "Bu tutarla teklif verdik"}
        </button>
      )}

      {recorded && recorded !== check.bid_amount && (
        <p className="text-[11px] text-muted-foreground px-0.5">
          Bu ihale için kayıtlı teklifiniz:{" "}
          {Number(recorded).toLocaleString("tr-TR", { maximumFractionDigits: 0 })} TRY
        </p>
      )}

      {check.items.some(item => item.status === "UNKNOWN") && (
        // Offered where the gap is noticed rather than filed under settings: the line that says
        // "cironuz kayıtlı değil" is the moment somebody is willing to go and enter it.
        <button
          onClick={() => setEditing(true)}
          className="w-full h-10 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-foreground active:scale-95"
        >
          Yeterlik bilgilerimi gir
        </button>
      )}

      <p className="text-[11px] text-muted-foreground leading-relaxed px-0.5">
        Bu liste ilanın kendi metninden okunur ve karar vermez; yeterliği idare değerlendirir.
      </p>

      {editing && (
        <CompanyQualificationSheet
          onClose={() => setEditing(false)}
          onSaved={() => void load(check.bid_amount ? Number(check.bid_amount) : null)}
        />
      )}
    </section>
  );
}
