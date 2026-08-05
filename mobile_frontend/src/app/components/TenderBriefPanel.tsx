import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ClipboardList, FileText, Loader2, MinusCircle } from "lucide-react";

import { getTenderBrief, type TenderBrief } from "../api";

/**
 * "İhale Künyesi" — the facts a company decides on before bidding, each shown as the clause that
 * states it.
 *
 * <p>The clause is the answer, not a figure pulled out of it. "%3" lifted from "teklif bedelinin
 * %3'ünden az olmamak üzere" loses the "az olmamak üzere" — a floor read back as a fixed rate — and
 * a mistake here is priced into a bid. Reading the number off the quoted text is the design.
 */
export function TenderBriefPanel({
  tenderId,
  onClose,
}: {
  tenderId: string;
  onClose: () => void;
}) {
  const [brief, setBrief] = useState<TenderBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setBrief(await getTenderBrief(tenderId));
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "İhale künyesi çıkarılamadı.");
    } finally {
      setLoading(false);
    }
  }, [tenderId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="px-4 pt-12 pb-4 bg-gradient-to-b from-amber-950/50 to-background border-b border-amber-500/20">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 -ml-2 text-muted-foreground active:scale-95"
            aria-label="Geri">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-amber-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">İhale Künyesi</p>
            <p className="text-xs text-amber-200/80 truncate">{tenderId}</p>
          </div>
        </div>
        {brief && !loading && (
          <p className="mt-2 text-xs text-muted-foreground">{brief.message}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Şartname okunuyor…
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}

        {brief?.entries.map(entry => (
          <article
            key={entry.key}
            className={`rounded-xl border overflow-hidden ${
              entry.found ? "bg-white/[0.03] border-white/10" : "bg-white/[0.015] border-white/5"
            }`}
          >
            <div className="flex items-center gap-2 px-3.5 py-2.5 border-b border-white/5">
              <p className="text-sm font-bold text-foreground flex-1">{entry.label}</p>
              {entry.found ? (
                <span className="flex items-center gap-1 text-[11px] text-amber-200/70 min-w-0">
                  <FileText className="w-3 h-3 shrink-0" />
                  <span className="truncate max-w-[150px]">{entry.document_name}</span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <MinusCircle className="w-3 h-3" />
                  bulunamadı
                </span>
              )}
            </div>
            {entry.found ? (
              <p className="px-3.5 py-3 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {entry.content}
              </p>
            ) : (
              // Kept in the list rather than dropped: "there is no price-adjustment clause here" is
              // a finding worth having before bidding, and a brief that hides its gaps looks
              // complete when it is not.
              <p className="px-3.5 py-3 text-xs text-muted-foreground">
                Bu ihalenin belgelerinde bu maddeye karşılık gelen bir bölüm bulunamadı.
              </p>
            )}
          </article>
        ))}
        <div className="h-4" />
      </div>
    </div>
  );
}
