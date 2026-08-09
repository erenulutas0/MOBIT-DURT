import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Building2, CalendarClock, Loader2, MapPin, Megaphone, Package, RefreshCw, X,
} from "lucide-react";

import {
  getTenderCategories, getTenderNoticeDetail, getTenderNotices, refreshTenderBulletin,
  type TenderCategoryCount, type TenderNotice,
} from "../api";

/**
 * "Kamu İhale Bülteni" — the tenders published today, filtered down to the ones a company might
 * actually bid on.
 *
 * <p>Four hundred announcements a day are printed in the Kamu İhale Bülteni and almost none of them
 * are any one company's work. The filters exist to make that number small: the line of work first,
 * because a cable contractor and a bakery share a bulletin and share nothing else, then the
 * province, because most companies bid where they can drive.
 *
 * <p>Cancellations never appear. They are stored — a withdrawn tender is worth knowing about when
 * it comes back — but showing one as something to bid on wastes an afternoon, which is worse than
 * showing nothing.
 */

const BULLETIN_TYPES: Array<{ code: string; label: string }> = [
  { code: "yapim", label: "Yapım" },
  { code: "mal", label: "Mal" },
  { code: "hizmet", label: "Hizmet" },
  { code: "danismanlik", label: "Danışmanlık" },
];

/** How long is left, in the words somebody would use out loud. */
function remaining(tenderAt: string | null): { text: string; urgent: boolean } | null {
  if (!tenderAt) return null;
  const millis = new Date(tenderAt).getTime() - Date.now();
  if (Number.isNaN(millis)) return null;
  if (millis <= 0) return { text: "Süresi doldu", urgent: true };
  const days = Math.floor(millis / 86_400_000);
  if (days >= 1) return { text: `${days} gün kaldı`, urgent: days <= 3 };
  const hours = Math.max(1, Math.floor(millis / 3_600_000));
  return { text: `${hours} saat kaldı`, urgent: true };
}

export function TenderBulletinPanel({ isAdmin, onClose }: { isAdmin: boolean; onClose: () => void }) {
  const [notices, setNotices] = useState<TenderNotice[]>([]);
  const [categories, setCategories] = useState<TenderCategoryCount[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [province, setProvince] = useState<string | null>(null);
  const [bulletinType, setBulletinType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  /** Kept apart from the error: what a pull found is news, not a fault. */
  const [note, setNote] = useState("");
  const [opened, setOpened] = useState<{ notice: TenderNotice; body: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setNote("");
    try {
      const [list, counts] = await Promise.all([
        getTenderNotices({ province, category, type: bulletinType }),
        getTenderCategories(),
      ]);
      setNotices(list);
      setCategories(counts);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "İhale bülteni alınamadı.");
      setNotices([]);
    } finally {
      setLoading(false);
    }
  }, [province, category, bulletinType]);

  useEffect(() => { void load(); }, [load]);

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      const stored = await refreshTenderBulletin();
      // Said after the reload, not before, because loading clears the line. The count is worth
      // saying at all because "nothing new today" and "the pull failed" are otherwise the same
      // silent screen.
      await load();
      setNote(stored > 0 ? `${stored} yeni ilan eklendi.` : "Bülten çekildi, yeni ilan yok.");
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Bülten çekilemedi.");
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, load]);

  /** The provinces that actually have something in them, from what is on screen. */
  const provinces = useMemo(() => {
    const counts = new Map<string, number>();
    for (const notice of notices) {
      if (notice.province) counts.set(notice.province, (counts.get(notice.province) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "tr"));
  }, [notices]);

  const open = useCallback(async (notice: TenderNotice) => {
    try {
      const detail = await getTenderNoticeDetail(notice.id);
      setOpened({ notice: detail.notice, body: detail.body });
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "İlan açılamadı.");
    }
  }, []);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="px-4 pt-12 pb-3 bg-gradient-to-b from-amber-950/50 to-background border-b border-amber-500/20">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 -ml-2 text-muted-foreground active:scale-95"
            aria-label="Geri">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-amber-500/25 flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-amber-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">Kamu İhale Bülteni</p>
            <p className="text-xs text-amber-300/80 truncate">
              {loading ? "Yükleniyor…" : `${notices.length} açık ihale`}
            </p>
          </div>
          {isAdmin && (
            <button onClick={() => void refresh()} disabled={refreshing}
              className="p-2 text-amber-300 active:scale-95 disabled:opacity-40" aria-label="Bülteni çek">
              <RefreshCw className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>

        <div className="mt-3 -mx-4 px-4 overflow-x-auto">
          <div className="flex items-center gap-2 w-max pb-1">
            <Chip active={!category} label="Tümü" onClick={() => setCategory(null)} />
            {categories.filter(entry => entry.count > 0).map(entry => (
              <Chip
                key={entry.code}
                active={category === entry.code}
                label={`${entry.label} ${entry.count}`}
                onClick={() => setCategory(category === entry.code ? null : entry.code)}
              />
            ))}
          </div>
        </div>

        <div className="mt-2 -mx-4 px-4 overflow-x-auto">
          <div className="flex items-center gap-2 w-max pb-1">
            {BULLETIN_TYPES.map(entry => (
              <Chip
                key={entry.code}
                tone="slate"
                active={bulletinType === entry.code}
                label={entry.label}
                onClick={() => setBulletinType(bulletinType === entry.code ? null : entry.code)}
              />
            ))}
            {provinces.slice(0, 12).map(([name, count]) => (
              <Chip
                key={name}
                tone="slate"
                active={province === name}
                label={`${name} ${count}`}
                onClick={() => setProvince(province === name ? null : name)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}

        {note && !error && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 px-3 py-2.5 text-sm text-amber-200">
            {note}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            İhaleler yükleniyor…
          </div>
        )}

        {!loading && notices.length === 0 && !error && (
          <div className="rounded-xl bg-white/[0.03] border border-white/10 px-4 py-8 text-center space-y-1">
            <Megaphone className="w-6 h-6 text-muted-foreground mx-auto" />
            <p className="text-sm text-foreground">Bu filtrelerde açık ihale yok.</p>
            <p className="text-xs text-muted-foreground">
              Filtreleri gevşetin ya da bülten günlük olarak sabah çekilir.
            </p>
          </div>
        )}

        {notices.map(notice => {
          const left = remaining(notice.tender_at);
          return (
            <button
              key={notice.id}
              onClick={() => void open(notice)}
              className="w-full text-left rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center gap-2 px-3.5 py-2 bg-amber-500/10 border-b border-amber-500/15">
                <span className="text-[11px] font-semibold text-amber-200">{notice.category_label}</span>
                <span className="text-[11px] text-muted-foreground">·</span>
                <span className="text-[11px] text-muted-foreground">{notice.ikn}</span>
                {left && (
                  <span className={`ml-auto text-[11px] font-semibold ${left.urgent ? "text-red-300" : "text-muted-foreground"}`}>
                    {left.text}
                  </span>
                )}
              </div>
              <div className="px-3.5 py-3 space-y-2">
                <p className="text-sm text-foreground leading-snug line-clamp-3">{notice.title}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1 min-w-0">
                    <Building2 className="w-3 h-3 shrink-0" />
                    <span className="truncate max-w-[190px]">{notice.authority}</span>
                  </span>
                  {notice.province && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3 h-3" />{notice.province}
                    </span>
                  )}
                  {notice.tender_at_text && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="w-3 h-3" />{notice.tender_at_text}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
        <div className="h-4" />
      </div>

      {opened && <NoticeSheet notice={opened.notice} body={opened.body} onClose={() => setOpened(null)} />}
    </div>
  );
}

function Chip({ active, label, onClick, tone = "amber" }: {
  active: boolean;
  label: string;
  onClick: () => void;
  tone?: "amber" | "slate";
}) {
  const palette = tone === "amber"
    ? "bg-amber-500/25 text-amber-100 border-amber-400/40"
    : "bg-sky-500/20 text-sky-100 border-sky-400/40";
  return (
    <button
      onClick={onClick}
      className={`shrink-0 h-8 px-3 rounded-full border text-xs whitespace-nowrap active:scale-95 transition-transform ${
        active ? palette : "bg-white/[0.04] text-muted-foreground border-white/10"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * The announcement as printed.
 *
 * <p>Shown whole rather than summarised: what decides whether a company can do the work is a line
 * like "3x240/25 mm² XLPE kablo" buried in the specification, and a summary is exactly what drops
 * it.
 */
function NoticeSheet({ notice, body, onClose }: { notice: TenderNotice; body: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col">
      <div className="px-4 pt-12 pb-3 border-b border-white/10 flex items-start gap-3">
        <button onClick={onClose} className="p-2 -ml-2 text-muted-foreground active:scale-95"
          aria-label="Kapat">
          <X className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground leading-snug">{notice.title}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{notice.ikn} · {notice.category_label}</p>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        <div className="rounded-xl bg-white/[0.03] border border-white/10 divide-y divide-white/5">
          <Row icon={<Building2 className="w-3.5 h-3.5" />} label="İdare" value={notice.authority} />
          {notice.province && (
            <Row icon={<MapPin className="w-3.5 h-3.5" />} label="İl" value={notice.province} />
          )}
          {notice.tender_at_text && (
            <Row icon={<CalendarClock className="w-3.5 h-3.5" />} label="İhale tarihi"
              value={notice.tender_at_text} />
          )}
          {notice.quantity && (
            <Row icon={<Package className="w-3.5 h-3.5" />} label="Niteliği ve miktarı"
              value={notice.quantity} />
          )}
        </div>
        <p className="text-xs text-muted-foreground px-1">İlan metni</p>
        <pre className="rounded-xl bg-black/30 border border-white/10 px-3 py-3 text-[12px] leading-relaxed text-foreground whitespace-pre-wrap font-sans">
          {body}
        </pre>
        <div className="h-4" />
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="px-3.5 py-2.5 flex gap-3">
      <span className="text-muted-foreground mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground break-words">{value}</p>
      </div>
    </div>
  );
}
