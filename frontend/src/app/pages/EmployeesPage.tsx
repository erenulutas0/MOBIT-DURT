import { useEffect, useState } from "react";
import { Search, MoreHorizontal, X, Plus } from "lucide-react";
import {
  ERPSession,
  createERPUser,
} from "../api";
import type { LiveData, EmployeeFocus } from "../lib/types";
import { isAdmin, shortName, relativeTime, userStatusLabel } from "../lib/helpers";
import { StatusDot } from "../components/StatusDot";

// ─── EMPLOYEES ────────────────────────────────────────────────────────────────
export function EmployeesPage({ live, session, focus, onFocusClear }: { live: LiveData; session: ERPSession; focus: EmployeeFocus; onFocusClear: () => void }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Tümü");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", role: "employee", email: "", phone: "" });
  const [formError, setFormError] = useState("");
  const overview = live.overview;
  useEffect(() => {
    if (focus === "overdue") {
      setSearch("");
      setStatusFilter("Tümü");
    }
  }, [focus]);
  const visibleUsers = isAdmin(session)
    ? (overview?.users || [])
    : (overview?.users || []).filter((user) => user.id === session.user_id);
  const employees = visibleUsers.map((user) => {
    const assignedTaskIds = overview?.assignments.filter((assignment) => assignment.assignee_user_id === user.id).map((assignment) => assignment.task_id) || [];
    const assignedTasks = overview?.tasks.filter((task) => assignedTaskIds.includes(task.id)) || [];
    return {
      id: user.id,
      name: user.name,
      role: user.role,
      dept: user.role,
      email: user.email || "-",
      phone: user.phone || "-",
      status: userStatusLabel(user.status),
      lastSeen: user.status === "online" ? "Şimdi" : relativeTime(user.last_seen_at),
      active: assignedTasks.filter((task) => task.status !== "done" && task.status !== "cancelled").length,
      done: assignedTasks.filter((task) => task.status === "done").length,
      overdue: assignedTasks.filter((task) => task.status === "overdue").length,
    };
  });
  const filtered = employees.filter(e =>
    (focus !== "overdue" || e.overdue > 0) &&
    (statusFilter === "Tümü" || e.status === statusFilter) &&
    (search === "" || e.name.toLowerCase().includes(search.toLowerCase()) || e.dept.toLowerCase().includes(search.toLowerCase()))
  );
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 bg-white border border-border rounded px-2.5 py-1.5 flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={isAdmin(session) ? "İsim veya departman ara..." : "Profilinizde ara..."} className="text-xs bg-transparent outline-none flex-1" />
        </div>
        {isAdmin(session) && ["Tümü", "Online", "Away", "Offline"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${statusFilter === s ? "bg-teal-600 text-white border-teal-600" : "bg-white border-border text-muted-foreground hover:bg-slate-50"}`}>
            {s}
          </button>
        ))}
        {isAdmin(session) && <div className="ml-auto">
          <button onClick={() => setShowForm((value) => !value)} className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors">
            <Plus className="w-3.5 h-3.5" /> Çalışan Ekle
          </button>
        </div>}
      </div>
      {focus === "overdue" && (
        <div className="flex items-center justify-between rounded border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
          <span>{filtered.length} çalışan gecikmiş görev filtresinde gösteriliyor.</span>
          <button type="button" onClick={onFocusClear} className="flex items-center gap-1 rounded px-2 py-1 font-medium hover:bg-white">
            <X className="h-3 w-3" /> Tüm çalışanlar
          </button>
        </div>
      )}
      {isAdmin(session) && showForm && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setFormError("");
            try {
              await createERPUser({
                name: form.name,
                role: form.role,
                status: "offline",
                email: form.email || null,
                phone: form.phone || null,
              });
              setForm({ name: "", role: "employee", email: "", phone: "" });
              setShowForm(false);
              live.refresh();
            } catch (error) {
              setFormError(error instanceof Error ? error.message : "Çalışan eklenemedi");
            }
          }}
          className="grid grid-cols-[1fr_180px_1fr_1fr_auto] gap-2 bg-white border border-border rounded p-3"
        >
          <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" placeholder="Ad soyad" />
          <select value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} className="text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none">
            <option value="employee">Çalışan</option>
            <option value="manager">Yönetici</option>
            <option value="owner">Şirket sahibi</option>
          </select>
          <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} className="text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" placeholder="E-posta" />
          <input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" placeholder="Telefon" />
          <button className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded px-4">Ekle</button>
          {formError && <div className="col-span-full text-xs text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2">{formError}</div>}
        </form>
      )}
      {!isAdmin(session) && formError && (
        <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2">
          {formError}
        </div>
      )}
      <div className="bg-white border border-border rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-border text-muted-foreground">
              <th className="text-left px-4 py-2.5 font-medium">Ad Soyad</th>
              <th className="text-left px-4 py-2.5 font-medium">Rol / Departman</th>
              <th className="text-left px-4 py-2.5 font-medium">E-posta</th>
              <th className="text-left px-4 py-2.5 font-medium">Durum</th>
              <th className="text-left px-4 py-2.5 font-medium">Son Görülme</th>
              <th className="text-center px-4 py-2.5 font-medium">Aktif</th>
              <th className="text-center px-4 py-2.5 font-medium">Tamamlanan</th>
              <th className="text-center px-4 py-2.5 font-medium">Gecikmiş</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Canlı veride çalışan bulunamadı.</td></tr>
            ) : filtered.map((e) => (
              <tr key={e.id} className="hover:bg-slate-50 transition-colors cursor-pointer">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">
                      {shortName(e.name)}
                    </div>
                    <span className="font-medium text-foreground">{e.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{e.role} <span className="text-slate-400">· {e.dept}</span></td>
                <td className="px-4 py-2.5 text-muted-foreground font-mono">{e.email}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <StatusDot status={e.status} />
                    <span className="text-muted-foreground">{e.status}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{e.lastSeen}</td>
                <td className="px-4 py-2.5 text-center font-mono font-medium text-blue-700">{e.active}</td>
                <td className="px-4 py-2.5 text-center font-mono font-medium text-emerald-700">{e.done}</td>
                <td className="px-4 py-2.5 text-center font-mono font-medium text-red-600">{e.overdue || "—"}</td>
                <td className="px-4 py-2.5">
                  <button className="text-slate-400 hover:text-slate-600">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

