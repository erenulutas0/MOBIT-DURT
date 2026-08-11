import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Building2, CalendarClock, Check, ClipboardList, Loader2, MapPin, Megaphone, Package,
  RefreshCw, X,
} from "lucide-react";

import {
  getTenderCategories, getTenderNoticeDetail, getTenderNotices, getTenderProfile,
  openTenderTask, refreshTenderBulletin, saveTenderProfile, tenderProfileIsSet as profileIsSet,
  type TenderCategoryCount, type TenderNotice, type TenderWatchProfile,
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

export function TenderBulletinPanel({ isAdmin, autoEditProfile = false, onClose }: {
  isAdmin: boolean;
  /**
   * Open the profile form as soon as the profile is known, for the setup checklist on the home
   * screen. Landing on the bulletin and then hunting for a small grey button is how a two-tap
   * setup step turns into a support call.
   */
  autoEditProfile?: boolean;
  onClose: () => void;
}) {
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
  const [profile, setProfile] = useState<TenderWatchProfile | null>(null);
  const [editingProfile, setEditingProfile] = useState(false);
  /**
   * Starts on. A company that set a profile wants its own work first; one that has not set a
   * profile is watching everything anyway, so the switch costs it nothing either way.
   */
  const [mineOnly, setMineOnly] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    setNote("");
    try {
      const [list, counts, watch] = await Promise.all([
        getTenderNotices({ province, category, type: bulletinType, mine: mineOnly }),
        getTenderCategories(),
        getTenderProfile(),
      ]);
      setNotices(list);
      setCategories(counts);
      setProfile(watch);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "İhale bülteni alınamadı.");
      setNotices([]);
    } finally {
      setLoading(false);
    }
  }, [province, category, bulletinType, mineOnly]);

  useEffect(() => { void load(); }, [load]);

  const autoOpened = useRef(false);
  useEffect(() => {
    // Once, on arrival. Every filter change reloads the profile, and re-opening the form each time
    // would trap somebody who closed it. Only an admin can save it anyway.
    if (autoEditProfile && isAdmin && profile && !autoOpened.current) {
      autoOpened.current = true;
      setEditingProfile(true);
    }
  }, [autoEditProfile, isAdmin, profile]);

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
      <div className="px-4 pt-12 pb-3 border-b border-border">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 -ml-2 text-muted-foreground active:scale-95"
            aria-label="Geri">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Megaphone className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">Kamu İhale Bülteni</p>
            <p className="text-xs text-muted-foreground truncate">
              {loading ? "Yükleniyor…" : `${notices.length} açık ihale`}
            </p>
          </div>
          {isAdmin && (
            <button onClick={() => void refresh()} disabled={refreshing}
              className="p-2 text-primary active:scale-95 disabled:opacity-40" aria-label="Bülteni çek">
              <RefreshCw className={`w-5 h-5 ${refreshing ? "animate-spin" : ""}`} />
            </button>
          )}
        </div>

        {/* What the company watches for, and the switch that applies it. Shown to everyone,
            editable by an admin: an employee whose list is short has to be able to see why. */}
        {profile && (
          <div className="mt-3 flex items-center gap-2">
            <button
              onClick={() => setMineOnly(!mineOnly)}
              className={`h-8 px-3 rounded-lg border text-xs whitespace-nowrap active:scale-95 inline-flex items-center gap-1.5 ${
                mineOnly
                  ? "bg-primary/15 text-primary border-primary/40"
                  : "bg-white/[0.04] text-muted-foreground border-white/10"
              }`}
            >
              {mineOnly && <Check className="w-3.5 h-3.5" />}
              Bize uygun{profileIsSet(profile) ? ` (${profile.matching_count})` : ""}
            </button>
            {isAdmin && (
              <button
                onClick={() => setEditingProfile(true)}
                className="h-8 px-3 rounded-full border border-white/10 bg-white/[0.04] text-xs text-muted-foreground active:scale-95"
              >
                {profileIsSet(profile) ? "Profili düzenle" : "Profil belirle"}
              </button>
            )}
          </div>
        )}

        {profile && !profileIsSet(profile) && mineOnly && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Henüz iş kolu seçilmedi, bülten olduğu gibi gösteriliyor.
          </p>
        )}

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
          <div className="rounded-xl bg-primary/10 border border-border px-3 py-2.5 text-sm text-primary">
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
              <div className="flex items-center gap-2 px-3.5 py-2 bg-primary/10 border-b border-border">
                <span className="text-[11px] font-semibold text-primary">{notice.category_label}</span>
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

      {opened && (
        <NoticeSheet notice={opened.notice} body={opened.body} isAdmin={isAdmin}
          onClose={() => setOpened(null)} />
      )}

      {editingProfile && profile && (
        <ProfileSheet
          profile={profile}
          categories={categories}
          provinces={provinces.map(([name]) => name)}
          onClose={() => setEditingProfile(false)}
          onSaved={saved => { setProfile(saved); setEditingProfile(false); void load(); }}
        />
      )}
    </div>
  );
}

/**
 * The form that decides what "bize uygun" means.
 *
 * <p>It shows the count as you pick, because the only question anybody has here is "how much does
 * this leave me" — and a filter you cannot see the effect of is a filter people set once, get an
 * empty screen from, and never trust again.
 */
function ProfileSheet({ profile, categories, provinces, onClose, onSaved }: {
  profile: TenderWatchProfile;
  categories: TenderCategoryCount[];
  provinces: string[];
  onClose: () => void;
  onSaved: (saved: TenderWatchProfile) => void;
}) {
  const [picked, setPicked] = useState<string[]>(profile.categories);
  const [places, setPlaces] = useState<string[]>(profile.provinces);
  const [notify, setNotify] = useState(profile.notify_daily);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter(item => item !== value) : [...list, value];

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      onSaved(await saveTenderProfile({ categories: picked, provinces: places, notifyDaily: notify }));
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-background flex flex-col">
      <div className="px-4 pt-12 pb-3 border-b border-white/10 flex items-center gap-3">
        <button onClick={onClose} className="p-2 -ml-2 text-muted-foreground active:scale-95"
          aria-label="Kapat">
          <X className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">İhale profili</p>
          <p className="text-xs text-muted-foreground">Hangi ihaleler sizin işiniz?</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}

        <section className="space-y-2">
          <p className="text-xs text-muted-foreground">
            İş kolu — hiçbiri seçilmezse tüm iş kolları gösterilir
          </p>
          <div className="flex flex-wrap gap-2">
            {categories.map(entry => (
              <Chip
                key={entry.code}
                active={picked.includes(entry.code)}
                label={`${entry.label} ${entry.count}`}
                onClick={() => setPicked(toggle(picked, entry.code))}
              />
            ))}
          </div>
        </section>

        <section className="space-y-2">
          <p className="text-xs text-muted-foreground">
            İl — hiçbiri seçilmezse Türkiye geneli
          </p>
          <div className="flex flex-wrap gap-2">
            {[...new Set([...places, ...provinces])].map(name => (
              <Chip
                key={name}
                tone="slate"
                active={places.includes(name)}
                label={name}
                onClick={() => setPlaces(toggle(places, name))}
              />
            ))}
          </div>
          {provinces.length === 0 && places.length === 0 && (
            <p className="text-[11px] text-muted-foreground">
              Bugünün bülteninde il bilgisi yok; iller çekim yapıldıkça listelenir.
            </p>
          )}
        </section>

        <label className="flex items-center gap-3 rounded-xl bg-white/[0.03] border border-white/10 px-3.5 py-3">
          <input
            type="checkbox"
            checked={notify}
            onChange={event => setNotify(event.target.checked)}
            className="w-4 h-4 accent-emerald-500"
          />
          <span className="text-sm text-foreground flex-1">Her sabah bildirim gönder</span>
        </label>
        <p className="text-[11px] text-muted-foreground -mt-3">
          {picked.length === 0 && places.length === 0
            ? "İş kolu ya da il seçilmeden bildirim gönderilmez — aksi hâlde her sabah bültenin tamamı bildirilirdi."
            : "Size uygun ihale çıkmayan günlerde bildirim gitmez."}
        </p>

        <div className="h-4" />
      </div>

      <div className="px-4 pb-8 pt-3 border-t border-white/10">
        <button
          onClick={() => void save()}
          disabled={saving}
          className="w-full h-11 rounded-xl bg-primary/10 text-primary text-sm font-semibold active:scale-[0.99] disabled:opacity-40"
        >
          {saving ? "Kaydediliyor…" : "Kaydet"}
        </button>
      </div>
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
    ? "bg-primary/10 text-primary border-primary/40"
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
function NoticeSheet({ notice, body, isAdmin, onClose }: {
  notice: TenderNotice;
  body: string;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const [taskId, setTaskId] = useState<number | null>(notice.task_id);
  const [opening, setOpening] = useState(false);
  const [taskError, setTaskError] = useState("");

  const openTask = async () => {
    if (opening || taskId !== null) return;
    setOpening(true);
    setTaskError("");
    try {
      const created = await openTenderTask(notice.id);
      setTaskId(created.task_id);
    } catch (exception) {
      setTaskError(exception instanceof Error ? exception.message : "Görev açılamadı.");
    } finally {
      setOpening(false);
    }
  };

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
        {isAdmin && (
          <button
            onClick={() => void openTask()}
            disabled={opening || taskId !== null}
            className="w-full h-11 rounded-xl bg-primary/15 text-primary text-sm font-semibold active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <ClipboardList className="w-4 h-4" />
            {taskId !== null
              ? `Görev açıldı (#${taskId})`
              : opening ? "Görev açılıyor…" : "Hazırlık görevi aç"}
          </button>
        )}
        {taskError && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2.5 text-sm text-red-300">
            {taskError}
          </div>
        )}
        {taskId !== null && !taskError && (
          <p className="text-[11px] text-muted-foreground px-1">
            Görev, ihale saatine göre son teslim tarihi taşıyor; hatırlatmalar ona göre çalışır.
          </p>
        )}

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
