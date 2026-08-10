import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2, CalendarClock, Loader2, MapPin, Megaphone, Package, RefreshCw, X,
} from "lucide-react";

import {
  getTenderCategories, getTenderNoticeDetail, getTenderNotices, getTenderProfile,
  getTenderProvinces, refreshTenderBulletin, saveTenderProfile,
  type TenderCategoryCount, type TenderNotice, type TenderProvinceCount, type TenderWatchProfile,
} from "../api";
import { TurkeyTenderMap } from "../components/TurkeyTenderMap";

/**
 * "Kamu İhale Bülteni" — the tenders published today, narrowed to the ones worth reading.
 *
 * <p>Four hundred announcements a day are printed and almost none of them are any one company's
 * work. The filters exist to make that number small: the line of work first, because a cable
 * contractor and a bakery share a bulletin and share nothing else, then the province, because most
 * companies bid where they can drive.
 *
 * <p>Cancellations never appear. They are stored — a withdrawn tender is worth knowing about when
 * it comes back — but offering one as something to bid on wastes an afternoon.
 */

const BULLETIN_TYPES = [
  { code: "yapim", label: "Yapım" },
  { code: "mal", label: "Mal" },
  { code: "hizmet", label: "Hizmet" },
  { code: "danismanlik", label: "Danışmanlık" },
];

function remaining(tenderAt: string | null): { text: string; urgent: boolean } | null {
  if (!tenderAt) return null;
  const millis = new Date(tenderAt).getTime() - Date.now();
  if (Number.isNaN(millis)) return null;
  if (millis <= 0) return { text: "Süresi doldu", urgent: true };
  const days = Math.floor(millis / 86_400_000);
  if (days >= 1) return { text: `${days} gün kaldı`, urgent: days <= 3 };
  return { text: `${Math.max(1, Math.floor(millis / 3_600_000))} saat kaldı`, urgent: true };
}

export function TenderBulletinPage() {
  const [notices, setNotices] = useState<TenderNotice[]>([]);
  const [categories, setCategories] = useState<TenderCategoryCount[]>([]);
  const [provinces, setProvinces] = useState<TenderProvinceCount[]>([]);
  const [category, setCategory] = useState<string | null>(null);
  const [province, setProvince] = useState<string | null>(null);
  const [bulletinType, setBulletinType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [opened, setOpened] = useState<{ notice: TenderNotice; body: string } | null>(null);
  const [profile, setProfile] = useState<TenderWatchProfile | null>(null);
  const [saving, setSaving] = useState(false);
  /** On by default: a company that set a profile wants its own work first. */
  const [mineOnly, setMineOnly] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setNote("");
    try {
      const [list, categoryCounts, provinceCounts, watch] = await Promise.all([
        getTenderNotices({ province, category, type: bulletinType, mine: mineOnly }),
        getTenderCategories(),
        getTenderProvinces(),
        getTenderProfile(),
      ]);
      setNotices(list);
      setCategories(categoryCounts);
      setProvinces(provinceCounts);
      setProfile(watch);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "İhale bülteni alınamadı.");
      setNotices([]);
    } finally {
      setLoading(false);
    }
  }, [province, category, bulletinType, mineOnly]);

  /**
   * Saving from the same chips the screen filters by: the admin picks a category, sees what it
   * leaves, and keeps it. A separate settings page would make them set the filter blind.
   */
  const keepAsProfile = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      const saved = await saveTenderProfile({
        categories: category ? [category] : (profile?.categories ?? []),
        provinces: province ? [province] : (profile?.provinces ?? []),
        notifyDaily: profile?.notify_daily ?? true,
      });
      setProfile(saved);
      setNote(saved.categories.length || saved.provinces.length
        ? `Profil kaydedildi: bugün ${saved.matching_count} ihale eşleşiyor.`
        : "Profil temizlendi, bültenin tamamı gösterilecek.");
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Profil kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  }, [saving, category, province, profile]);

  useEffect(() => { void load(); }, [load]);

  const refresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    setError("");
    try {
      const stored = await refreshTenderBulletin();
      // Said after the reload, because loading clears the line. Worth saying at all because
      // "nothing new today" and "the pull failed" are otherwise the same silent screen.
      await load();
      setNote(stored > 0 ? `${stored} yeni ilan eklendi.` : "Bülten çekildi, yeni ilan yok.");
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Bülten çekilemedi.");
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, load]);

  const busiest = useMemo(() => provinces.slice(0, 14), [provinces]);
  const total = useMemo(() => provinces.reduce((sum, row) => sum + row.count, 0), [provinces]);
  const countsByProvince = useMemo(
    () => Object.fromEntries(provinces.map(row => [row.province, row.count])), [provinces]);

  const open = useCallback(async (notice: TenderNotice) => {
    try {
      const detail = await getTenderNoticeDetail(notice.id);
      setOpened({ notice: detail.notice, body: detail.body });
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "İlan açılamadı.");
    }
  }, []);

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
          <Megaphone className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-slate-900">Kamu İhale Bülteni</h1>
          <p className="text-sm text-slate-500">
            {loading ? "Yükleniyor…" : `${notices.length} ilan gösteriliyor · ${total} açık ihale`}
          </p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={refreshing}
          className="inline-flex items-center gap-2 h-9 px-3 rounded-lg bg-amber-600 text-white text-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
          Bülteni çek
        </button>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {note && !error && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">{note}</div>
      )}

      {profile && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
          <button
            onClick={() => setMineOnly(!mineOnly)}
            className={`h-8 px-3 rounded-full border text-xs ${
              mineOnly
                ? "bg-emerald-600 text-white border-emerald-600"
                : "bg-white text-slate-600 border-slate-200"
            }`}
          >
            {mineOnly ? "✓ " : ""}Bize uygun
            {(profile.categories.length > 0 || profile.provinces.length > 0)
              ? ` (${profile.matching_count})` : ""}
          </button>
          <span className="text-xs text-slate-500">
            {profile.categories.length === 0 && profile.provinces.length === 0
              ? "Profil boş — bülten olduğu gibi gösteriliyor."
              : `Profil: ${[...profile.categories.map(code =>
                  categories.find(entry => entry.code === code)?.label ?? code),
                  ...profile.provinces].join(", ")}`}
          </span>
          <button
            onClick={() => void keepAsProfile()}
            disabled={saving}
            className="ml-auto text-xs text-amber-700 underline disabled:opacity-50"
          >
            {category || province ? "Bu seçimi profil yap" : "Profili temizle"}
          </button>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Chip active={!category} label="Tüm işler" onClick={() => setCategory(null)} />
          {categories.filter(entry => entry.count > 0).map(entry => (
            <Chip
              key={entry.code}
              active={category === entry.code}
              label={`${entry.label} · ${entry.count}`}
              onClick={() => setCategory(category === entry.code ? null : entry.code)}
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {BULLETIN_TYPES.map(entry => (
            <Chip
              key={entry.code}
              tone="slate"
              active={bulletinType === entry.code}
              label={entry.label}
              onClick={() => setBulletinType(bulletinType === entry.code ? null : entry.code)}
            />
          ))}
        </div>
      </div>

      <TurkeyTenderMap
        counts={countsByProvince}
        selected={province}
        onSelect={setProvince}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_260px] gap-5">
        <div className="space-y-3">
          {loading && (
            <div className="flex items-center gap-2 py-10 justify-center text-sm text-slate-500">
              <Loader2 className="w-4 h-4 animate-spin" /> İhaleler yükleniyor…
            </div>
          )}

          {!loading && notices.length === 0 && !error && (
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center space-y-1">
              <Megaphone className="w-6 h-6 text-slate-400 mx-auto" />
              <p className="text-sm text-slate-700">Bu filtrelerde açık ihale yok.</p>
              <p className="text-xs text-slate-500">Filtreleri gevşetin; bülten her sabah çekilir.</p>
            </div>
          )}

          {notices.map(notice => {
            const left = remaining(notice.tender_at);
            return (
              <button
                key={notice.id}
                onClick={() => void open(notice)}
                className="w-full text-left rounded-xl border border-slate-200 bg-white hover:border-amber-300 transition-colors overflow-hidden"
              >
                <div className="flex items-center gap-2 px-4 py-2 bg-amber-50 border-b border-amber-100">
                  <span className="text-xs font-semibold text-amber-800">{notice.category_label}</span>
                  <span className="text-xs text-slate-400">·</span>
                  <span className="text-xs text-slate-500">{notice.ikn}</span>
                  {left && (
                    <span className={`ml-auto text-xs font-semibold ${left.urgent ? "text-red-600" : "text-slate-500"}`}>
                      {left.text}
                    </span>
                  )}
                </div>
                <div className="px-4 py-3 space-y-2">
                  <p className="text-sm text-slate-900 leading-snug">{notice.title}</p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1 min-w-0">
                      <Building2 className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate max-w-md">{notice.authority}</span>
                    </span>
                    {notice.province && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />{notice.province}
                      </span>
                    )}
                    {notice.tender_at_text && (
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="w-3.5 h-3.5" />{notice.tender_at_text}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Where the work is. A bar per province rather than a number per province: the shape of
            the list answers "is there anything near us" faster than reading eighty figures. */}
        <aside className="rounded-xl border border-slate-200 bg-white p-4 h-fit space-y-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-slate-500" />
            <p className="text-sm font-semibold text-slate-800">İllere göre</p>
          </div>
          {busiest.length === 0 && <p className="text-xs text-slate-500">Henüz veri yok.</p>}
          {busiest.map(row => {
            const share = busiest[0].count > 0 ? (row.count / busiest[0].count) * 100 : 0;
            return (
              <button
                key={row.province}
                onClick={() => setProvince(province === row.province ? null : row.province)}
                className="w-full text-left group"
              >
                <div className="flex items-center justify-between text-xs mb-0.5">
                  <span className={province === row.province ? "font-semibold text-amber-700" : "text-slate-700"}>
                    {row.province}
                  </span>
                  <span className="text-slate-500">{row.count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${province === row.province ? "bg-amber-500" : "bg-slate-300 group-hover:bg-amber-300"}`}
                    style={{ width: `${Math.max(4, share)}%` }}
                  />
                </div>
              </button>
            );
          })}
          {province && (
            <button onClick={() => setProvince(null)} className="text-xs text-amber-700 underline">
              İl filtresini kaldır
            </button>
          )}
        </aside>
      </div>

      {opened && (
        <NoticeDialog notice={opened.notice} body={opened.body} onClose={() => setOpened(null)} />
      )}
    </div>
  );
}

function Chip({ active, label, onClick, tone = "amber" }: {
  active: boolean; label: string; onClick: () => void; tone?: "amber" | "slate";
}) {
  const activeTone = tone === "amber"
    ? "bg-amber-600 text-white border-amber-600"
    : "bg-slate-700 text-white border-slate-700";
  return (
    <button
      onClick={onClick}
      className={`h-8 px-3 rounded-full border text-xs transition-colors ${
        active ? activeTone : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
      }`}
    >
      {label}
    </button>
  );
}

/**
 * The announcement as printed. Shown whole rather than summarised: what decides whether a company
 * can do the work is a line like "3x240/25 mm² XLPE kablo" buried in the specification, and a
 * summary is exactly what drops it.
 */
function NoticeDialog({ notice, body, onClose }: {
  notice: TenderNotice; body: string; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-6"
      onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden"
        onClick={event => event.stopPropagation()}>
        <div className="px-5 py-4 border-b border-slate-200 flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 leading-snug">{notice.title}</p>
            <p className="text-xs text-slate-500 mt-0.5">{notice.ikn} · {notice.category_label}</p>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700" aria-label="Kapat">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field icon={<Building2 className="w-3.5 h-3.5" />} label="İdare" value={notice.authority} />
            {notice.province && (
              <Field icon={<MapPin className="w-3.5 h-3.5" />} label="İl" value={notice.province} />
            )}
            {notice.tender_at_text && (
              <Field icon={<CalendarClock className="w-3.5 h-3.5" />} label="İhale tarihi"
                value={notice.tender_at_text} />
            )}
            {notice.quantity && (
              <Field icon={<Package className="w-3.5 h-3.5" />} label="Niteliği ve miktarı"
                value={notice.quantity} />
            )}
          </dl>
          <div>
            <p className="text-xs text-slate-500 mb-1">İlan metni</p>
            <pre className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-3 text-xs leading-relaxed text-slate-800 whitespace-pre-wrap font-sans">
              {body}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 px-3 py-2">
      <dt className="text-xs text-slate-500 inline-flex items-center gap-1">{icon}{label}</dt>
      <dd className="text-sm text-slate-800 break-words">{value}</dd>
    </div>
  );
}
