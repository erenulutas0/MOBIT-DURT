import { ClipboardList, CheckSquare, FileText, Bot, AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import type { Page, LiveData } from "../lib/types";
import { shortName, relativeTime, taskLabel, getAssignee, overdueEmployeeRows } from "../lib/helpers";
import { KPICard } from "../components/KPICard";
import { SetupCard } from "../components/SetupCard";

// ─── HOME PAGE ───────────────────────────────────────────────────────────────
export function HomePage({ setPage, live, isAdmin, onEmployeeDrilldown }: { setPage: (p: Page) => void; live: LiveData; isAdmin: boolean; onEmployeeDrilldown: () => void }) {
  const overview = live.overview;
  const tasks = overview?.tasks || [];
  const users = overview?.users || [];
  const activeTasks = tasks.filter((task) => task.status === "in_progress" || task.status === "todo");
  const pendingTasks = tasks.filter((task) => task.status === "pending_approval");
  const overdueTasks = tasks.filter((task) => task.status === "overdue");
  const overdueEmployees = overdueEmployeeRows(overview);
  const todayDocuments = live.documents.filter((document) => new Date(document.timestamp).toDateString() === new Date().toDateString());
  const unclassifiedDocuments = live.documents.filter((document) => !document.organization || document.status === "unclassified");
  const recentActivities = [
    ...live.documents.slice(0, 3).map((document) => ({
      user: "Telegram Botu",
      action: `${document.original_filename || document.stored_filename || "Belge"} alındı`,
      time: relativeTime(document.timestamp),
      type: "bot",
    })),
    ...tasks.slice(0, 3).map((task) => ({
      user: getAssignee(task, overview)?.name || "Sistem",
      action: `${task.title} - ${taskLabel(task.status)}`,
      time: relativeTime(task.created_at),
      type: task.status === "pending_approval" ? "approve" : "task",
    })),
  ].slice(0, 6);
  return (
    <div className="p-6 space-y-6">
      {live.error && <div className="bg-red-50 border border-red-100 text-red-700 rounded px-4 py-2 text-xs">{live.error}</div>}

      {/* Above the numbers, and only until the four steps are done. On a company's first morning
          those numbers are all technically correct and all meaningless, and the useful thing to say
          is what to do about it. Admin-only: all four are admin actions, and a checklist you have
          no way to complete is just a reproach. */}
      {isAdmin && <SetupCard setPage={setPage} />}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => setPage("erp-overview")}
          className="bg-white border border-border rounded p-6 text-left hover:border-teal-300 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-50 rounded flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">ERP-TAKIP</h2>
              <p className="text-xs text-muted-foreground">Dahili görev ve çalışan yönetimi</p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-teal-500 ml-auto transition-colors" />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-slate-50 rounded p-2 text-center">
              <p className="text-lg font-bold font-mono text-foreground">{activeTasks.length}</p>
              <p className="text-[10px] text-muted-foreground">Aktif Görev</p>
            </div>
            <div className="bg-slate-50 rounded p-2 text-center">
              <p className="text-lg font-bold font-mono text-foreground">{pendingTasks.length}</p>
              <p className="text-[10px] text-muted-foreground">Bekleyen Onay</p>
            </div>
            <div className="bg-red-50 rounded p-2 text-center">
              <p className="text-lg font-bold font-mono text-red-600">{overdueTasks.length}</p>
              <p className="text-[10px] text-red-500">Gecikmiş</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setPage("tender-dashboard")}
          className="bg-white border border-border rounded p-6 text-left hover:border-teal-300 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-teal-50 rounded flex items-center justify-center">
              <FileText className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Tender Hub</h2>
              <p className="text-xs text-muted-foreground">İhale belgesi zekası & Telegram botu</p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-teal-500 ml-auto transition-colors" />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-slate-50 rounded p-2 text-center">
              <p className="text-lg font-bold font-mono text-foreground">{live.documents.length}</p>
              <p className="text-[10px] text-muted-foreground">Toplam Belge</p>
            </div>
            <div className="bg-slate-50 rounded p-2 text-center">
              <p className="text-lg font-bold font-mono text-foreground">{todayDocuments.length}</p>
              <p className="text-[10px] text-muted-foreground">Bugün Alınan</p>
            </div>
            <div className="bg-amber-50 rounded p-2 text-center">
              <p className="text-lg font-bold font-mono text-amber-600">{unclassifiedDocuments.length}</p>
              <p className="text-[10px] text-amber-600">Sınıflandırılmamış</p>
            </div>
          </div>
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <KPICard label="Aktif Görevler" value={activeTasks.length} icon={ClipboardList} color="bg-blue-50" sub={`${users.length} kayıtlı kişi`} />
        <KPICard label="Bekleyen Onaylar" value={pendingTasks.length} icon={CheckSquare} color="bg-violet-50" sub="Admin incelemesi gerekli" />
        <KPICard label="Bugün Alınan Belge" value={todayDocuments.length} icon={FileText} color="bg-teal-50" sub={`${live.documents.length} toplam belge`} />
        <KPICard
          label="Gecikmiş Görevler"
          value={overdueTasks.length}
          icon={AlertTriangle}
          color="bg-red-50"
          sub={overdueTasks.length ? `${overdueEmployees.length} çalışan etkileniyor` : "Gecikme yok"}
          onClick={overdueTasks.length ? onEmployeeDrilldown : undefined}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white border border-border rounded">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-xs font-semibold text-foreground">Son Aktiviteler</h3>
            <button className="text-xs text-teal-600 hover:underline">Tümünü gör</button>
          </div>
          <div className="divide-y divide-border">
            {recentActivities.length === 0 && <div className="px-4 py-8 text-xs text-muted-foreground">Henüz gerçek aktivite yok.</div>}
            {recentActivities.map((a, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${a.type === "bot" ? "bg-slate-100 text-slate-500" : a.type === "approve" ? "bg-emerald-100 text-emerald-600" : a.type === "upload" ? "bg-teal-100 text-teal-600" : "bg-blue-100 text-blue-600"}`}>
                  {a.type === "bot" ? <Bot className="w-3 h-3" /> : shortName(a.user)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate"><span className="font-medium">{a.user}</span> — {a.action}</p>
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{a.time}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-border rounded">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-xs font-semibold text-foreground">Sistem Durumu</h3>
          </div>
          <div className="p-4 space-y-3">
            {[
              { label: "Telegram Botu", status: live.documents.some((document) => document.source === "telegram"), detail: `${live.documents.filter((document) => document.source === "telegram").length} belge` },
              { label: "Backend API", status: !live.error, detail: live.loading ? "Yükleniyor" : "Bağlı" },
              { label: "Vault Sync", status: live.vaultNotes.length > 0, detail: `${live.vaultNotes.length} not` },
              { label: "Dosya Depolama", status: live.documents.length > 0, detail: `${live.documents.length} dosya kaydı` },
              { label: "AI Servisi", status: false, detail: "Henüz MVP dışında" },
            ].map((s, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${s.status ? "bg-emerald-500" : "bg-red-500"}`} />
                  <span className="text-xs font-medium text-foreground">{s.label}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">{s.detail}</span>
              </div>
            ))}
          </div>
          <div className="px-4 pb-4 pt-2">
            <button className="w-full bg-slate-50 hover:bg-slate-100 border border-border text-xs font-medium text-foreground rounded py-1.5 transition-colors flex items-center justify-center gap-1.5">
              <RefreshCw className="w-3 h-3" /> Durumu Yenile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
