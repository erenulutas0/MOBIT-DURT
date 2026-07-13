import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  Lock,
  MessageSquare,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import { getAssistantBriefing, type AssistantBriefing, type AssistantTaskItem } from "../api";

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
