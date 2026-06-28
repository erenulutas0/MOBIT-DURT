import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileText,
  MessageSquare,
  Paperclip,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  TimerReset,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createERPTask, createERPUser, deleteERPUser, getERPOverview, updateERPTaskStatus } from "../api";
import {
  approveERPTaskCompletion,
  createERPTaskComment,
  rejectERPTaskCompletion,
  requestERPTaskCompletion,
} from "../api";
import type { FormEvent } from "react";
import type { ERPOverview, ERPTask, ERPUser } from "../api";
import type { SessionRole } from "./HomeView";

type ERPSection = "overview" | "people" | "tasks" | "help";

type ERPTrackingViewProps = {
  section: ERPSection;
  sessionRole: SessionRole;
  currentUserId: number | null;
};

const statusStyle = {
  online: { label: "Online", color: "var(--success)", bg: "var(--success-bg)" },
  away: { label: "Away", color: "var(--warning)", bg: "var(--warning-bg)" },
  offline: { label: "Offline", color: "var(--muted-foreground)", bg: "var(--muted)" },
};

const taskStatusStyle = {
  todo: { label: "Todo", color: "var(--info)", bg: "var(--info-bg)" },
  in_progress: { label: "In progress", color: "var(--primary)", bg: "var(--secondary)" },
  blocked: { label: "Blocked", color: "var(--warning)", bg: "var(--warning-bg)" },
  pending_approval: { label: "Onay bekliyor", color: "var(--warning)", bg: "var(--warning-bg)" },
  done: { label: "Done", color: "var(--success)", bg: "var(--success-bg)" },
  overdue: { label: "Overdue", color: "var(--destructive)", bg: "#fff1f2" },
  cancelled: { label: "Cancelled", color: "var(--muted-foreground)", bg: "var(--muted)" },
};

export function ERPTrackingView({ section, sessionRole, currentUserId }: ERPTrackingViewProps) {
  const [overview, setOverview] = useState<ERPOverview | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showUserForm, setShowUserForm] = useState(false);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [userForm, setUserForm] = useState({ name: "", role: "employee", email: "" });
  const [taskSearch, setTaskSearch] = useState("");
  const [taskStatusFilter, setTaskStatusFilter] = useState("all");
  const [taskForm, setTaskForm] = useState({
    title: "",
    description: "",
    assigneeUserId: "",
    priority: "normal",
    deadlineAt: "",
  });
  const [messageForm, setMessageForm] = useState({ taskId: "", body: "" });

  const loadOverview = useCallback((silent = false) => {
    if (!silent) {
      setBusy(true);
      setError("");
    }
    getERPOverview()
      .then(setOverview)
      .catch((err) => {
        if (!silent) setError(err.message);
      })
      .finally(() => {
        if (!silent) setBusy(false);
      });
  }, []);

  useEffect(() => {
    loadOverview();
    const refreshTimer = window.setInterval(() => loadOverview(true), 4000);
    return () => window.clearInterval(refreshTimer);
  }, [loadOverview]);

  const users = overview?.users || [];
  const tasks = overview?.tasks || [];
  const assignments = overview?.assignments || [];
  const documents = overview?.documents || [];
  const teams = overview?.teams || [];
  const helpMessages = overview?.help_messages || [];
  const isAdmin = sessionRole === "admin";
  const assignableUsers = users.filter((user) => user.approved_at !== null);
  const currentUser = isAdmin ? null : users.find((user) => user.id === currentUserId) || null;
  const currentUserTaskIds = new Set(
    assignments
      .filter((assignment) => currentUser && assignment.assignee_user_id === currentUser.id)
      .map((assignment) => assignment.task_id)
  );
  const visibleTasks = isAdmin ? tasks : tasks.filter((task) => currentUserTaskIds.has(task.id));
  const visibleUsers = isAdmin ? users : currentUser ? [currentUser] : [];
  const visibleHelpMessages = isAdmin
    ? helpMessages
    : helpMessages.filter((message) => currentUser && (message.author_user_id === currentUser.id || currentUserTaskIds.has(message.task_id)));
  const overdueTasks = visibleTasks.filter((task) => task.status === "overdue");
  const pendingApprovalTasks = visibleTasks.filter((task) => task.status === "pending_approval");
  const activeTasks = visibleTasks.filter((task) => task.status !== "done" && task.status !== "cancelled");

  const userRows = useMemo(() => visibleUsers.map((user) => {
    const assignedTaskIds = assignments
      .filter((assignment) => assignment.assignee_user_id === user.id)
      .map((assignment) => assignment.task_id);
    const assignedTasks = tasks.filter((task) => assignedTaskIds.includes(task.id));
    const activeTask = assignedTasks.find((task) => task.status !== "done" && task.status !== "cancelled");
    const overdue = assignedTasks.filter((task) => task.status === "overdue").length;
    const done = assignedTasks.filter((task) => task.status === "done").length;
    return { ...user, activeTask: activeTask?.title || "Aktif gorev yok", assignedTasks, overdue, done };
  }), [visibleUsers, tasks, assignments]);

  useEffect(() => {
    if (!selectedUserId && userRows.length > 0) setSelectedUserId(userRows[0].id);
  }, [selectedUserId, userRows]);

  const selectedUser = userRows.find((user) => user.id === selectedUserId) || userRows[0] || null;

  const assigneeName = (task: ERPTask) => {
    const assignment = assignments.find((item) => item.task_id === task.id && item.assignee_user_id);
    if (assignment?.assignee_user_id) return users.find((user) => user.id === assignment.assignee_user_id)?.name || "Bilinmeyen kisi";
    const teamAssignment = assignments.find((item) => item.task_id === task.id && item.assignee_team_id);
    if (teamAssignment?.assignee_team_id) return teams.find((team) => team.id === teamAssignment.assignee_team_id)?.name || "Bilinmeyen grup";
    return "Atanmadi";
  };

  const taskScope = (task: ERPTask) => {
    const assignment = assignments.find((item) => item.task_id === task.id && item.assignee_team_id);
    return assignment ? teams.find((team) => team.id === assignment.assignee_team_id)?.name || "Grup" : "Kisisel";
  };

  const documentCount = (task: ERPTask) => documents.filter((doc) => doc.task_id === task.id).length;

  const handleCreateUser = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    await createERPUser({
      name: userForm.name,
      role: userForm.role,
      status: "offline",
      email: userForm.email || null,
    }).catch((err) => {
      setError(err.message);
      throw err;
    });
    setUserForm({ name: "", role: "employee", email: "" });
    setShowUserForm(false);
    loadOverview();
  };

  const handleCreateTask = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    await createERPTask({
      title: taskForm.title,
      description: taskForm.description || null,
      assignee_user_ids: taskForm.assigneeUserId ? [Number(taskForm.assigneeUserId)] : [],
      assignee_team_ids: [],
      priority: taskForm.priority,
      deadline_at: taskForm.deadlineAt ? new Date(taskForm.deadlineAt).toISOString() : null,
    }).catch((err) => {
      setError(err.message);
      throw err;
    });
    setTaskForm({ title: "", description: "", assigneeUserId: "", priority: "normal", deadlineAt: "" });
    setShowTaskForm(false);
    loadOverview();
  };

  const handleDeleteUser = async (user: ERPUser) => {
    if (!window.confirm(`${user.name} hesabi silinsin mi? Gorev gecmisi kalir, aktif atamalar ve bildirimler temizlenir.`)) return;
    setError("");
    await deleteERPUser(user.id).catch((err) => {
      setError(err.message);
      throw err;
    });
    setSelectedUserId(null);
    loadOverview();
  };

  const handleStatusChange = async (taskId: number, status: string) => {
    setError("");
    await updateERPTaskStatus(taskId, status).catch((err) => {
      setError(err.message);
      throw err;
    });
    loadOverview();
  };

  const handleCompletionRequest = async (taskId: number) => {
    setError("");
    await requestERPTaskCompletion(taskId, currentUserId, "Gorev bitti, admin onayi bekleniyor.").catch((err) => {
      setError(err.message);
      throw err;
    });
    loadOverview();
  };

  const handleApproveCompletion = async (taskId: number) => {
    setError("");
    await approveERPTaskCompletion(taskId, "admin").catch((err) => {
      setError(err.message);
      throw err;
    });
    loadOverview();
  };

  const handleRejectCompletion = async (taskId: number) => {
    setError("");
    await rejectERPTaskCompletion(taskId, "admin", "Admin gorevi tekrar calismaya gonderdi.").catch((err) => {
      setError(err.message);
      throw err;
    });
    loadOverview();
  };

  const handleCreateMessage = async (event: FormEvent) => {
    event.preventDefault();
    const taskId = Number(messageForm.taskId || visibleTasks[0]?.id);
    if (!taskId) {
      setError("Mesaj icin once bir gorev gerekir.");
      return;
    }
    setError("");
    await createERPTaskComment(taskId, {
      author_user_id: isAdmin ? null : currentUserId,
      body: messageForm.body,
      kind: isAdmin ? "reply" : "help",
    }).catch((err) => {
      setError(err.message);
      throw err;
    });
    setMessageForm({ taskId: String(taskId), body: "" });
    loadOverview();
  };

  const title = {
    overview: "ERP-TAKIP — Genel Bakış",
    people: isAdmin ? "Çalışanlar" : "Profil",
    tasks: "Görevler",
    help: "Mesajlar",
  }[section];

  const subtitle = {
    overview: isAdmin ? "Genel durum, son görevler, çalışanlar ve gecikmeler." : "Kendi genel durumunuz ve son görevleriniz.",
    people: isAdmin ? "Çalışanları gör, profil detaylarını incele." : "Kendi profil bilgilerin.",
    tasks: isAdmin ? "Görevleri izle, iptal et veya yeni görev ata." : "Size atanan görevleri başlat veya tamamla.",
    help: "Yardım mesajları ve yönetici ile iletişim alanı.",
  }[section];

  return (
    <div className="flex flex-col gap-5 p-5" style={{ fontFamily: "Inter, sans-serif" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 650, margin: 0, color: "var(--foreground)" }}>{title}</h1>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 2 }}>{subtitle}</p>
          {error && <p style={{ fontSize: 12, color: "var(--destructive)", marginTop: 4 }}>{error}</p>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={loadOverview} className="flex items-center gap-2 rounded px-3 py-2" style={secondaryButtonStyle}>
            <RefreshCw size={14} />
            {busy ? "Yükleniyor" : "Yenile"}
          </button>
          {isAdmin && (
            <>
              <button onClick={() => setShowUserForm((value) => !value)} className="flex items-center gap-2 rounded px-3 py-2" style={secondaryButtonStyle}>
                <UserPlus size={14} />
                Çalışan ekle
              </button>
              <button onClick={() => setShowTaskForm((value) => !value)} className="flex items-center gap-2 rounded px-3 py-2" style={primaryButtonStyle}>
                <Plus size={14} />
                Görev ata
              </button>
            </>
          )}
        </div>
      </div>

      {isAdmin && (showUserForm || (section === "people" && users.length === 0)) && (
        <form onSubmit={handleCreateUser} className="grid gap-3 rounded p-4" style={{ gridTemplateColumns: "1fr 170px 1fr auto", background: "var(--card)", border: "1px solid var(--border)" }}>
          <input required value={userForm.name} onChange={(event) => setUserForm({ ...userForm, name: event.target.value })} placeholder="Çalışan adı" style={inputStyle} />
          <select value={userForm.role} onChange={(event) => setUserForm({ ...userForm, role: event.target.value })} style={inputStyle}>
            <option value="employee">Çalışan</option>
            <option value="manager">Yönetici</option>
            <option value="admin">Admin</option>
          </select>
          <input value={userForm.email} onChange={(event) => setUserForm({ ...userForm, email: event.target.value })} placeholder="E-posta (opsiyonel)" style={inputStyle} />
          <button className="rounded px-3" style={primaryButtonStyle}>Ekle</button>
        </form>
      )}

      {isAdmin && showTaskForm && (
        <form onSubmit={handleCreateTask} className="grid gap-3 rounded p-4" style={{ gridTemplateColumns: "1fr 220px 150px 190px auto", background: "var(--card)", border: "1px solid var(--border)" }}>
          <input required value={taskForm.title} onChange={(event) => setTaskForm({ ...taskForm, title: event.target.value })} placeholder="Görev başlığı" style={inputStyle} />
          <select value={taskForm.assigneeUserId} onChange={(event) => setTaskForm({ ...taskForm, assigneeUserId: event.target.value })} style={inputStyle}>
            <option value="">Atanan kişi yok</option>
            {assignableUsers.map((user) => <option key={user.id} value={user.id}>{user.name}{user.email ? ` · ${user.email}` : ""}</option>)}
          </select>
          <select value={taskForm.priority} onChange={(event) => setTaskForm({ ...taskForm, priority: event.target.value })} style={inputStyle}>
            <option value="low">Düşük</option>
            <option value="normal">Normal</option>
            <option value="high">Yüksek</option>
            <option value="urgent">Acil</option>
          </select>
          <input type="datetime-local" value={taskForm.deadlineAt} onChange={(event) => setTaskForm({ ...taskForm, deadlineAt: event.target.value })} style={inputStyle} />
          <button className="rounded px-3" style={primaryButtonStyle}>Görev ekle</button>
          <textarea value={taskForm.description} onChange={(event) => setTaskForm({ ...taskForm, description: event.target.value })} placeholder="Görev açıklaması" style={{ ...inputStyle, gridColumn: "1 / -1", minHeight: 68, resize: "vertical" }} />
        </form>
      )}

      <Metrics users={visibleUsers.length} onlineUsers={visibleUsers.filter((user) => user.status === "online").length} activeTasks={activeTasks.length} overdueTasks={overdueTasks.length} helpMessages={visibleHelpMessages.length} isAdmin={isAdmin} pendingApprovals={pendingApprovalTasks.length} />

      {section === "overview" && (
        <OverviewPage
          users={userRows}
          tasks={visibleTasks}
          overdueTasks={overdueTasks}
          helpMessages={visibleHelpMessages}
          assigneeName={assigneeName}
          documentCount={documentCount}
          isAdmin={isAdmin}
          pendingApprovalTasks={pendingApprovalTasks}
        />
      )}
      {section === "people" && (
        <PeoplePage users={userRows} selectedUser={selectedUser} onSelectUser={setSelectedUserId} isAdmin={isAdmin} onDeleteUser={handleDeleteUser} />
      )}
      {section === "tasks" && (
        <TasksPage
          tasks={visibleTasks}
          isAdmin={isAdmin}
          taskSearch={taskSearch}
          taskStatusFilter={taskStatusFilter}
          onTaskSearchChange={setTaskSearch}
          onTaskStatusFilterChange={setTaskStatusFilter}
          assigneeName={assigneeName}
          taskScope={taskScope}
          documentCount={documentCount}
          onStatusChange={handleStatusChange}
          onCompletionRequest={handleCompletionRequest}
          onApproveCompletion={handleApproveCompletion}
          onRejectCompletion={handleRejectCompletion}
        />
      )}
      {section === "help" && (
        <HelpPage
          messages={visibleHelpMessages}
          users={users}
          tasks={visibleTasks}
          assigneeName={assigneeName}
          messageForm={messageForm}
          setMessageForm={setMessageForm}
          onSubmit={handleCreateMessage}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}

function Metrics({ users, onlineUsers, activeTasks, overdueTasks, helpMessages, isAdmin, pendingApprovals }: { users: number; onlineUsers: number; activeTasks: number; overdueTasks: number; helpMessages: number; isAdmin: boolean; pendingApprovals: number }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(6, minmax(0, 1fr))" }}>
      <MetricCard label={isAdmin ? "Kayıtlı kullanıcı" : "Görünen kişi"} value={String(users)} icon={<Users size={16} />} tone="var(--primary)" />
      <MetricCard label="Çevrimiçi çalışan" value={String(onlineUsers)} icon={<UserCheck size={16} />} tone="var(--success)" />
      <MetricCard label="Aktif görev" value={String(activeTasks)} icon={<CalendarClock size={16} />} tone="#2563eb" />
      <MetricCard label="Onay bekleyen" value={String(pendingApprovals)} icon={<CheckCircle2 size={16} />} tone="#7c3aed" />
      <MetricCard label="Gecikmiş görev" value={String(overdueTasks)} icon={<AlertTriangle size={16} />} tone="var(--destructive)" />
      <MetricCard label="Yardım mesajı" value={String(helpMessages)} icon={<MessageSquare size={16} />} tone="var(--warning)" />
    </div>
  );
}

function OverviewPage({
  users,
  tasks,
  overdueTasks,
  helpMessages,
  assigneeName,
  documentCount,
  isAdmin,
  pendingApprovalTasks,
}: {
  users: Array<ERPUser & { activeTask: string; assignedTasks: ERPTask[]; overdue: number; done: number }>;
  tasks: ERPTask[];
  overdueTasks: ERPTask[];
  helpMessages: ERPOverview["help_messages"];
  assigneeName: (task: ERPTask) => string;
  documentCount: (task: ERPTask) => number;
  isAdmin: boolean;
  pendingApprovalTasks: ERPTask[];
}) {
  const recentUsers = users.slice(0, 4);
  const recentTasks = tasks.slice(0, 4);
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 360px" }}>
      <div className="flex flex-col gap-4">
        <section className="rounded" style={panelStyle}>
          <PanelHeader title={isAdmin ? "Son kisiler" : "Profil ozeti"} subtitle={isAdmin ? "En son gorunen ekip kayitlari" : "Size ait kayit"} icon={<ShieldCheck size={17} />} />
          {recentUsers.length === 0 ? <EmptyState text="Henuz kisi yok." /> : recentUsers.map((user) => <PersonRow key={user.id} person={user} />)}
        </section>
        <section className="rounded" style={panelStyle}>
          <PanelHeader title="Son görevler" subtitle="En güncel görev akışı" icon={<UserCheck size={17} />} />
          {recentTasks.length === 0 ? <EmptyState text="Henüz görev yok." /> : (
            <div style={{ overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ color: "var(--muted-foreground)", textAlign: "left", background: "var(--input-background)" }}>
                    <th style={tableHeadStyle}>Görev</th>
                    <th style={tableHeadStyle}>Atanan</th>
                    <th style={tableHeadStyle}>Son tarih</th>
                    <th style={tableHeadStyle}>Durum</th>
                    <th style={{ ...tableHeadStyle, textAlign: "right" }}>Dosya</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTasks.map((task) => {
                    const status = taskStatusStyle[task.status as keyof typeof taskStatusStyle] || taskStatusStyle.todo;
                    return (
                      <tr key={task.id} style={{ borderTop: "1px solid var(--border)" }}>
                        <td style={tableCellStyle}><strong>{task.title}</strong></td>
                        <td style={tableCellStyle}>{assigneeName(task)}</td>
                        <td style={tableCellStyle}>{formatDeadline(task.deadline_at)}</td>
                        <td style={tableCellStyle}><span className="rounded px-2 py-0.5" style={{ background: status.bg, color: status.color, fontSize: 10 }}>{status.label}</span></td>
                        <td style={{ ...tableCellStyle, textAlign: "right" }}>{documentCount(task)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
      <div className="flex flex-col gap-4">
        <section className="rounded" style={panelStyle}>
          <PanelHeader title="Onay bekleyen görevler" subtitle="Çalışan bitirdim dedi, admin incelemesi gerekiyor" />
          {pendingApprovalTasks.length === 0 ? <EmptyState text="Onay bekleyen görev yok." /> : pendingApprovalTasks.slice(0, 5).map((task) => (
            <div key={task.id} className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 13, fontWeight: 650 }}>{task.title}</div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>Atanan: {assigneeName(task)}</div>
            </div>
          ))}
        </section>
        <section className="rounded" style={panelStyle}>
          <PanelHeader title="Son gecikenler" subtitle="Deadline aşan görevler" />
          {overdueTasks.length === 0 ? <EmptyState text="Geciken yok. Tüm görevler zamanında ilerliyor." /> : overdueTasks.slice(0, 5).map((task) => (
            <div key={task.id} className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 13, fontWeight: 650 }}>{assigneeName(task)}</div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>{task.title}</div>
            </div>
          ))}
        </section>
        <section className="rounded" style={panelStyle}>
          <PanelHeader title="Son yardım mesajları" subtitle="Çalışanlardan gelen son sorular" />
          {helpMessages.length === 0 ? <EmptyState text="Henüz yardım mesajı yok." /> : helpMessages.slice(0, 3).map((message) => (
            <div key={message.id} className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
              <div style={{ fontSize: 12, fontWeight: 650 }}>Mesaj #{message.id}</div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>{message.body}</div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function PeoplePage({
  users,
  selectedUser,
  onSelectUser,
  isAdmin,
  onDeleteUser,
}: {
  users: Array<ERPUser & { activeTask: string; assignedTasks: ERPTask[]; overdue: number; done: number }>;
  selectedUser: (ERPUser & { activeTask: string; assignedTasks: ERPTask[]; overdue: number; done: number }) | null;
  onSelectUser: (id: number) => void;
  isAdmin: boolean;
  onDeleteUser: (user: ERPUser) => void;
}) {
  if (!isAdmin) {
    return (
      <div className="grid gap-4" style={{ gridTemplateColumns: "minmax(0, 720px)" }}>
        <section className="rounded" style={panelStyle}>
          <PanelHeader title="Profil" subtitle="Kendi bilgileriniz ve gorev ozeti" icon={<UserCheck size={17} />} />
          <ProfileDetail selectedUser={selectedUser} isAdmin={false} onDeleteUser={onDeleteUser} />
        </section>
      </div>
    );
  }

  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 420px" }}>
      <section className="rounded" style={panelStyle}>
        <PanelHeader title="Kisiler" subtitle="Profile tiklayarak detay goruntule" icon={<Users size={17} />} />
        {users.length === 0 ? <EmptyState text="Henuz kisi yok." /> : users.map((person) => (
          <button key={person.id} onClick={() => onSelectUser(person.id)} className="w-full text-left" style={{ border: "none", background: selectedUser?.id === person.id ? "var(--secondary)" : "transparent", cursor: "pointer" }}>
            <PersonRow person={person} />
          </button>
        ))}
      </section>
      <section className="rounded" style={panelStyle}>
        <PanelHeader title="Profil detayi" subtitle="Kisi bilgileri ve gorev ozeti" icon={<UserCheck size={17} />} />
        <ProfileDetail selectedUser={selectedUser} isAdmin={isAdmin} onDeleteUser={onDeleteUser} />
      </section>
    </div>
  );
}

function ProfileDetail({
  selectedUser,
  isAdmin,
  onDeleteUser,
}: {
  selectedUser: (ERPUser & { activeTask: string; assignedTasks: ERPTask[]; overdue: number; done: number }) | null;
  isAdmin: boolean;
  onDeleteUser: (user: ERPUser) => void;
}) {
  if (!selectedUser) return <EmptyState text={isAdmin ? "Bir kisi secin." : "Profil bilgisi bulunamadi."} />;

  return (
    <div className="p-4 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Avatar name={selectedUser.name} size={46} />
        <div className="flex-1 min-w-0">
          <div style={{ fontSize: 16, fontWeight: 700 }}>{selectedUser.name}</div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>{selectedUser.role} · {selectedUser.status}</div>
        </div>
        {isAdmin && (
          <button onClick={() => onDeleteUser(selectedUser)} className="flex items-center gap-2 rounded px-3 py-2" style={{ ...secondaryButtonStyle, color: "var(--destructive)" }}>
            <Trash2 size={14} />
            Hesabi sil
          </button>
        )}
      </div>
      <DetailLine label="E-posta" value={selectedUser.email || "-"} />
      <DetailLine label="Telefon" value={selectedUser.phone || "-"} />
      <DetailLine label="Aktif gorev" value={selectedUser.activeTask} />
      <DetailLine label="Toplam gorev" value={String(selectedUser.assignedTasks.length)} />
      <DetailLine label="Tamamlanan" value={String(selectedUser.done)} />
      <DetailLine label="Geciken" value={String(selectedUser.overdue)} />
      <div>
        <div style={{ fontSize: 13, fontWeight: 650, marginBottom: 8 }}>Gorevleri</div>
        {selectedUser.assignedTasks.length === 0 ? <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Gorev yok.</div> : selectedUser.assignedTasks.map((task) => (
          <div key={task.id} className="rounded p-3" style={{ border: "1px solid var(--border)", marginBottom: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 650 }}>{task.title}</div>
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 3 }}>{task.status}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TasksPage({
  tasks,
  isAdmin,
  taskSearch,
  taskStatusFilter,
  onTaskSearchChange,
  onTaskStatusFilterChange,
  assigneeName,
  taskScope,
  documentCount,
  onStatusChange,
  onCompletionRequest,
  onApproveCompletion,
  onRejectCompletion,
}: {
  tasks: ERPTask[];
  isAdmin: boolean;
  taskSearch: string;
  taskStatusFilter: string;
  onTaskSearchChange: (value: string) => void;
  onTaskStatusFilterChange: (value: string) => void;
  assigneeName: (task: ERPTask) => string;
  taskScope: (task: ERPTask) => string;
  documentCount: (task: ERPTask) => number;
  onStatusChange: (taskId: number, status: string) => void;
  onCompletionRequest: (taskId: number) => void;
  onApproveCompletion: (taskId: number) => void;
  onRejectCompletion: (taskId: number) => void;
}) {
  const normalizedSearch = taskSearch.trim().toLowerCase();
  const matchesFilters = (task: ERPTask) => {
    const statusMatches = taskStatusFilter === "all" || task.status === taskStatusFilter;
    const nameMatches = !normalizedSearch || task.title.toLowerCase().includes(normalizedSearch);
    return statusMatches && nameMatches;
  };
  const filteredTasks = tasks.filter(matchesFilters);
  const pendingApprovalTasks = filteredTasks.filter((task) => task.status === "pending_approval");
  const otherTasks = filteredTasks.filter((task) => task.status !== "pending_approval");
  const displayedTaskCards = isAdmin ? otherTasks : filteredTasks;
  return (
    <div className="flex flex-col gap-4">
      {isAdmin && (
        <section className="rounded p-4" style={panelStyle}>
          <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 220px auto" }}>
            <input value={taskSearch} onChange={(event) => onTaskSearchChange(event.target.value)} placeholder="Gorev adina gore ara..." style={inputStyle} />
            <select value={taskStatusFilter} onChange={(event) => onTaskStatusFilterChange(event.target.value)} style={inputStyle}>
              <option value="all">Tum durumlar</option>
              <option value="todo">Todo</option>
              <option value="in_progress">In progress</option>
              <option value="pending_approval">Onay bekliyor</option>
              <option value="done">Done</option>
              <option value="overdue">Overdue</option>
              <option value="cancelled">Cancelled</option>
              <option value="blocked">Blocked</option>
            </select>
            <button onClick={() => { onTaskSearchChange(""); onTaskStatusFilterChange("all"); }} className="rounded px-3" style={secondaryButtonStyle}>
              Filtreyi temizle
            </button>
          </div>
        </section>
      )}
      {isAdmin && (
        <section className="rounded overflow-hidden" style={panelStyle}>
          <PanelHeader title="Tamamlanma onayi bekleyenler" subtitle="Calisanlarin bitirdim istekleri burada incelenir" icon={<CheckCircle2 size={17} />} />
          <div className="grid gap-3 p-4" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            {pendingApprovalTasks.length === 0 ? <div style={{ gridColumn: "1 / -1" }}><EmptyState text="Onay bekleyen gorev yok." /></div> : pendingApprovalTasks.map((task) => (
              <TaskCard key={task.id} task={task} isAdmin={isAdmin} assigneeName={assigneeName} taskScope={taskScope} documentCount={documentCount} onStatusChange={onStatusChange} onCompletionRequest={onCompletionRequest} onApproveCompletion={onApproveCompletion} onRejectCompletion={onRejectCompletion} />
            ))}
          </div>
        </section>
      )}
      <section className="rounded overflow-hidden" style={panelStyle}>
        <PanelHeader title="Gorev kartlari" subtitle={isAdmin ? "Admin gorevleri izler, iptal eder veya bitis onayini verir" : "Calisan gorevi bitirince admin onayina gonderir"} icon={<UserCheck size={17} />} />
        <div className="grid gap-3 p-4" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
          {displayedTaskCards.length === 0 ? <div style={{ gridColumn: "1 / -1" }}><EmptyState text="Filtreye uygun gorev yok." /></div> : displayedTaskCards.map((task) => (
            <TaskCard key={task.id} task={task} isAdmin={isAdmin} assigneeName={assigneeName} taskScope={taskScope} documentCount={documentCount} onStatusChange={onStatusChange} onCompletionRequest={onCompletionRequest} onApproveCompletion={onApproveCompletion} onRejectCompletion={onRejectCompletion} />
          ))}
        </div>
      </section>
    </div>
  );
}

function HelpPage({
  messages,
  users,
  tasks,
  assigneeName,
  messageForm,
  setMessageForm,
  onSubmit,
  isAdmin,
}: {
  messages: ERPOverview["help_messages"];
  users: ERPUser[];
  tasks: ERPTask[];
  assigneeName: (task: ERPTask) => string;
  messageForm: { taskId: string; body: string };
  setMessageForm: (value: { taskId: string; body: string }) => void;
  onSubmit: (event: FormEvent) => void;
  isAdmin: boolean;
}) {
  return (
    <section className="rounded" style={panelStyle}>
      <PanelHeader title="Yardim ve mesaj" subtitle="Calisanlar yoneticiye soru atabilir" icon={<MessageSquare size={17} />} />
      <div className="p-4 flex flex-col gap-3">
        <form onSubmit={onSubmit} className="grid gap-3 rounded p-3" style={{ background: "var(--background)", border: "1px solid var(--border)", gridTemplateColumns: "240px 1fr auto" }}>
          <select value={messageForm.taskId || String(tasks[0]?.id || "")} onChange={(event) => setMessageForm({ ...messageForm, taskId: event.target.value })} style={inputStyle}>
            {tasks.length === 0 ? <option value="">Gorev yok</option> : tasks.map((task) => <option key={task.id} value={task.id}>{isAdmin ? `${task.title} · ${assigneeName(task)}` : task.title}</option>)}
          </select>
          <input required value={messageForm.body} onChange={(event) => setMessageForm({ ...messageForm, body: event.target.value })} placeholder={isAdmin ? "Calisana mesaj yaz..." : "Yardim mesaji yaz..."} style={inputStyle} />
          <button className="rounded px-3" style={primaryButtonStyle}>Gonder</button>
        </form>
        {messages.length === 0 ? <EmptyState text="Henuz yardim mesaji yok." /> : messages.map((message) => {
          const authorName = message.author_user_id === null ? "Admin" : users.find((user) => user.id === message.author_user_id)?.name || "Calisan";
          return (
            <div key={message.id} className="rounded p-3" style={{ background: "var(--background)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 12, fontWeight: 650 }}>{authorName}</span>
                <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{new Date(message.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}</span>
              </div>
              <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "6px 0 0" }}>{message.body}</p>
            </div>
          );
        })}
        <div className="rounded p-3" style={{ background: "var(--info-bg)", border: "1px solid #bfdbfe" }}>
          <div className="flex items-center gap-2" style={{ fontSize: 12, color: "var(--info)" }}>
            <FileText size={13} />
            Tender Hub dokumani goreve eklenebilir.
          </div>
        </div>
        <button className="flex items-center justify-center gap-2 rounded py-2" style={{ background: "var(--primary)", color: "#fff", border: "none", cursor: "pointer", fontSize: 13 }}>
          <Send size={13} />
          Mesajlari ac
        </button>
      </div>
    </section>
  );
}

function TaskCard({
  task,
  isAdmin,
  compact,
  assigneeName,
  taskScope,
  documentCount,
  onStatusChange,
  onCompletionRequest,
  onApproveCompletion,
  onRejectCompletion,
}: {
  task: ERPTask;
  isAdmin: boolean;
  compact?: boolean;
  assigneeName: (task: ERPTask) => string;
  taskScope: (task: ERPTask) => string;
  documentCount: (task: ERPTask) => number;
  onStatusChange: (taskId: number, status: string) => void;
  onCompletionRequest?: (taskId: number) => void;
  onApproveCompletion?: (taskId: number) => void;
  onRejectCompletion?: (taskId: number) => void;
}) {
  const status = taskStatusStyle[task.status as keyof typeof taskStatusStyle] || taskStatusStyle.todo;
  return (
    <article className="rounded p-3 flex flex-col gap-3" style={{ border: "1px solid var(--border)", background: task.status === "overdue" ? "#fffafa" : "var(--background)" }}>
      <div className="flex items-start justify-between gap-2">
        <h3 style={{ fontSize: 13, fontWeight: 650, lineHeight: 1.35, margin: 0 }}>{task.title}</h3>
        <span className="rounded px-2 py-0.5" style={{ background: status.bg, color: status.color, fontSize: 10, whiteSpace: "nowrap" }}>{status.label}</span>
      </div>
      {task.description && <div style={{ fontSize: 12, color: "var(--muted-foreground)", lineHeight: 1.45 }}>{task.description}</div>}
      <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Atanan: {assigneeName(task)}</div>
      {!compact && <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Grup: {taskScope(task)}</div>}
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1" style={{ fontSize: 11, color: task.status === "overdue" ? "var(--destructive)" : "var(--muted-foreground)" }}>
          {task.status === "overdue" ? <TimerReset size={12} /> : <Clock size={12} />}
          {formatDeadline(task.deadline_at)}
        </span>
        <span className="flex items-center gap-1" style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
          <Paperclip size={12} />
          {documentCount(task)}
        </span>
      </div>
      {!compact && task.status !== "done" && task.status !== "cancelled" && (
        <div className="flex gap-2">
          {task.status !== "in_progress" && task.status !== "pending_approval" && (
            <button onClick={() => onStatusChange(task.id, "in_progress")} className="rounded px-2 py-1" style={smallButtonStyle}>Baslat</button>
          )}
          {isAdmin && task.status === "pending_approval" ? (
            <>
              <button onClick={() => onApproveCompletion?.(task.id)} className="rounded px-2 py-1" style={smallButtonStyle}>Gorev basariyla bitti</button>
              <button onClick={() => onRejectCompletion?.(task.id)} className="rounded px-2 py-1" style={smallButtonStyle}>Geri gonder</button>
            </>
          ) : isAdmin ? (
            <button onClick={() => onStatusChange(task.id, "cancelled")} className="rounded px-2 py-1" style={smallButtonStyle}>Iptal et</button>
          ) : task.status === "pending_approval" ? (
            <span className="rounded px-2 py-1" style={{ ...smallButtonStyle, cursor: "default", color: "var(--warning)" }}>Admin onayi bekliyor</span>
          ) : (
            <button onClick={() => onCompletionRequest?.(task.id)} className="rounded px-2 py-1" style={smallButtonStyle}>Bitirdim, onaya gonder</button>
          )}
        </div>
      )}
    </article>
  );
}

function PersonRow({ person }: { person: ERPUser & { activeTask: string; overdue: number } }) {
  const status = statusStyle[person.status as keyof typeof statusStyle] || statusStyle.offline;
  return (
    <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
      <Avatar name={person.name} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 13, fontWeight: 600 }}>{person.name}</span>
          <span className="rounded px-2 py-0.5" style={{ background: status.bg, color: status.color, fontSize: 11 }}>{status.label}</span>
        </div>
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>{person.role} · {person.activeTask}</div>
      </div>
      {person.overdue > 0 ? (
        <span className="rounded px-2 py-1" style={{ background: "#fff1f2", color: "var(--destructive)", fontSize: 11 }}>{person.overdue} geciken</span>
      ) : (
        <CheckCircle2 size={16} style={{ color: "var(--success)" }} />
      )}
    </div>
  );
}

function MetricCard({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: string }) {
  return (
    <div className="rounded p-4 flex items-start justify-between" style={{ background: "var(--card)", border: "1px solid var(--border)", minHeight: 92 }}>
      <div>
        <div style={{ fontSize: 24, fontWeight: 800, color: "var(--foreground)", lineHeight: 1, fontFamily: "JetBrains Mono, Consolas, monospace" }}>{value}</div>
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 8, lineHeight: 1.25 }}>{label}</div>
      </div>
      <div className="flex items-center justify-center rounded" style={{ width: 30, height: 30, background: `${tone}14`, color: tone }}>{icon}</div>
    </div>
  );
}

function PanelHeader({ title, subtitle, icon }: { title: string; subtitle: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 650 }}>{title}</div>
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 1 }}>{subtitle}</div>
      </div>
      {icon && <div style={{ color: "var(--primary)" }}>{icon}</div>}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="px-4 py-4" style={{ color: "var(--muted-foreground)", fontSize: 12 }}>{text}</div>;
}

function Avatar({ name, size = 34 }: { name: string; size?: number }) {
  return (
    <div className="flex items-center justify-center rounded-full" style={{ width: size, height: size, background: "var(--secondary)", color: "var(--primary)", fontWeight: 650, fontSize: 12, flexShrink: 0 }}>
      {initials(name)}
    </div>
  );
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4" style={{ borderBottom: "1px solid var(--border)", paddingBottom: 8 }}>
      <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 650, textAlign: "right" }}>{value}</span>
    </div>
  );
}

function initials(name: string): string {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatDeadline(value: string | null): string {
  if (!value) return "Deadline yok";
  const deadline = new Date(value);
  const now = new Date();
  const diffMs = deadline.getTime() - now.getTime();
  const diffHours = Math.round(diffMs / 1000 / 60 / 60);
  if (diffHours < 0) return `${Math.abs(diffHours)} saat gecikti`;
  if (diffHours < 24) return `${diffHours} saat kaldi`;
  return deadline.toLocaleDateString("tr-TR");
}

const panelStyle: React.CSSProperties = {
  background: "var(--card)",
  border: "1px solid var(--border)",
};

const tableHeadStyle: React.CSSProperties = {
  padding: "9px 14px",
  fontSize: 11,
  fontWeight: 700,
};

const tableCellStyle: React.CSSProperties = {
  padding: "10px 14px",
  color: "var(--foreground)",
  verticalAlign: "middle",
};

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--input-background)",
  borderRadius: 4,
  padding: "9px 10px",
  fontSize: 12,
  color: "var(--foreground)",
  outline: "none",
};

const primaryButtonStyle: React.CSSProperties = {
  border: "none",
  background: "var(--primary)",
  color: "#fff",
  fontSize: 12,
  cursor: "pointer",
  fontWeight: 700,
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--foreground)",
  fontSize: 12,
  cursor: "pointer",
};

const smallButtonStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--foreground)",
  fontSize: 11,
  cursor: "pointer",
};
