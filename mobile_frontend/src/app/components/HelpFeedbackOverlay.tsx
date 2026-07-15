import { useState } from "react";
import { Bug, HelpCircle, Lightbulb, Loader2, Megaphone, MessageSquare, Send, X } from "lucide-react";

import { sendERPFeedback, type ERPAnnouncement } from "../api";

const CATEGORIES = [
  { key: "bug" as const, label: "Hata", icon: Bug },
  { key: "suggestion" as const, label: "Öneri", icon: Lightbulb },
  { key: "question" as const, label: "Soru", icon: HelpCircle },
];

/**
 * Dimmed help & feedback overlay. Shown automatically after login when a new (undismissed)
 * announcement exists, and openable any time from the Profile page. Contains the current
 * announcement plus a short feedback form (category + message) that lands in the web admin panel.
 */
export function HelpFeedbackOverlay({
  announcement,
  appVersion,
  onClose,
}: {
  announcement: ERPAnnouncement | null;
  appVersion: string;
  onClose: () => void;
}) {
  const [category, setCategory] = useState<"bug" | "suggestion" | "question">("suggestion");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const send = async () => {
    const text = message.trim();
    if (!text || sending) return;
    setSending(true);
    setError("");
    try {
      await sendERPFeedback({ category, message: text, appVersion });
      setMessage("");
      setSent(true);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Dönüt gönderilemedi.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/75 flex items-end justify-center" onClick={onClose}>
      <div
        className="w-full max-w-[480px] max-h-[86dvh] overflow-y-auto bg-card border-t border-border rounded-t-2xl p-5 space-y-4"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary/15 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-primary" />
            </div>
            <h2 className="text-base font-bold text-foreground">Yardım & Dönüt</h2>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0" aria-label="Kapat">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        {announcement && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-1.5">
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-amber-500 shrink-0" />
              <p className="text-sm font-bold text-amber-200">{announcement.title}</p>
            </div>
            <p className="text-sm text-amber-100/90 leading-relaxed whitespace-pre-wrap">{announcement.body}</p>
          </div>
        )}

        {sent ? (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 space-y-2">
            <p className="text-sm font-semibold text-emerald-200">Dönütünüz iletildi, teşekkürler! 🙌</p>
            <p className="text-xs text-emerald-100/80">Geri bildirimleriniz uygulamayı geliştirmemize doğrudan katkı sağlıyor.</p>
            <button onClick={() => setSent(false)} className="text-xs font-semibold text-emerald-300">
              Yeni dönüt yaz
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              Bir hata mı gördünüz, öneriniz mi var? Buradan yazın — mesajınız doğrudan yönetime ulaşır.
            </p>
            <div className="flex gap-2">
              {CATEGORIES.map(item => (
                <button
                  key={item.key}
                  onClick={() => setCategory(item.key)}
                  className={`flex-1 rounded-xl border px-3 py-2.5 text-xs font-semibold flex items-center justify-center gap-1.5 ${
                    category === item.key
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-muted/40 text-muted-foreground"
                  }`}
                >
                  <item.icon className="w-3.5 h-3.5" /> {item.label}
                </button>
              ))}
            </div>
            <textarea
              rows={4}
              value={message}
              onChange={event => setMessage(event.target.value)}
              maxLength={4000}
              placeholder={category === "bug"
                ? "Neyi yaparken, ne oldu? Mümkünse adım adım anlatın…"
                : "Mesajınızı yazın…"}
              className="w-full bg-muted rounded-xl px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none"
            />
            {error && <p className="text-xs text-red-300">{error}</p>}
            <button
              onClick={() => void send()}
              disabled={sending || !message.trim()}
              className="w-full py-3 rounded-xl bg-primary text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Gönder
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
