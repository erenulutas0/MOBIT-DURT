import { Users, ClipboardList, CheckSquare, MessageSquare, UserPlus, ChevronRight, AlertTriangle, Wifi, HelpCircle } from "lucide-react";
import type { Page, LiveData } from "../lib/types";
import { shortName, formatDateShort, relativeTime, taskLabel, getAssignee, overdueEmployeeRows } from "../lib/helpers";
import { Badge } from "../components/Badge";
import { KPICard } from "../components/KPICard";

// ─── ERP OVERVIEW ─────────────────────────────────────────────────────────────
export function ERPOverviewPage({ setPage, live, onEmployeeDrilldown }: { setPage: (p: Page) => void; live: LiveData; onEmployeeDrilldown: () => void }) {
  const overview = live.overview;
  const users = overview?.users || [];
  const tasks = overview?.tasks || [];
  const helpMessages = overview?.help_messages || [];
  const pendingTasks = tasks.filter((task) => task.status === "pending_approval");
  const overdueTasks = tasks.filter((task) => task.status === "overdue");
  const activeTasks = tasks.filter((task) => task.status !== "done" && task.status !== "cancelled");
  const recentTasks = tasks.slice(0, 5);
  const overdueEmployees = overdueEmployeeRows(overview);
  return (
    <div className="p-6 space-y-5">
      {(live.loading || live.error) && (
        <div className={`border rounded px-4 py-2 text-xs ${live.error ? "bg-red-50 border-red-200 text-red-700" : "bg-slate-50 border-border text-muted-foreground"}`}>
          {live.error || "Canlı veriler yükleniyor..."}
        </div>
      )}
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: "Kayıtlı Kullanıcı", value: users.length, icon: Users, color: "bg-slate-50" },
          { label: "Çevrimiçi Çalışan", value: users.filter((user) => user.status === "online").length, icon: Wifi, color: "bg-emerald-50" },
          { label: "Aktif Görev", value: activeTasks.length, icon: ClipboardList, color: "bg-blue-50" },
          { label: "Onay Bekleyen", value: pendingTasks.length, icon: CheckSquare, color: "bg-violet-50" },
          { label: "Gecikmiş Görev", value: overdueTasks.length, icon: AlertTriangle, color: "bg-red-50", onClick: overdueTasks.length ? onEmployeeDrilldown : undefined },
          { label: "Yardım Mesajı", value: helpMessages.length, icon: HelpCircle, color: "bg-amber-50" },
        ].map((k, i) => (
          <KPICard key={i} label={k.label} value={k.value} icon={k.icon} color={k.color} onClick={k.onClick} />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <div className="bg-white border border-border rounded">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Son Görevler</h3>
              <button onClick={() => setPage("tasks")} className="text-xs text-teal-600 hover:underline flex items-center gap-1">
                Tüm görevler <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-slate-50 text-muted-foreground">
                  <th className="text-left px-4 py-2 font-medium">Görev</th>
                  <th className="text-left px-4 py-2 font-medium">Atanan</th>
                  <th className="text-left px-4 py-2 font-medium">Son Tarih</th>
                  <th className="text-left px-4 py-2 font-medium">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {recentTasks.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">Henüz görev yok.</td></tr>
                ) : recentTasks.map((task) => {
                  const assignee = getAssignee(task, overview);
                  return (
                  <tr key={task.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-foreground">{task.title}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{assignee?.name || "Atanmamış"}</td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">{formatDateShort(task.deadline_at)}</td>
                    <td className="px-4 py-2.5"><Badge label={taskLabel(task.status)} /></td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-border rounded">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Tamamlama Onayı Bekleyenler</h3>
              <button onClick={() => setPage("approvals")} className="text-xs text-teal-600 hover:underline flex items-center gap-1">
                Tümü <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="divide-y divide-border">
              {pendingTasks.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">Onay bekleyen görev yok.</div>
              ) : pendingTasks.slice(0, 4).map((task) => {
                const assignee = getAssignee(task, overview);
                return (
                <div key={task.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 text-[10px] font-bold shrink-0">
                    {shortName(assignee?.name || "NA")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{task.title}</p>
                    <p className="text-[10px] text-muted-foreground">{assignee?.name || "Atanmamış"} · {relativeTime(task.created_at)} · Tarih: {formatDateShort(task.deadline_at)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-medium rounded transition-colors">Onayla</button>
                    <button className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-medium rounded transition-colors">Reddet</button>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-border rounded">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Gecikmiş Çalışanlar</h3>
              <button onClick={overdueEmployees.length ? onEmployeeDrilldown : () => setPage("employees")} className="text-xs text-teal-600 hover:underline">Tümü</button>
            </div>
            <div className="divide-y divide-border">
              {overdueEmployees.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">Gecikmiş görevi olan çalışan yok.</div>
              ) : overdueEmployees.slice(0, 5).map(({ user, tasks, nearestDeadline }) => (
                <button key={user.id} type="button" onClick={onEmployeeDrilldown} className="flex w-full items-center gap-2.5 px-4 py-2 text-left hover:bg-slate-50">
                  <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">
                    {shortName(user.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{user.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{tasks.length} gecikmiş görev · En eski: {formatDateShort(nearestDeadline)}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-red-500" />
                    <span className="text-[10px] font-semibold text-red-600">{tasks.length}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white border border-border rounded">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Hızlı İşlemler</h3>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
              {[
                { label: "Görev Ata", icon: ClipboardList, page: "tasks" as Page },
                { label: "Çalışan Ekle", icon: UserPlus, page: "employees" as Page },
                { label: "Mesajlar", icon: MessageSquare, page: "messages" as Page },
                { label: "Onaylar", icon: CheckSquare, page: "approvals" as Page },
              ].map((a, i) => (
                <button
                  key={i}
                  onClick={() => setPage(a.page)}
                  className="flex flex-col items-center gap-1.5 p-2.5 bg-slate-50 hover:bg-slate-100 rounded border border-border transition-colors"
                >
                  <a.icon className="w-4 h-4 text-teal-600" />
                  <span className="text-[10px] font-medium text-foreground">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

