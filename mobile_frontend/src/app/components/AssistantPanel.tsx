import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  Bell,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Loader2,
  Lock,
  MessageSquare,
  RefreshCw,
  Send,
  Sparkles,
  Square,
  TrendingUp,
  Users,
  Volume2,
  X,
} from "lucide-react";

import {
  getAssistantBriefing,
  getERPOverview,
  getERPPerformance,
  getERPUsers,
  sendAssistantMessage,
  type AssistantBriefing,
  type AssistantTaskItem,
  type ERPOverview,
  type ERPPerformanceRow,
  type ERPUser,
} from "../api";
import { speakLong, stopAllSpeech } from "../utils/speech";

// ────────────────────────────────────────────────────────────────────────────────
// Spoken-text builders. Style rules that fight TTS monotony:
//  - every list item is its own short sentence with a spoken number ("Bir: X.");
//  - short transition phrases between sections ("Şimdi sırada…", "Son olarak…");
//  - questions at the end vary the prosody and invite the next action.
// ────────────────────────────────────────────────────────────────────────────────

const NUMBER_WORDS = ["Bir", "İki", "Üç", "Dört", "Beş", "Altı", "Yedi", "Sekiz", "Dokuz", "On"];

function numberedTitles(items: AssistantTaskItem[]): string {
  return items
    .map((item, index) => `${NUMBER_WORDS[index] || index + 1}: ${item.title}.`)
    .join(" ");
}

export function briefingToSpeech(userName: string, briefing: AssistantBriefing): string {
  const firstName = (userName || "").trim().split(/\s+/)[0] || "Merhaba";
  const parts: string[] = [`Merhaba ${firstName}.`];
  const total = briefing.overdue.length + briefing.due_today.length + briefing.due_this_week.length
    + briefing.ready_to_start.length + briefing.blocked.length;
  if (total === 0 && briefing.unread_messages === 0) {
    parts.push("Harika görünüyor! Bekleyen işiniz yok. İyi çalışmalar.");
    return parts.join(" ");
  }
  parts.push("Bugünkü raporunuz şöyle.");
  if (briefing.overdue.length > 0) {
    parts.push(`Önce geciken görevler. ${briefing.overdue.length} görev gecikmiş durumda. ${numberedTitles(briefing.overdue)}`);
  }
  if (briefing.due_today.length > 0) {
    parts.push(`Şimdi sırada bugün teslim edilecekler var. ${numberedTitles(briefing.due_today)}`);
  }
  if (briefing.due_this_week.length > 0) {
    parts.push(`Bu hafta içinde teslim edilecekler. ${numberedTitles(briefing.due_this_week)}`);
  }
  if (briefing.ready_to_start.length > 0) {
    parts.push(`İyi haber: ${briefing.ready_to_start.length} görevin önü açıldı. ${numberedTitles(briefing.ready_to_start)}`);
  }
  if (briefing.blocked.length > 0) {
    parts.push(`Bekleyen, bağımlı görevler de şunlar. ${numberedTitles(briefing.blocked)}`);
  }
  if (briefing.unread_messages > 0) {
    parts.push(`Ayrıca ${briefing.unread_messages} okunmamış mesajınız var.`);
  }
  if (briefing.unread_notifications > 0) {
    parts.push(`Ve ${briefing.unread_notifications} okunmamış bildiriminiz bekliyor.`);
  }
  parts.push("Raporum bu kadar.");
  return parts.join(" ");
}

/** A single briefing section, spoken on demand ("sadece gecikenler" replays). */
function sectionToSpeech(briefing: AssistantBriefing, section: SectionKey): string {
  switch (section) {
    case "overdue":
      return briefing.overdue.length === 0
        ? "Geciken göreviniz yok. Harika!"
        : `${briefing.overdue.length} geciken göreviniz var. ${numberedTitles(briefing.overdue)}`;
    case "today":
      return briefing.due_today.length === 0
        ? "Bugün teslim edilecek göreviniz yok."
        : `Bugün teslim edilecekler. ${numberedTitles(briefing.due_today)}`;
    case "week":
      return briefing.due_this_week.length === 0
        ? "Bu hafta teslim edilecek göreviniz görünmüyor."
        : `Bu hafta teslim edilecekler. ${numberedTitles(briefing.due_this_week)}`;
    case "ready":
      return briefing.ready_to_start.length === 0
        ? "Önü açılan yeni görev yok."
        : `Önü açılan görevler. ${numberedTitles(briefing.ready_to_start)} Bunlara başlayabilirsiniz.`;
    case "inbox":
      return `${briefing.unread_messages} okunmamış mesajınız ve ${briefing.unread_notifications} okunmamış bildiriminiz var.`;
  }
}

type SectionKey = "overdue" | "today" | "week" | "ready" | "inbox";

// ────────────────────────────────────────────────────────────────────────────────
// Admin: per-employee report built CLIENT-SIDE from the overview the admin already
// has access to (tasks + assignments) plus the weekly performance rows.
// ────────────────────────────────────────────────────────────────────────────────

type EmployeeReport = {
  name: string;
  overdue: string[];
  dueToday: string[];
  dueThisWeek: string[];
  openOther: number;
  doneThisWeek: number;
  performance: ERPPerformanceRow | null;
};

function buildEmployeeReport(
  employee: ERPUser,
  overview: ERPOverview,
  performance: ERPPerformanceRow[],
): EmployeeReport {
  const now = Date.now();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);
  const weekAhead = now + 7 * 24 * 60 * 60 * 1000;
  const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

  const taskIds = new Set(
    overview.assignments
      .filter(assignment => assignment.assignee_user_id === employee.id)
      .map(assignment => assignment.task_id));
  const tasks = overview.tasks.filter(task => taskIds.has(task.id));

  const report: EmployeeReport = {
    name: employee.name,
    overdue: [],
    dueToday: [],
    dueThisWeek: [],
    openOther: 0,
    doneThisWeek: 0,
    performance: performance.find(row => row.user_id === employee.id) || null,
  };
  for (const task of tasks) {
    const open = !["done", "cancelled"].includes(task.status);
    const deadline = task.deadline_at ? new Date(task.deadline_at).getTime() : null;
    if (task.status === "done") {
      if (task.completed_at && new Date(task.completed_at).getTime() >= weekAgo) {
        report.doneThisWeek += 1;
      }
      continue;
    }
    if (!open) continue;
    // Status OVERDUE counts as overdue even without a deadline (a cleared deadline must not make
    // an escalated task vanish from this list — the employee's own briefing still shows it).
    if (task.status === "overdue" || (deadline !== null && deadline < now)) {
      report.overdue.push(task.title);
    } else if (deadline !== null && deadline <= endOfToday.getTime()) {
      report.dueToday.push(task.title);
    } else if (deadline !== null && deadline <= weekAhead) {
      report.dueThisWeek.push(task.title);
    } else {
      report.openOther += 1;
    }
  }
  return report;
}

function numberedStrings(items: string[]): string {
  return items.map((title, index) => `${NUMBER_WORDS[index] || index + 1}: ${title}.`).join(" ");
}

function employeeReportToSpeech(report: EmployeeReport): string {
  const parts: string[] = [`Seçilen çalışan: ${report.name}.`];
  const hasAnything = report.overdue.length + report.dueToday.length + report.dueThisWeek.length
    + report.openOther + report.doneThisWeek > 0;
  if (!hasAnything) {
    parts.push("Bu çalışanın kayıtlı bir görev hareketi yok.");
    return parts.join(" ");
  }
  if (report.performance?.score != null) {
    parts.push(`Haftalık performans puanı: ${report.performance.score}.`);
  }
  if (report.overdue.length > 0) {
    parts.push(`Dikkat: ${report.overdue.length} görevi gecikmiş. ${numberedStrings(report.overdue)}`);
  } else {
    parts.push("Geciken görevi yok.");
  }
  if (report.dueToday.length > 0) {
    parts.push(`Bugün teslim etmesi gerekenler. ${numberedStrings(report.dueToday)}`);
  }
  if (report.dueThisWeek.length > 0) {
    parts.push(`Bu hafta teslim edecekleri. ${numberedStrings(report.dueThisWeek)}`);
  }
  if (report.openOther > 0) {
    parts.push(`Ayrıca ${report.openOther} açık görevi daha var.`);
  }
  parts.push(`Son bir haftada ${report.doneThisWeek} görev tamamladı.`);
  parts.push("Bu çalışan hakkındaki raporum bu kadar. Başka bir çalışan için ekrandan seçim yapabilirsiniz.");
  return parts.join(" ");
}

function teamSummaryToSpeech(
  users: ERPUser[],
  overview: ERPOverview,
  performance: ERPPerformanceRow[],
): string {
  const reports = users
    .filter(user => user.role !== "admin")
    .map(user => ({ user, report: buildEmployeeReport(user, overview, performance) }))
    .filter(({ report }) =>
      report.overdue.length + report.dueToday.length + report.dueThisWeek.length
      + report.openOther + report.doneThisWeek > 0)
    .sort((a, b) => b.report.overdue.length - a.report.overdue.length);
  if (reports.length === 0) {
    return "Hiçbir çalışanda kayıtlı görev hareketi yok.";
  }
  const parts: string[] = [`Tüm çalışanların özeti. ${reports.length} çalışanda hareket var.`];
  reports.slice(0, 12).forEach(({ report }, index) => {
    const bits: string[] = [];
    if (report.overdue.length > 0) bits.push(`${report.overdue.length} geciken`);
    if (report.dueToday.length > 0) bits.push(`${report.dueToday.length} bugün teslim`);
    if (report.dueThisWeek.length > 0) bits.push(`${report.dueThisWeek.length} bu hafta`);
    if (report.doneThisWeek > 0) bits.push(`${report.doneThisWeek} tamamlanan`);
    const scorePart = report.performance?.score != null ? ` Puanı ${report.performance.score}.` : "";
    parts.push(`${NUMBER_WORDS[index] || index + 1}: ${report.name}. ${bits.join(", ") || "yalnızca açık görevleri var"}.${scorePart}`);
  });
  if (reports.length > 12) {
    parts.push(`Ve ${reports.length - 12} çalışan daha.`);
  }
  parts.push("Özet bu kadar. Detay için ekrandan bir çalışan seçebilirsiniz.");
  return parts.join(" ");
}

// ────────────────────────────────────────────────────────────────────────────────

type ChatTurn = { role: "user" | "assistant"; text: string; target?: "tasks" | "messages" };

const QUICK_PROMPTS = [
  "Geciken görevlerim",
  "Bugün ne teslim",
  "Bu hafta teslim",
  "Önü açılan görevler",
  "Bekleyen görevlerim",
  "Okunmamış mesajlarım",
];

/**
 * Mobit-Asistan v2 — a spoken briefing DIALOG, not just a screen.
 * On open it reads the day automatically, then offers next steps out loud and on screen:
 * users can replay any single section; admins can additionally ask for the all-employees
 * summary or pick one employee from a list and hear that person's full report.
 */
export function AssistantPanel({
  userName,
  isAdmin,
  onClose,
  onOpenTasks,
  onOpenMessages,
}: {
  userName: string;
  isAdmin: boolean;
  onClose: () => void;
  onOpenTasks: () => void;
  onOpenMessages: () => void;
}) {
  const [briefing, setBriefing] = useState<AssistantBriefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Admin-only data for employee reports; loaded lazily and silently.
  const [roster, setRoster] = useState<ERPUser[]>([]);
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const [overview, setOverview] = useState<ERPOverview | null>(null);
  const [performance, setPerformance] = useState<ERPPerformanceRow[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<ERPUser | null>(null);

  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceHint, setVoiceHint] = useState("");
  const threadEndRef = useRef<HTMLDivElement>(null);
  const autoSpokenRef = useRef(false);

  useEffect(() => () => stopAllSpeech(), []);

  // Monotonically increasing run id: an interrupted run's finally/catch must not clobber the
  // indicator state of the run that replaced it.
  const speechRunRef = useRef(0);

  /** INTERRUPT-AND-PLAY: stops whatever is playing and reads `text` — used by every chip and
   *  report action, so one tap always means "read THIS now". */
  const speak = useCallback(async (text: string, hint = "") => {
    const run = ++speechRunRef.current;
    stopAllSpeech();
    setSpeaking(true);
    setVoiceHint(hint);
    try {
      await speakLong(text);
    } catch (exception) {
      if (run === speechRunRef.current) {
        window.alert(exception instanceof Error ? exception.message : "Sesli asistan şu an kullanılamıyor.");
      }
    } finally {
      if (run === speechRunRef.current) {
        setSpeaking(false);
        setVoiceHint("");
      }
    }
  }, []);

  /** Hard stop for the Durdur controls. */
  const stopSpeech = useCallback(() => {
    speechRunRef.current += 1;
    stopAllSpeech();
    setSpeaking(false);
    setVoiceHint("");
  }, []);

  /** The header button stays a predictable toggle: speaking → stop; silent → read the day. */
  const toggleGeneralSpeech = useCallback((text: string) => {
    if (speaking) {
      stopSpeech();
    } else {
      void speak(text, "Günün raporu okunuyor");
    }
  }, [speaking, speak, stopSpeech]);

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

  // Admin extras — failures here must never break the panel (buttons just stay hidden/empty).
  useEffect(() => {
    if (!isAdmin) return;
    let active = true;
    void getERPUsers()
      .then(users => { if (active) setRoster(users); })
      .catch(() => undefined)
      .finally(() => { if (active) setRosterLoaded(true); });
    void getERPOverview().then(data => { if (active) setOverview(data); }).catch(() => undefined);
    void getERPPerformance("week").then(rows => { if (active) setPerformance(rows); }).catch(() => undefined);
    return () => { active = false; };
  }, [isAdmin]);

  // The dialog opener: read the day automatically once, then offer next steps out loud.
  useEffect(() => {
    if (!briefing || autoSpokenRef.current) return;
    autoSpokenRef.current = true;
    // If the user already started some speech (e.g. asked a question and played the reply while
    // the briefing was still loading), don't barge in over it.
    if (speechRunRef.current > 0) return;
    const opener = briefingToSpeech(userName, briefing) + " " + (isAdmin
      ? "Dilerseniz tüm çalışanların özetini, ya da belirli bir çalışanın raporunu okuyabilirim. Ekrandan seçim yapabilirsiniz."
      : "Tekrar dinlemek istediğiniz bir bölüm var mı? Ekrandan seçebilirsiniz.");
    void speak(opener, "Günün raporu okunuyor");
    // speak is intentionally not a dependency: this must fire exactly once per panel open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [briefing]);

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

  const pickEmployee = (employee: ERPUser) => {
    setPickerOpen(false);
    setSelectedEmployee(employee);
    if (!overview) {
      window.alert("Çalışan verileri henüz yüklenemedi — bir saniye sonra tekrar deneyin.");
      return;
    }
    const report = buildEmployeeReport(employee, overview, performance);
    void speak(employeeReportToSpeech(report), `Seçilen çalışan: ${employee.name}`);
  };

  const total = briefing
    ? briefing.overdue.length + briefing.due_today.length + briefing.due_this_week.length
      + briefing.ready_to_start.length + briefing.blocked.length
    : 0;

  const sectionChips: Array<{ key: SectionKey; label: string }> = [
    { key: "overdue", label: "⏰ Gecikenler" },
    { key: "today", label: "📅 Bugün Teslim" },
    { key: "week", label: "🗓 Bu Hafta" },
    { key: "ready", label: "✅ Önü Açılanlar" },
    { key: "inbox", label: "✉️ Mesaj & Bildirim" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
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
          {briefing && (
            <button
              onClick={() => toggleGeneralSpeech(briefingToSpeech(userName, briefing))}
              className={`px-3 h-9 rounded-full flex items-center gap-1.5 text-xs font-semibold active:scale-95 transition-colors ${
                speaking ? "bg-red-500/20 text-red-300" : "bg-violet-500/25 text-violet-200"
              }`}
              aria-label={speaking ? "Konuşmayı durdur" : "Günü sesli anlat"}
            >
              {speaking ? <Square className="w-3.5 h-3.5" /> : <Volume2 className="w-4 h-4" />}
              {speaking ? "Durdur" : "Sesli Anlat"}
            </button>
          )}
          <button
            onClick={() => void load()}
            className="p-2 text-muted-foreground active:scale-95"
            aria-label="Yenile"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
        {speaking && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-violet-500/15 border border-violet-500/30 px-3 py-2">
            <span className="flex gap-0.5 items-end" aria-hidden="true">
              <span className="w-1 h-2 bg-violet-300 rounded-full animate-pulse" />
              <span className="w-1 h-3.5 bg-violet-300 rounded-full animate-pulse [animation-delay:120ms]" />
              <span className="w-1 h-2.5 bg-violet-300 rounded-full animate-pulse [animation-delay:240ms]" />
            </span>
            <p className="text-xs font-semibold text-violet-200 flex-1 truncate">
              🔊 {voiceHint || "Konuşuyor"}…
            </p>
            <button onClick={stopSpeech} className="text-[11px] font-bold text-red-300">
              Durdur
            </button>
          </div>
        )}
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

            {/* Spoken next-steps: exactly what the voice offers, tappable on screen. */}
            <div className="rounded-2xl border border-violet-500/30 bg-violet-500/10 p-3 space-y-2">
              <p className="text-xs font-semibold text-violet-200">
                {isAdmin
                  ? "Dilerseniz size şunların raporunu verebilirim:"
                  : "Tekrar dinlemek istediğiniz bir şey var mı?"}
              </p>
              {isAdmin && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => {
                      if (!overview) {
                        window.alert("Çalışan verileri yükleniyor — bir saniye sonra tekrar deneyin.");
                        return;
                      }
                      void speak(teamSummaryToSpeech(roster, overview, performance), "Tüm çalışanların özeti");
                    }}
                    className="py-2.5 rounded-xl bg-violet-500/20 border border-violet-500/40 text-xs font-bold text-violet-100 active:scale-[0.97] transition-transform flex items-center justify-center gap-1.5"
                  >
                    <Users className="w-4 h-4" /> Tüm Çalışanlar
                  </button>
                  <button
                    onClick={() => setPickerOpen(true)}
                    className="py-2.5 rounded-xl bg-violet-500/20 border border-violet-500/40 text-xs font-bold text-violet-100 active:scale-[0.97] transition-transform flex items-center justify-center gap-1.5"
                  >
                    <TrendingUp className="w-4 h-4" /> Belirli Bir Çalışan
                  </button>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {sectionChips.map(chip => (
                  <button
                    key={chip.key}
                    onClick={() => void speak(sectionToSpeech(briefing, chip.key), chip.label.replace(/^\S+\s/, ""))}
                    className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-200 active:scale-95 transition-transform"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
              {selectedEmployee && (
                <p className="text-[11px] text-violet-300/80">
                  Son okunan çalışan: <span className="font-semibold">{selectedEmployee.name}</span>
                </p>
              )}
            </div>

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

        {/* Chat thread */}
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
                {turn.role === "assistant" && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <button
                      onClick={() => void speak(turn.text)}
                      className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-xs font-semibold text-violet-200 active:scale-95"
                      aria-label="Cevabı seslendir"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                    {turn.target && (
                      <button
                        onClick={() => (turn.target === "messages" ? onOpenMessages() : onOpenTasks())}
                        className="inline-flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-200 active:scale-95"
                      >
                        {turn.target === "messages" ? "Mesajlara git" : "Görevlere git"} →
                      </button>
                    )}
                  </div>
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

      {/* Compose bar */}
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

      {/* Admin: employee picker — the on-screen list the voice offer refers to. */}
      {pickerOpen && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-end" onClick={() => setPickerOpen(false)}>
          <div
            className="w-full max-h-[70%] bg-card rounded-t-3xl flex flex-col"
            onClick={event => event.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <p className="text-base font-bold text-foreground">Hangi çalışanın raporunu okuyayım?</p>
              <button
                onClick={() => setPickerOpen(false)}
                className="w-8 h-8 rounded-full bg-muted flex items-center justify-center"
                aria-label="Kapat"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-2">
              {roster.filter(user => user.role !== "admin").length === 0 && (
                <p className="text-sm text-muted-foreground px-1 py-4">
                  {rosterLoaded ? "Kayıtlı çalışan bulunamadı." : "Çalışan listesi yükleniyor…"}
                </p>
              )}
              {roster.filter(user => user.role !== "admin").map(user => (
                <button
                  key={user.id}
                  onClick={() => pickEmployee(user)}
                  className="w-full flex items-center gap-3 rounded-xl bg-muted px-3 py-3 active:scale-[0.99] transition-transform text-left"
                >
                  <span className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-white shrink-0">
                    {user.name.split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase()}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-foreground truncate">{user.name}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {user.title || "Ünvan yok"}
                    </span>
                  </span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
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
          {items.map((item, index) => (
            <div key={item.id} className="px-4 py-2.5 flex items-start gap-2.5">
              <span className="text-[11px] font-bold text-muted-foreground mt-0.5 shrink-0">{index + 1})</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground leading-snug line-clamp-2 break-words">{item.title}</p>
                {item.deadline_at && (
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Son: {formatDeadline(item.deadline_at)}
                  </p>
                )}
              </div>
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
