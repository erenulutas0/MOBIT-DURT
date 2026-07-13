import { useEffect, useRef, useState } from "react";
import { Megaphone, Send } from "lucide-react";
import { CompanyChatMessage, ERPSession, getCompanyChatMessages, sendCompanyChatMessage } from "../api";

// ─── COMPANY CHAT ("Şirket Geneli") ────────────────────────────────────────────
// A single shared channel every authenticated user can post to. Distinct from the
// per-task MessagesPage thread: no recipient, everyone reads the same feed, and
// the backend hard-deletes the whole channel once a day so it reads fresh daily.
export function CompanyChatPage({ session }: { session: ERPSession }) {
  const [messages, setMessages] = useState<CompanyChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const refresh = async () => {
    try {
      setMessages(await getCompanyChatMessages());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Şirket geneli mesajlar yüklenemedi");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const isOwn = (message: CompanyChatMessage) =>
    session.role === "admin" ? message.author_role === "admin" : message.author_user_id === session.user_id;

  const sendMessage = async () => {
    if (draft.trim().length < 1 || sending) return;
    setSending(true);
    setError("");
    try {
      const sent = await sendCompanyChatMessage(draft.trim());
      setMessages((prev) => [...prev, sent]);
      setDraft("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Mesaj gönderilemedi");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="p-6 flex flex-col h-[calc(100vh-112px)]">
      <div
        className="flex items-center gap-3 rounded-t border border-b-0 border-amber-200 px-4 py-3"
        style={{ background: "linear-gradient(90deg, rgba(217,119,6,0.12), rgba(217,119,6,0.03))" }}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500">
          <Megaphone className="h-4 w-4 text-white" />
        </div>
        <div>
          <p className="text-sm font-bold text-amber-700">Şirket Geneli</p>
          <p className="text-[11px] text-amber-700/70">Herkes yazabilir · mesajlar her gece sıfırlanır</p>
        </div>
      </div>

      <div ref={listRef} className="flex-1 min-h-0 overflow-y-auto border border-t-0 border-amber-200 bg-white px-4 py-4 space-y-3">
        {loading ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Yükleniyor…</div>
        ) : messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
            <Megaphone className="h-8 w-8 text-amber-300" />
            Bugün henüz mesaj yok. İlk mesajı yazan siz olun.
          </div>
        ) : (
          messages.map((message) => {
            const own = isOwn(message);
            return (
              <div key={message.id} className={`flex ${own ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-md rounded px-3 py-2 ${own ? "bg-amber-500 text-white" : "bg-slate-100 text-foreground"}`}>
                  {!own && (
                    <div className="mb-1 flex items-center gap-1.5 text-[10px]">
                      <span className="font-semibold text-muted-foreground">{message.author_name}</span>
                      <span className={`rounded-full px-1.5 py-0.5 font-bold ${message.author_role === "admin" ? "bg-amber-100 text-amber-700" : "bg-slate-200 text-slate-600"}`}>
                        {message.author_role === "admin" ? "Admin" : "Çalışan"}
                      </span>
                    </div>
                  )}
                  <p className="whitespace-pre-wrap text-xs">{message.body}</p>
                  <p className={`mt-1 text-[10px] ${own ? "text-amber-100" : "text-muted-foreground"}`}>
                    {new Date(message.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="flex items-end gap-2 rounded-b border border-t-0 border-amber-200 bg-white p-3">
        <textarea
          rows={2}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              void sendMessage();
            }
          }}
          placeholder="Şirket geneline mesaj yazın..."
          className="flex-1 resize-none rounded border border-border bg-slate-50 px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-amber-400"
        />
        <button
          onClick={() => void sendMessage()}
          disabled={sending || draft.trim().length < 1}
          className="flex items-center gap-1.5 rounded bg-amber-500 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" /> {sending ? "Gönderiliyor" : "Gönder"}
        </button>
      </div>
      {error && <div className="pt-2 text-xs text-red-600">{error}</div>}
    </div>
  );
}
