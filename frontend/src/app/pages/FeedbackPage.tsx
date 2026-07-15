import { useCallback, useEffect, useState } from "react";
import { Bug, CheckCircle2, HelpCircle, Inbox, Lightbulb, Loader2, Megaphone, RefreshCw } from "lucide-react";

import {
  getERPAnnouncement,
  getERPFeedback,
  publishERPAnnouncement,
  updateERPFeedbackStatus,
  type ERPAnnouncement,
  type ERPFeedback,
} from "../api";

const STATUS_FILTERS = [
  { key: "all", label: "Tümü" },
  { key: "new", label: "Yeni" },
  { key: "read", label: "Okundu" },
  { key: "resolved", label: "Çözüldü" },
];

const CATEGORY_META: Record<string, { label: string; icon: typeof Bug; tone: string }> = {
  bug: { label: "Hata", icon: Bug, tone: "bg-red-100 text-red-700" },
  suggestion: { label: "Öneri", icon: Lightbulb, tone: "bg-amber-100 text-amber-700" },
  question: { label: "Soru", icon: HelpCircle, tone: "bg-blue-100 text-blue-700" },
  other: { label: "Dönüt", icon: Inbox, tone: "bg-slate-100 text-slate-700" },
};

/**
 * Admin panel: employee feedback inbox (from the mobile help area) + announcement editor. The
 * published announcement appears to every user as the dismissible overlay after login.
 */
export function FeedbackPage() {
  const [items, setItems] = useState<ERPFeedback[]>([]);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [announcement, setAnnouncement] = useState<ERPAnnouncement | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [publishing, setPublishing] = useState(false);
  const [publishNote, setPublishNote] = useState("");

  const load = useCallback(async (status: string) => {
    setLoading(true);
    setError("");
    try {
      setItems(await getERPFeedback(status));
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Dönütler yüklenemedi");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  useEffect(() => {
    getERPAnnouncement()
      .then(current => {
        setAnnouncement(current);
        if (current) {
          setTitle(current.title);
          setBody(current.body);
        }
      })
      .catch(() => undefined);
  }, []);

  const setStatus = async (feedback: ERPFeedback, status: string) => {
    try {
      const updated = await updateERPFeedbackStatus(feedback.id, status);
      setItems(prev => prev.map(item => (item.id === updated.id ? updated : item)));
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Durum güncellenemedi");
    }
  };

  const publish = async () => {
    setPublishing(true);
    setPublishNote("");
    try {
      const published = await publishERPAnnouncement(title.trim(), body.trim());
      setAnnouncement(published);
      setPublishNote(published
        ? "Duyuru yayınlandı — kullanıcılar bir sonraki girişte görecek."
        : "Duyuru kaldırıldı.");
    } catch (exception) {
      setPublishNote(exception instanceof Error ? exception.message : "Duyuru yayınlanamadı");
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Announcement editor */}
      <section className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3 shadow-sm">
        <div className="flex items-center gap-2">
          <Megaphone className="w-5 h-5 text-amber-500" />
          <h2 className="text-base font-bold text-slate-900">Uygulama Duyurusu</h2>
        </div>
        <p className="text-sm text-slate-500">
          Buraya yazdığınız duyuru, tüm kullanıcılara girişte kapatılabilir bir ekran olarak gösterilir.
          Duyuruyu güncellediğinizde herkes tekrar görür. İkisini de boş bırakıp yayınlarsanız duyuru kaldırılır.
        </p>
        <input
          value={title}
          onChange={event => setTitle(event.target.value)}
          maxLength={255}
          placeholder="Başlık (örn. Yeni sürüm yayında!)"
          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-teal-500"
        />
        <textarea
          value={body}
          onChange={event => setBody(event.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="Duyuru metni… (örn. Yardım & Dönüt alanı eklendi, görüşlerinizi bekliyoruz!)"
          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-teal-500 resize-y"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={() => void publish()}
            disabled={publishing}
            className="px-5 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold disabled:opacity-60 flex items-center gap-2"
          >
            {publishing && <Loader2 className="w-4 h-4 animate-spin" />} Yayınla
          </button>
          {publishNote && <span className="text-xs text-slate-500">{publishNote}</span>}
          {announcement && !publishNote && (
            <span className="text-xs text-slate-400">
              Aktif duyuru: “{announcement.title}” ({new Date(announcement.updated_at).toLocaleString("tr-TR")})
            </span>
          )}
        </div>
      </section>

      {/* Feedback inbox */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Inbox className="w-5 h-5 text-teal-600" />
            <h2 className="text-base font-bold text-slate-900">Kullanıcı Dönütleri</h2>
          </div>
          <div className="flex items-center gap-2">
            {STATUS_FILTERS.map(item => (
              <button
                key={item.key}
                onClick={() => setFilter(item.key)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold ${
                  filter === item.key ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600"
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              onClick={() => void load(filter)}
              className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center"
              aria-label="Yenile"
            >
              <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? "animate-spin" : ""}`} />
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {loading && items.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">Yükleniyor…</div>
        ) : items.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">
            Bu filtrede dönüt yok. Kullanıcılar mobil uygulamadaki “Yardım & Dönüt” alanından mesaj gönderebilir.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map(item => {
              const meta = CATEGORY_META[item.category] || CATEGORY_META.other;
              const CategoryIcon = meta.icon;
              return (
                <div
                  key={item.id}
                  className={`bg-white border rounded-2xl p-4 shadow-sm ${
                    item.status === "new" ? "border-teal-300" : "border-slate-200"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold ${meta.tone}`}>
                        <CategoryIcon className="w-3 h-3" /> {meta.label}
                      </span>
                      <span className="text-sm font-semibold text-slate-900">{item.user_name}</span>
                      <span className="text-xs text-slate-400">
                        {new Date(item.created_at).toLocaleString("tr-TR")}
                        {item.app_version ? ` · v${item.app_version}` : ""}
                      </span>
                      {item.status === "resolved" && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
                          <CheckCircle2 className="w-3 h-3" /> Çözüldü
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.status === "new" && (
                        <button
                          onClick={() => void setStatus(item, "read")}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-semibold text-slate-600"
                        >
                          Okundu
                        </button>
                      )}
                      {item.status !== "resolved" && (
                        <button
                          onClick={() => void setStatus(item, "resolved")}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-xs font-semibold text-white"
                        >
                          Çözüldü işaretle
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{item.message}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
