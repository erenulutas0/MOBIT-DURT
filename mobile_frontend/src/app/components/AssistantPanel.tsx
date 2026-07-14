import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Loader2,
  Lock,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";

import {
  getAssistantBriefing,
  sendAssistantMessage,
  type AssistantBriefing,
  type AssistantTaskItem,
} from "../api";

type ChatTurn = { role: "user" | "assistant"; text: string; target?: "tasks" | "messages" };

// Tappable quick prompts. Wording matches the rule-based responder's keyword intents
// (gecik / bugün / hafta / hazır / bekleyen / mesaj) so each chip returns a useful answer.
const QUICK_PROMPTS = [
  "Geciken görevlerim",
  "Bugün ne teslim",
  "Bu hafta teslim",
  "Önü açılan görevler",
  "Bekleyen görevlerim",
  "Okunmamış mesajlarım",
];

/**
 * Mobit-Asistan — the personal briefing screen. Renders the caller's workload the way an
 * assistant would report it: what is late, what is due today/this week, which tasks just got
 * unblocked, and what is waiting unread. Read-only; task work continues in the ERP tab.
 */
export function AssistantPanel({
  userName,
  onClose,
  onOpenTasks,
  onOpenMessages,
}: {
  userName: string;
  onClose: () => void;
  onOpenTasks: () => void;
  onOpenMessages: () => void;
}) {
  const [briefing, setBriefing] = useState<AssistantBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const threadEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setBriefing(await getAssistantBriefing());
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Asistan özeti yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns, sending]);

  const send = useCallback(async (override?: string) => {
    const text = (override ?? draft).trim();
    if (!text || sending) return;
    setDraft("");
    setTurns(prev => [...prev, { role: "user", text }]);
    setSending(true);
    try {
      const reply = await sendAssistantMessage(text);
      // Give the reply a "git" shortcut to whatever it is about — messages for message queries,
      // the task list otherwise (the assistant is task-focused).
      const target: ChatTurn["target"] = /mesaj/i.test(text) ? "messages" : "tasks";
      setTurns(prev => [...prev, { role: "assistant", text: reply.reply, target }]);
    } catch (exception) {
      setTurns(prev => [
        ...prev,
        { role: "assistant", text: exception instanceof Error ? exception.message : "Yanıt alınamadı." },
      ]);
    } finally {
      setSending(false);
    }
  }, [draft, sending]);

  const total = briefing
    ? briefing.overdue.length + briefing.due_today.length + briefing.due_this_week.length
      + briefing.ready_to_start.length + briefing.blocked.length
    : 0;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header — deliberately distinct: the assistant identity */}
      <div className="px-4 pt-12 pb-4 bg-gradient-to-b from-violet-950/60 to-background border-b border-violet-500/20">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 -ml-2 text-muted-foreground active:scale-95">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-violet-500/25 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-violet-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">Mobit-Asistan</p>
            <p className="text-xs text-violet-300/80 truncate">{userName}</p>
          </div>
          <button
            onClick={() => void load()}
            className="p-2 text-muted-foreground active:scale-95"
            aria-label="Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading && !briefing && (
          <div className="space-y-3">
            {[0, 1, 2].map(i => (
              <div key={i} className="h-20 rounded-2xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        )}

        {briefing && (
          <>
            <p className="text-sm text-muted-foreground">
              {total === 0 && briefing.unread_messages === 0
                ? "Harika görünüyor — bekleyen bir şey yok. 🎉"
                : "Günün özeti hazır. İşte radarımdaki maddeler:"}
            </p>

            <Section
              title="Geciken görevler"
              icon={<AlertTriangle className="w-4 h-4 text-red-400" />}
              accent="border-red-500/30"
              items={briefing.overdue}
              emptyText={null}
            />
            <Section
              title="Bugün teslim"
              icon={<CalendarClock className="w-4 h-4 text-amber-400" />}
              accent="border-amber-500/30"
              items={briefing.due_today}
              emptyText={null}
            />
            <Section
              title="Bu hafta teslim"
              icon={<CalendarDays className="w-4 h-4 text-blue-400" />}
              accent="border-blue-500/30"
              items={briefing.due_this_week}
              emptyText={null}
            />
            <Section
              title="Önü açılan görevler"
              icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
              accent="border-emerald-500/30"
              items={briefing.ready_to_start}
              emptyText={null}
              hint="Bağımlılıkları tamamlandı — başlayabilirsin."
            />
            <Section
              title="Bekleyen (bağımlı) görevler"
              icon={<Lock className="w-4 h-4 text-slate-400" />}
              accent="border-slate-500/30"
              items={briefing.blocked}
              emptyText={null}
              hint="Önce bağlı oldukları görevlerin bitmesi gerekiyor."
            />

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={onOpenMessages}
                className="bg-card border border-border rounded-xl p-3.5 text-left active:scale-[0.97] transition-transform"
              >
                <div className="flex items-center gap-2 mb-1">
                  <MessageSquare className="w-4 h-4 text-teal-400" />
                  <span className="text-lg font-bold text-foreground">{briefing.unread_messages}</span>
                </div>
                <p className="text-xs text-muted-foreground">Okunmamış mesaj</p>
              </button>
              <button
                onClick={onOpenTasks}
                className="bg-card border border-border rounded-xl p-3.5 text-left active:scale-[0.97] transition-transform"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Bell className="w-4 h-4 text-violet-400" />
                  <span className="text-lg font-bold text-foreground">{briefing.unread_notifications}</span>
                </div>
                <p className="text-xs text-muted-foreground">Okunmamış bildirim</p>
              </button>
            </div>

            <button
              onClick={onOpenTasks}
              className="w-full bg-violet-500/15 border border-violet-500/30 rounded-xl py-3 text-sm font-semibold text-violet-300 active:scale-[0.98] transition-transform"
            >
              Görevlerime Git
            </button>
          </>
        )}

        {/* Chat thread — ask the assistant about your own tasks */}
        <div className="pt-2">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-4 h-4 text-violet-300" />
            <span className="text-sm font-semibold text-foreground">Asistana sor</span>
          </div>
          {turns.length === 0 && (
            <div className="mb-2">
              <p className="text-xs text-muted-foreground mb-2">
                Bir seçenek seç veya kendi sorunu yaz:
              </p>
              <div className="flex flex-wrap gap-2">
                {QUICK_PROMPTS.map(prompt => (
                  <button
                    key={prompt}
                    onClick={() => void send(prompt)}
                    disabled={sending}
                    className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 active:scale-95 disabled:opacity-40 transition-transform"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="space-y-2">
            {turns.map((turn, i) => (
              <div
                key={i}
                className={turn.role === "user" ? "flex flex-col items-end" : "flex flex-col items-start"}
              >
                <div
                  className={
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap " +
                    (turn.role === "user"
                      ? "bg-violet-500/25 text-violet-50 rounded-br-sm"
                      : "bg-card border border-border text-foreground rounded-bl-sm")
                  }
                >
                  {turn.text}
                </div>
                {turn.role === "assistant" && turn.target && (
                  <button
                    onClick={() => (turn.target === "messages" ? onOpenMessages() : onOpenTasks())}
                    className="mt-1.5 inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-200 active:scale-95"
                  >
                    {turn.target === "messages" ? "Mesajlara git" : "Görevlere git"} →
                  </button>
                )}
              </div>
            ))}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-3 py-2">
                  <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
                </div>
              </div>
            )}
            <div ref={threadEndRef} />
          </div>
        </div>
      </div>

      {/* Compose bar — pinned, with a quick-prompt row above the input */}
      <div className="border-t border-border bg-background px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        {turns.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-2 mb-1 [scrollbar-width:none] [-ms-overflow-style:none]">
            {QUICK_PROMPTS.map(prompt => (
              <button
                key={prompt}
                onClick={() => void send(prompt)}
                disabled={sending}
                className="shrink-0 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 active:scale-95 disabled:opacity-40 transition-transform"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Bir şey sor…"
            maxLength={2000}
            className="flex-1 bg-card border border-border rounded-full px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-violet-500/50"
          />
          <button
            onClick={() => void send()}
            disabled={sending || draft.trim().length === 0}
            aria-label="Gönder"
            className="w-10 h-10 rounded-full bg-violet-500 flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform"
          >
            <Send className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  icon,
  accent,
  items,
  emptyText,
  hint,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  items: AssistantTaskItem[];
  emptyText: string | null;
  hint?: string;
}) {
  if (items.length === 0 && emptyText === null) {
    return null;
  }
  return (
    <div className={`bg-card border ${accent} rounded-2xl overflow-hidden`}>
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/60">
        {icon}
        <span className="text-sm font-semibold text-foreground flex-1">{title}</span>
        <span className="text-xs text-muted-foreground">{items.length}</span>
      </div>
      {hint && items.length > 0 && (
        <p className="px-4 pt-2 text-[11px] text-muted-foreground">{hint}</p>
      )}
      {items.length === 0 ? (
        <p className="px-4 py-3 text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="divide-y divide-border/60">
          {items.map(item => (
            <div key={item.id} className="px-4 py-2.5">
              <p className="text-sm text-foreground truncate">{item.title}</p>
              {item.deadline_at && (
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Son: {formatDeadline(item.deadline_at)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatDeadline(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
