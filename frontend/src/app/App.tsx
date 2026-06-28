import { useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutDashboard, Users, ClipboardList, CheckSquare, MessageSquare,
  Bell, UserPlus, FileText, Send, FolderOpen, Upload, BookOpen,
  Cpu, ChevronRight, ChevronDown, Search, Building2, Bot,
  Circle, Clock, AlertTriangle, CheckCircle2, XCircle, Loader2,
  MoreHorizontal, Filter, Download, Eye, Link, Tag, ArrowRight,
  Paperclip, Star, Hash, Activity, Database, Wifi, WifiOff,
  CalendarDays, TrendingUp, Package, Layers, PanelLeftClose,
  PanelLeftOpen, Settings, LogOut, ChevronLeft, X, Plus,
  RefreshCw, BarChart2, ExternalLink, GitBranch, FileSearch,
  Folder, File, ChevronUp, Menu, Inbox, HelpCircle, Zap
} from "lucide-react";
import {
  ApiDocument,
  ApiTender,
  ApiTree,
  ApiTreeNode,
  ApiVaultNote,
  ERPAccountRequest,
  ERPNotification,
  ERPOverview,
  ERPSession,
  ERPTask,
  ERPUser,
  approveERPAccountRequest,
  approveERPTaskCompletion,
  createERPAccountRequest,
  createERPTask,
  createERPTaskComment,
  createTaskFromTenderDocument,
  createERPUser,
  deleteERPTaskDocument,
  deleteERPWebPushSubscription,
  displayStatus,
  downloadBlob,
  fileType,
  formatBytes,
  getDocuments,
  getERPAccountRequests,
  getERPNotifications,
  getERPOverview,
  getERPTaskDocumentBlob,
  getDashboardTreeFileBlob,
  getFolderTree,
  getERPNotificationPreferences,
  getERPWebPushConfig,
  getTenders,
  getTenderDocumentBlob,
  getVaultNote,
  getVaultNotes,
  loginERPAdmin,
  loginERPUser,
  logoutERP,
  markERPNotificationRead,
  markAllERPNotificationsRead,
  openBlob,
  rejectERPAccountRequest,
  rejectERPTaskCompletion,
  registerERPWebPushSubscription,
  requestERPTaskCompletion,
  subscribeERPNotificationStream,
  updateERPTaskStatus,
  updateERPNotificationPreferences,
  uploadTenderDocument,
  uploadERPTaskDocument,
} from "./api";

type Page =
  | "home"
  | "erp-overview"
  | "employees"
  | "tasks"
  | "approvals"
  | "messages"
  | "notifications"
  | "account-requests"
  | "tender-dashboard"
  | "telegram-groups"
  | "documents"
  | "folder-tree"
  | "upload"
  | "obsidian"
  | "tender-detail"
  | "ai-extraction";

const STATUS_COLORS: Record<string, string> = {
  "Online": "bg-emerald-100 text-emerald-700",
  "Away": "bg-amber-100 text-amber-700",
  "Offline": "bg-slate-100 text-slate-500",
  "Devam Ediyor": "bg-blue-100 text-blue-700",
  "Beklemede": "bg-amber-100 text-amber-700",
  "Tamamlama Talep": "bg-violet-100 text-violet-700",
  "Tamamlandı": "bg-emerald-100 text-emerald-700",
  "Gecikmiş": "bg-red-100 text-red-700",
  "İptal": "bg-slate-100 text-slate-500",
  "Yapılacak": "bg-slate-100 text-slate-600",
  "Aktif": "bg-emerald-100 text-emerald-700",
  "Sınıflandırılmamış": "bg-amber-100 text-amber-700",
  "Sınıflandırıldı": "bg-emerald-100 text-emerald-700",
};

type LiveData = {
  overview: ERPOverview | null;
  documents: ApiDocument[];
  tenders: ApiTender[];
  folderTree: ApiTree | null;
  vaultNotes: ApiVaultNote[];
  accountRequests: ERPAccountRequest[];
  notifications: ERPNotification[];
  loading: boolean;
  error: string;
  refresh: () => void;
};

type FilePreview = {
  title: string;
  filename: string;
  url: string;
  mimeType: string;
  blob: Blob;
};

type EmployeeFocus = "overdue" | null;

type OverdueEmployeeRow = {
  user: ERPUser;
  tasks: ERPTask[];
  nearestDeadline: string | null;
};

const DEFAULT_ADMIN_SESSION: ERPSession = {
  role: "admin",
  name: "Ahmet Yılmaz",
  user_id: null,
  email: null,
};

const SESSION_STORAGE_KEYS = ["docsbot.erp.session", "docsbot_session", "erpSession"];
const BROWSER_NOTIFICATION_KEY = "docsbot.browser_notifications.enabled";

function readStoredSession(): ERPSession | null {
  for (const key of SESSION_STORAGE_KEYS) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as ERPSession;
      if (parsed?.role && parsed?.name && parsed?.access_token) return parsed;
      window.localStorage.removeItem(key);
    } catch {
      // Ignore stale local development values.
    }
  }
  return null;
}

function persistSession(session: ERPSession | null) {
  SESSION_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
  if (!session) {
    return;
  }
  window.localStorage.setItem(SESSION_STORAGE_KEYS[0], JSON.stringify(session));
}

function isAdmin(session: ERPSession | null): boolean {
  return session?.role === "admin";
}

function userTaskIds(overview: ERPOverview | null, userId: number | null | undefined): Set<number> {
  if (!overview || userId === null || userId === undefined) return new Set();
  return new Set(
    overview.assignments
      .filter((assignment) => assignment.assignee_user_id === userId)
      .map((assignment) => assignment.task_id)
  );
}

function browserNotificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

function browserNotificationsEnabled(): boolean {
  return window.localStorage.getItem(BROWSER_NOTIFICATION_KEY) === "true";
}

function setBrowserNotificationsEnabled(enabled: boolean): void {
  window.localStorage.setItem(BROWSER_NOTIFICATION_KEY, String(enabled));
}

function browserNotificationPermission(): NotificationPermission | "unsupported" {
  return browserNotificationsSupported() ? Notification.permission : "unsupported";
}

function serviceWorkerPushSupported(): boolean {
  return browserNotificationsSupported()
    && "serviceWorker" in navigator
    && "PushManager" in window;
}

function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

async function enableClosedDashboardWebPush(): Promise<void> {
  if (!serviceWorkerPushSupported()) {
    throw new Error("Bu tarayıcı dashboard kapalıyken Web Push bildirimlerini desteklemiyor.");
  }
  const config = await getERPWebPushConfig();
  if (!config.enabled || !config.public_key) {
    throw new Error("Web Push sunucu anahtarları henüz yapılandırılmamış.");
  }

  const registration = await navigator.serviceWorker.register("/docsbot-sw.js");
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToUint8Array(config.public_key),
  });
  const serialized = subscription.toJSON();
  const p256dh = serialized.keys?.p256dh;
  const auth = serialized.keys?.auth;
  if (!serialized.endpoint || !p256dh || !auth) {
    throw new Error("Tarayıcı Web Push aboneliği eksik anahtar döndürdü.");
  }
  await registerERPWebPushSubscription({
    endpoint: serialized.endpoint,
    keys: { p256dh, auth },
    user_agent: navigator.userAgent,
  });
}

async function disableClosedDashboardWebPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/docsbot-sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await deleteERPWebPushSubscription(endpoint);
}

function showBrowserNotification(notification: ERPNotification): void {
  if (!browserNotificationsSupported()) return;
  if (!browserNotificationsEnabled()) return;
  if (Notification.permission !== "granted") return;
  if (!document.hidden) return;
  const desktopNotification = new Notification(notification.title || "DocsBot bildirimi", {
    body: notification.body || "Yeni bildirim var.",
    tag: `docsbot-notification-${notification.id}`,
    renotify: false,
  });
  desktopNotification.onclick = () => {
    window.focus();
    desktopNotification.close();
  };
}

function mergeNotification(items: ERPNotification[], next: ERPNotification): ERPNotification[] {
  const existing = items.find((item) => item.id === next.id);
  const merged = existing
    ? items.map((item) => item.id === next.id ? { ...item, ...next } : item)
    : [next, ...items];
  return merged
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50);
}

function useLiveData(session: ERPSession | null): LiveData {
  const [overview, setOverview] = useState<ERPOverview | null>(null);
  const [documents, setDocuments] = useState<ApiDocument[]>([]);
  const [tenders, setTenders] = useState<ApiTender[]>([]);
  const [folderTree, setFolderTree] = useState<ApiTree | null>(null);
  const [vaultNotes, setVaultNotes] = useState<ApiVaultNote[]>([]);
  const [accountRequests, setAccountRequests] = useState<ERPAccountRequest[]>([]);
  const [notifications, setNotifications] = useState<ERPNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshIndex, setRefreshIndex] = useState(0);

  useEffect(() => {
    let alive = true;
    if (!session) {
      setOverview(null);
      setDocuments([]);
      setTenders([]);
      setFolderTree(null);
      setVaultNotes([]);
      setAccountRequests([]);
      setNotifications([]);
      setLoading(false);
      setError("");
      return () => {
        alive = false;
      };
    }
    setLoading(true);
    setError("");
    const admin = isAdmin(session);
    Promise.all([
      getERPOverview(),
      admin ? getDocuments() : Promise.resolve([]),
      admin ? getTenders() : Promise.resolve([]),
      admin ? getFolderTree() : Promise.resolve(null),
      admin ? getVaultNotes() : Promise.resolve({ vault_root: "vault/ihaleler", notes: [] }),
      admin ? getERPAccountRequests("pending") : Promise.resolve([]),
      getERPNotifications(admin ? 0 : session.user_id),
    ])
      .then(([erp, docs, tenderList, tree, vault, requests, notifList]) => {
        if (!alive) return;
        setOverview(erp);
        setDocuments(docs);
        setTenders(tenderList);
        setFolderTree(tree);
        setVaultNotes(vault.notes);
        setAccountRequests(requests);
        setNotifications(notifList);
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : "Veriler yüklenemedi");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    const timer = window.setInterval(() => {
      getERPOverview().then((erp) => alive && setOverview(erp)).catch(() => undefined);
      getERPNotifications(isAdmin(session) ? 0 : session.user_id).then((items) => alive && setNotifications(items)).catch(() => undefined);
    }, 7000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [refreshIndex, session?.role, session?.user_id]);

  useEffect(() => {
    if (!session) return;
    getERPNotificationPreferences()
      .then((preference) => setBrowserNotificationsEnabled(preference.browser_push_enabled))
      .catch(() => undefined);
  }, [session?.access_token, session?.role, session?.user_id]);

  useEffect(() => {
    if (!session) return;
    let alive = true;
    let reconnectTimer: number | undefined;
    let controller: AbortController | null = null;

    const connect = () => {
      if (!alive) return;
      controller = new AbortController();
      subscribeERPNotificationStream((event) => {
        if (!alive) return;
        if (event.event === "notification") {
          setNotifications((items) => mergeNotification(items, event.notification));
          showBrowserNotification(event.notification);
        }
      }, controller.signal).catch(() => {
        if (!alive) return;
        reconnectTimer = window.setTimeout(connect, 2500);
      });
    };

    connect();

    return () => {
      alive = false;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      controller?.abort();
    };
  }, [session?.access_token, session?.role, session?.user_id]);

  return {
    overview,
    documents,
    tenders,
    folderTree,
    vaultNotes,
    accountRequests,
    notifications,
    loading,
    error,
    refresh: () => setRefreshIndex((value) => value + 1),
  };
}

function shortName(name: string): string {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

function formatDateShort(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

function relativeTime(value: string | null | undefined): string {
  if (!value) return "-";
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 1) return "şimdi";
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.round(hours / 24)} gün önce`;
}

function taskLabel(status: string): string {
  const labels: Record<string, string> = {
    todo: "Yapılacak",
    in_progress: "Devam Ediyor",
    pending_approval: "Tamamlama Talep",
    done: "Tamamlandı",
    overdue: "Gecikmiş",
    cancelled: "İptal",
    blocked: "Beklemede",
  };
  return labels[status] || status;
}

function userStatusLabel(status: string): string {
  if (status === "online") return "Online";
  if (status === "away") return "Away";
  return "Offline";
}

function getAssignee(task: ERPTask, overview: ERPOverview | null): ERPUser | null {
  if (!overview) return null;
  const assignment = overview.assignments.find((item) => item.task_id === task.id && item.assignee_user_id);
  if (!assignment?.assignee_user_id) return null;
  return overview.users.find((user) => user.id === assignment.assignee_user_id) || null;
}

function documentsForTask(task: ERPTask, overview: ERPOverview | null): number {
  return overview?.documents.filter((document) => document.task_id === task.id).length || 0;
}

function overdueEmployeeRows(overview: ERPOverview | null): OverdueEmployeeRow[] {
  if (!overview) return [];
  const taskIdsByUser = new Map<number, Set<number>>();
  overview.assignments.forEach((assignment) => {
    if (!assignment.assignee_user_id) return;
    const ids = taskIdsByUser.get(assignment.assignee_user_id) || new Set<number>();
    ids.add(assignment.task_id);
    taskIdsByUser.set(assignment.assignee_user_id, ids);
  });

  return overview.users
    .map((user) => {
      const taskIds = taskIdsByUser.get(user.id) || new Set<number>();
      const tasks = overview.tasks
        .filter((task) => task.status === "overdue" && taskIds.has(task.id))
        .sort((a, b) => {
          const aTime = a.deadline_at ? new Date(a.deadline_at).getTime() : Number.MAX_SAFE_INTEGER;
          const bTime = b.deadline_at ? new Date(b.deadline_at).getTime() : Number.MAX_SAFE_INTEGER;
          return aTime - bTime;
        });
      return {
        user,
        tasks,
        nearestDeadline: tasks[0]?.deadline_at || null,
      };
    })
    .filter((row) => row.tasks.length > 0)
    .sort((a, b) => b.tasks.length - a.tasks.length || a.user.name.localeCompare(b.user.name, "tr"));
}

function documentsForTender(tenderId: string, documents: ApiDocument[]): ApiDocument[] {
  return documents.filter((document) => document.tender_id === tenderId);
}

function Badge({ label }: { label: string }) {
  const cls = STATUS_COLORS[label] || "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Online: "bg-emerald-500",
    Away: "bg-amber-400",
    Offline: "bg-slate-300",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] || "bg-slate-300"}`} />;
}

function createFilePreview(blob: Blob, filename: string, title?: string): FilePreview {
  return {
    title: title || filename,
    filename,
    url: URL.createObjectURL(blob),
    mimeType: blob.type || "",
    blob,
  };
}

function FilePreviewModal({ preview, onClose }: { preview: FilePreview; onClose: () => void }) {
  const lowerName = preview.filename.toLowerCase();
  const isImage = preview.mimeType.startsWith("image/");
  const isPdf = preview.mimeType === "application/pdf" || lowerName.endsWith(".pdf");
  const isText = preview.mimeType.startsWith("text/")
    || lowerName.endsWith(".txt")
    || lowerName.endsWith(".csv")
    || lowerName.endsWith(".md")
    || lowerName.endsWith(".json");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <div className="flex h-[86vh] w-[min(980px,calc(100vw-32px))] flex-col overflow-hidden rounded border border-border bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-slate-50 px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">{preview.title}</h3>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{preview.filename} · {preview.mimeType || "application/octet-stream"}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              title="İndir"
              onClick={() => downloadBlob(preview.blob, preview.filename)}
              className="rounded p-1.5 text-slate-500 hover:bg-white hover:text-teal-600"
            >
              <Download className="h-4 w-4" />
            </button>
            <button title="Kapat" onClick={onClose} className="rounded p-1.5 text-slate-500 hover:bg-white hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden bg-slate-100">
          {isImage ? (
            <div className="flex h-full items-center justify-center p-4">
              <img src={preview.url} alt={preview.filename} className="max-h-full max-w-full rounded border border-border bg-white object-contain" />
            </div>
          ) : isPdf || isText ? (
            <iframe title={preview.filename} src={preview.url} className="h-full w-full border-0 bg-white" />
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <div className="max-w-sm rounded border border-border bg-white p-5 text-center">
                <FileText className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                <p className="text-sm font-semibold text-foreground">Bu dosya tipi panel içinde önizlenemiyor.</p>
                <p className="mt-1 text-xs text-muted-foreground">Dosyayı indirme düğmesiyle açabilirsiniz.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const navItems = [
  {
    label: "Ana Sayfa",
    icon: LayoutDashboard,
    page: "home" as Page,
  },
  {
    group: "ERP-TAKIP",
    items: [
      { label: "Genel Bakış", icon: BarChart2, page: "erp-overview" as Page },
      { label: "Çalışanlar", icon: Users, page: "employees" as Page },
      { label: "Görevler", icon: ClipboardList, page: "tasks" as Page },
      { label: "Tamamlama Onayları", icon: CheckSquare, page: "approvals" as Page },
      { label: "Mesajlar", icon: MessageSquare, page: "messages" as Page, badge: 3 },
      { label: "Bildirimler", icon: Bell, page: "notifications" as Page, badge: 7 },
      { label: "Hesap Talepleri", icon: UserPlus, page: "account-requests" as Page, badge: 2 },
    ],
  },
  {
    group: "TENDER HUB",
    items: [
      { label: "Dashboard", icon: TrendingUp, page: "tender-dashboard" as Page },
      { label: "Telegram Grupları", icon: Send, page: "telegram-groups" as Page },
      { label: "Belgeler", icon: FileText, page: "documents" as Page },
      { label: "Klasör Ağacı", icon: FolderOpen, page: "folder-tree" as Page },
      { label: "Yükleme", icon: Upload, page: "upload" as Page },
      { label: "Obsidian Demo", icon: BookOpen, page: "obsidian" as Page },
      { label: "İhale Detayı", icon: Package, page: "tender-detail" as Page },
      { label: "AI Çıkarımı", icon: Cpu, page: "ai-extraction" as Page },
    ],
  },
];

function visibleNavItems(session: ERPSession) {
  if (isAdmin(session)) return navItems;
  return navItems.filter((item) => !("group" in item && item.group === "TENDER HUB")).map((item) => {
    if ("page" in item) return item;
    if (item.group === "ERP-TAKIP") {
      return {
        ...item,
        items: item.items
          .filter((sub) => !["approvals", "account-requests"].includes(sub.page))
          .map((sub) => sub.page === "employees" ? { ...sub, label: "Profil" } : { ...sub, badge: undefined }),
      };
    }
    return item;
  });
}

function Sidebar({ current, setPage, collapsed, setCollapsed, session, live }: {
  current: Page; setPage: (p: Page) => void; collapsed: boolean; setCollapsed: (v: boolean) => void; session: ERPSession; live: LiveData;
}) {
  const unreadNotifications = live.notifications.filter((item) => !item.read_at).length;
  const messageBadge = isAdmin(session)
    ? live.overview?.help_messages.filter((item) => item.author_user_id !== null).length || 0
    : live.overview?.help_messages.filter((item) => {
        const ids = userTaskIds(live.overview, session.user_id);
        return ids.has(item.task_id) && item.author_user_id === null;
      }).length || 0;
  const accountRequestsBadge = isAdmin(session) ? live.accountRequests.length : 0;
  return (
    <aside
      className="flex flex-col h-full bg-[#0F172A] border-r border-white/5 transition-all duration-200"
      style={{ width: collapsed ? 56 : 220 }}
    >
      <div className="flex items-center gap-2.5 px-4 h-12 border-b border-white/5 shrink-0">
        {!collapsed && (
          <span className="text-sm font-bold tracking-tight text-white">DocsBot <span className="text-teal-400">Ops</span></span>
        )}
        {collapsed && <Zap className="w-4 h-4 text-teal-400 mx-auto" />}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto text-slate-500 hover:text-slate-300 transition-colors"
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 scrollbar-hide">
        {visibleNavItems(session).map((item, i) => {
          if ("page" in item) {
            const Icon = item.icon;
            const active = current === item.page;
            return (
              <button
                key={i}
                onClick={() => setPage(item.page)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors rounded-sm mx-1 ${active
                  ? "bg-teal-600/20 text-teal-400"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  }`}
                style={{ width: "calc(100% - 8px)" }}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          }
          return (
            <div key={i} className="pt-3">
              {!collapsed && (
                <div className="px-3 pb-1.5">
                  <span className="text-[10px] font-semibold tracking-widest text-slate-600 uppercase">{item.group}</span>
                </div>
              )}
              {collapsed && <div className="h-px bg-white/5 mx-2 mb-2" />}
              {item.items!.map((sub, j) => {
                const Icon = sub.icon;
                const active = current === sub.page;
                return (
                  <button
                    key={j}
                    onClick={() => setPage(sub.page)}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium transition-colors rounded-sm mx-1 relative ${active
                      ? "bg-teal-600/20 text-teal-400"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                      }`}
                    style={{ width: "calc(100% - 8px)" }}
                    title={collapsed ? sub.label : undefined}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {!collapsed && <span className="flex-1 text-left">{sub.label}</span>}
                    {!collapsed && sub.page === "messages" && messageBadge > 0 && (
                      <span className="bg-teal-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                        {messageBadge > 9 ? "9+" : messageBadge}
                      </span>
                    )}
                    {!collapsed && sub.page === "notifications" && unreadNotifications > 0 && (
                      <span className="bg-teal-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                        {unreadNotifications > 9 ? "9+" : unreadNotifications}
                      </span>
                    )}
                    {!collapsed && sub.page === "account-requests" && accountRequestsBadge > 0 && (
                      <span className="bg-teal-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                        {accountRequestsBadge > 9 ? "9+" : accountRequestsBadge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/5 p-3 shrink-0">
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold shrink-0">{shortName(session.name)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate">{session.name}</p>
              <p className="text-[10px] text-slate-500 truncate">{isAdmin(session) ? "Admin" : "Çalışan"}</p>
            </div>
            <Settings className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 cursor-pointer" />
          </div>
        ) : (
          <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold mx-auto">{shortName(session.name)}</div>
        )}
      </div>
    </aside>
  );
}

function TopBar({ title, setPage, session, live, onLogout }: { title: string; setPage: (p: Page) => void; session: ERPSession; live: LiveData; onLogout: () => void }) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement | null>(null);
  const unreadNotifications = live.notifications.filter((item) => !item.read_at).length;
  const latestNotifications = live.notifications.slice(0, 6);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!notificationRef.current?.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  const markNotificationRead = async (notification: ERPNotification) => {
    if (!notification.read_at) {
      await markERPNotificationRead(notification.id);
      live.refresh();
    }
    setPage("notifications");
    setNotificationsOpen(false);
  };

  return (
    <header className="h-12 bg-white border-b border-border flex items-center px-4 gap-3 shrink-0">
      <h1 className="text-sm font-semibold text-foreground">{title}</h1>
      <div className="flex-1" />
      <div className="flex items-center gap-1.5 bg-slate-50 border border-border rounded px-2.5 py-1.5 w-56">
        <Search className="w-3.5 h-3.5 text-slate-400" />
        <input placeholder="Ara... (Ctrl+K)" className="text-xs bg-transparent outline-none flex-1 text-slate-600 placeholder:text-slate-400" />
      </div>
      <div className="flex items-center gap-1.5 text-xs text-slate-600 border border-border rounded px-2.5 py-1.5 bg-slate-50">
        <Building2 className="w-3.5 h-3.5 text-slate-400" />
        <span>Mobit</span>
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </div>
      <div ref={notificationRef} className="relative">
        <button
          title="Bildirimler"
          onClick={() => setNotificationsOpen((value) => !value)}
          className="relative w-8 h-8 flex items-center justify-center rounded hover:bg-slate-100 text-slate-500"
        >
          <Bell className="w-4 h-4" />
          {unreadNotifications > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
              {unreadNotifications > 9 ? "9+" : unreadNotifications}
            </span>
          )}
        </button>
        {notificationsOpen && (
          <div className="absolute right-0 top-9 z-40 w-80 overflow-hidden rounded border border-border bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-border bg-slate-50 px-3 py-2">
              <div>
                <p className="text-xs font-semibold text-foreground">Bildirimler</p>
                <p className="text-[10px] text-muted-foreground">{unreadNotifications} okunmamış</p>
              </div>
              <button
                title="Tümünü okundu işaretle"
                disabled={unreadNotifications === 0}
                onClick={async () => {
                  await markAllERPNotificationsRead();
                  live.refresh();
                }}
                className="rounded p-1 text-slate-400 hover:bg-white hover:text-teal-600 disabled:opacity-40"
              >
                <CheckCircle2 className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-border">
              {latestNotifications.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">Bildirim yok.</div>
              ) : latestNotifications.map((notification) => (
                <button
                  key={notification.id}
                  onClick={() => markNotificationRead(notification)}
                  className={`flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-slate-50 ${
                    notification.read_at ? "" : "bg-teal-50/40"
                  }`}
                >
                  <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded bg-teal-100 text-teal-700">
                    <Bell className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-foreground">{notification.title}</p>
                    {notification.body && <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{notification.body}</p>}
                    <p className="mt-1 text-[10px] text-slate-400">{relativeTime(notification.created_at)}</p>
                  </div>
                  {!notification.read_at && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-teal-500" />}
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setPage("notifications");
                setNotificationsOpen(false);
              }}
              className="flex w-full items-center justify-center gap-1.5 border-t border-border px-3 py-2 text-xs font-medium text-teal-700 hover:bg-slate-50"
            >
              <Inbox className="h-3.5 w-3.5" />
              Tüm bildirimler
            </button>
          </div>
        )}
      </div>
      <button onClick={onLogout} className="flex items-center gap-2 border border-border rounded px-2 py-1 hover:bg-slate-50">
        <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold">{shortName(session.name)}</div>
        <div className="leading-tight">
          <p className="text-xs font-semibold text-foreground">{session.name}</p>
          <p className="text-[10px] text-muted-foreground">{isAdmin(session) ? "Admin" : "Çalışan"}</p>
        </div>
        <LogOut className="w-3.5 h-3.5 text-slate-400" />
      </button>
    </header>
  );
}

function KPICard({ label, value, sub, icon: Icon, trend, color, onClick }: {
  label: string; value: string | number; sub?: string; icon: any; trend?: string; color?: string; onClick?: () => void;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <div className={`w-7 h-7 rounded flex items-center justify-center ${color || "bg-slate-100"}`}>
          <Icon className="w-3.5 h-3.5 text-slate-600" />
        </div>
      </div>
      <div className="text-2xl font-bold text-foreground font-mono">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      {trend && <div className="text-xs text-emerald-600 font-medium">{trend}</div>}
    </>
  );
  const className = "bg-white border border-border rounded p-4 flex flex-col gap-2";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} text-left hover:border-teal-300 hover:shadow-sm transition-all`}>
        {content}
      </button>
    );
  }
  return (
    <div className={className}>
      {content}
    </div>
  );
}

// ─── HOME PAGE ───────────────────────────────────────────────────────────────
function HomePage({ setPage, live, onEmployeeDrilldown }: { setPage: (p: Page) => void; live: LiveData; onEmployeeDrilldown: () => void }) {
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

// ─── ERP OVERVIEW ─────────────────────────────────────────────────────────────
function ERPOverviewPage({ setPage, live, onEmployeeDrilldown }: { setPage: (p: Page) => void; live: LiveData; onEmployeeDrilldown: () => void }) {
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

// ─── EMPLOYEES ────────────────────────────────────────────────────────────────
function EmployeesPage({ live, session, focus, onFocusClear }: { live: LiveData; session: ERPSession; focus: EmployeeFocus; onFocusClear: () => void }) {
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

// ─── TASKS ────────────────────────────────────────────────────────────────────
function TasksPage({ live, session }: { live: LiveData; session: ERPSession }) {
  const [statusFilter, setStatusFilter] = useState("Tümü");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", assigneeUserId: "", priority: "normal", deadlineAt: "" });
  const [formError, setFormError] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [documentError, setDocumentError] = useState("");
  const overview = live.overview;
  const allowedTaskIds = userTaskIds(overview, session.user_id);
  const visibleTasks = isAdmin(session)
    ? (overview?.tasks || [])
    : (overview?.tasks || []).filter((task) => allowedTaskIds.has(task.id));
  const tasks = visibleTasks.map((task) => {
    const assignment = overview?.assignments.find((item) => item.task_id === task.id);
    const assignee = getAssignee(task, overview);
    return {
      id: task.id,
      title: task.title,
      assignee: assignee?.name || "Atanmamış",
      type: assignment?.assignee_team_id ? "Grup" : "Bireysel",
      due: formatDateShort(task.deadline_at),
      status: taskLabel(task.status),
      docs: overview?.documents.filter((doc) => doc.task_id === task.id).length || 0,
      created: task.assigned_by_user_id ? "Kullanıcı" : "Admin",
    };
  });
  const statuses = ["Tümü", "Yapılacak", "Devam Ediyor", "Tamamlama Talep", "Tamamlandı", "Gecikmiş", "İptal"];
  const filtered = statusFilter === "Tümü" ? tasks : tasks.filter(t => t.status === statusFilter);
  const selectedTask = visibleTasks.find((task) => task.id === selectedTaskId) || null;
  const selectedDocuments = (overview?.documents || []).filter(
    (document) => document.task_id === selectedTaskId,
  );
  const selectedAssignee = selectedTask ? getAssignee(selectedTask, overview) : null;
  const selectedComments = (overview?.help_messages || [])
    .filter((message) => message.task_id === selectedTaskId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(-4);
  const linkedTenderDocuments = selectedDocuments
    .map((document) => document.document_id
      ? live.documents.find((item) => item.id === document.document_id) || null
      : null)
    .filter((document): document is ApiDocument => Boolean(document));
  const openTaskDocument = async (documentId: number) => {
    setDocumentError("");
    const preview = window.open("about:blank", "_blank");
    if (preview) preview.opener = null;
    try {
      const blob = await getERPTaskDocumentBlob(documentId);
      const url = URL.createObjectURL(blob);
      if (preview) {
        preview.location.href = url;
      } else {
        throw new Error("Tarayıcı önizleme penceresini engelledi");
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      preview?.close();
      setDocumentError(error instanceof Error ? error.message : "Doküman açılamadı");
    }
  };
  const downloadTaskDocument = async (documentId: number, filename: string) => {
    setDocumentError("");
    try {
      const blob = await getERPTaskDocumentBlob(documentId, true);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : "Doküman indirilemedi");
    }
  };
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {statuses.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${statusFilter === s ? "bg-teal-600 text-white border-teal-600" : "bg-white border-border text-muted-foreground hover:bg-slate-50"}`}>
            {s}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button className="flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 border border-border text-xs px-3 py-1.5 rounded">
            <Filter className="w-3.5 h-3.5" /> Filtrele
          </button>
          {isAdmin(session) && <button onClick={() => setShowForm((value) => !value)} className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-3 py-1.5 rounded">
            <Plus className="w-3.5 h-3.5" /> Görev Oluştur
          </button>}
        </div>
      </div>
      {isAdmin(session) && showForm && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setFormError("");
            try {
              await createERPTask({
                title: form.title,
                description: form.description || null,
                assignee_user_ids: form.assigneeUserId ? [Number(form.assigneeUserId)] : [],
                assignee_team_ids: [],
                priority: form.priority,
                deadline_at: form.deadlineAt ? new Date(form.deadlineAt).toISOString() : null,
              });
              setForm({ title: "", description: "", assigneeUserId: "", priority: "normal", deadlineAt: "" });
              setShowForm(false);
              live.refresh();
            } catch (error) {
              setFormError(error instanceof Error ? error.message : "Görev oluşturulamadı");
            }
          }}
          className="grid grid-cols-[1fr_220px_160px_200px_auto] gap-2 bg-white border border-border rounded p-3"
        >
          <input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" placeholder="Görev başlığı" />
          <select value={form.assigneeUserId} onChange={(event) => setForm({ ...form, assigneeUserId: event.target.value })} className="text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none">
            <option value="">Atanan kişi yok</option>
            {(overview?.users || []).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
          <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className="text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none">
            <option value="low">Düşük</option>
            <option value="normal">Normal</option>
            <option value="high">Yüksek</option>
            <option value="urgent">Acil</option>
          </select>
          <input type="datetime-local" value={form.deadlineAt} onChange={(event) => setForm({ ...form, deadlineAt: event.target.value })} className="text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" />
          <button className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded px-4">Oluştur</button>
          <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="col-span-full text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none resize-y min-h-16" placeholder="Görev açıklaması" />
          {formError && <div className="col-span-full text-xs text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2">{formError}</div>}
        </form>
      )}
      <div className="bg-white border border-border rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-border text-muted-foreground">
              <th className="text-left px-4 py-2.5 font-medium">Görev Başlığı</th>
              <th className="text-left px-4 py-2.5 font-medium">Atanan</th>
              <th className="text-left px-4 py-2.5 font-medium">Tür</th>
              <th className="text-left px-4 py-2.5 font-medium">Son Tarih</th>
              <th className="text-left px-4 py-2.5 font-medium">Durum</th>
              <th className="text-center px-4 py-2.5 font-medium">Belge</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Canlı veride görev bulunamadı.</td></tr>
            ) : filtered.map((t) => (
              <tr
                key={t.id}
                onClick={() => {
                  setSelectedTaskId(t.id);
                  setDocumentError("");
                }}
                className={`hover:bg-slate-50 transition-colors cursor-pointer ${
                  selectedTaskId === t.id ? "bg-teal-50/50" : ""
                }`}
              >
                <td className="px-4 py-3 font-medium text-foreground max-w-xs">
                  <span className="block truncate">{t.title}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{t.assignee}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${t.type === "Grup" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{t.type}</span>
                </td>
                <td className="px-4 py-3 font-mono text-muted-foreground">{t.due}</td>
                <td className="px-4 py-3"><Badge label={t.status} /></td>
                <td className="px-4 py-3 text-center">
                  {t.docs > 0 ? (
                    <div className="flex items-center justify-center gap-1 text-muted-foreground">
                      <Paperclip className="w-3 h-3" />{t.docs}
                    </div>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  {!isAdmin(session) && (t.status === "Yapılacak" || t.status === "Beklemede") ? (
                    <button
                      onClick={async () => {
                        await updateERPTaskStatus(t.id, "in_progress");
                        live.refresh();
                      }}
                      className="text-[10px] font-medium text-teal-700 hover:text-teal-900"
                    >
                      Başlat
                    </button>
                  ) : !isAdmin(session) && ["Devam Ediyor", "Gecikmiş"].includes(t.status) ? (
                    <button
                      onClick={async () => {
                        setFormError("");
                        try {
                          await requestERPTaskCompletion(
                            t.id,
                            session.user_id,
                            "Görev tamamlandı, yönetici kontrolüne sunuldu.",
                          );
                          live.refresh();
                        } catch (error) {
                          setFormError(error instanceof Error ? error.message : "Tamamlama isteği gönderilemedi");
                        }
                      }}
                      className="text-[10px] font-medium text-violet-700 hover:text-violet-900"
                    >
                      Tamamlandı bildir
                    </button>
                  ) : <MoreHorizontal className="w-4 h-4 text-slate-400" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedTask && (
        <aside className="fixed right-0 top-12 bottom-0 z-30 flex w-[420px] flex-col border-l border-border bg-white shadow-xl">
          <div className="flex items-start justify-between border-b border-border bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-700">Görev Detayı</p>
              <h3 className="mt-1 truncate text-sm font-semibold text-foreground">{selectedTask.title}</h3>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {selectedAssignee?.name || "Atanmamış"} · {taskLabel(selectedTask.status)}
              </p>
            </div>
            <button
              title="Kapat"
              onClick={() => setSelectedTaskId(null)}
              className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border border-border bg-slate-50 p-2">
                <p className="text-[10px] text-muted-foreground">Durum</p>
                <div className="mt-1"><Badge label={taskLabel(selectedTask.status)} /></div>
              </div>
              <div className="rounded border border-border bg-slate-50 p-2">
                <p className="text-[10px] text-muted-foreground">Son tarih</p>
                <p className="mt-1 font-mono text-foreground">{formatDateShort(selectedTask.deadline_at)}</p>
              </div>
              <div className="rounded border border-border bg-slate-50 p-2">
                <p className="text-[10px] text-muted-foreground">Öncelik</p>
                <p className="mt-1 font-medium capitalize text-foreground">{selectedTask.priority}</p>
              </div>
              <div className="rounded border border-border bg-slate-50 p-2">
                <p className="text-[10px] text-muted-foreground">Belge</p>
                <p className="mt-1 font-medium text-foreground">{selectedDocuments.length}</p>
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Açıklama</p>
              <div className="rounded border border-border bg-slate-50 p-3 text-xs text-foreground">
                {selectedTask.description || "Bu görev için açıklama girilmemiş."}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Bağlı Tender Belgesi</p>
              {linkedTenderDocuments.length === 0 ? (
                <div className="rounded border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                  Bu görev henüz Tender Hub belgesine bağlı değil.
                </div>
              ) : (
                <div className="space-y-2">
                  {linkedTenderDocuments.map((document) => (
                    <div key={document.id} className="rounded border border-border p-3">
                      <div className="flex items-start gap-2">
                        <Package className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">
                            {document.original_filename || document.stored_filename || "Tender belgesi"}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {document.organization || "Sınıflandırılmamış"} · {document.tender_id}
                          </p>
                          <p className="mt-1 text-[10px] text-slate-400">
                            {document.internal_unit || "-"} · {fileType(document)} · {formatBytes(document.file_size)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Görev Dokümanları</p>
                <label className="flex cursor-pointer items-center gap-1.5 rounded bg-teal-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-teal-700">
                  <Upload className="h-3.5 w-3.5" />
                  {documentBusy ? "Yükleniyor" : "Yükle"}
                  <input
                    type="file"
                    className="hidden"
                    disabled={documentBusy}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.webp"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      setDocumentBusy(true);
                      setDocumentError("");
                      try {
                        await uploadERPTaskDocument(selectedTask.id, file);
                        live.refresh();
                      } catch (error) {
                        setDocumentError(error instanceof Error ? error.message : "Doküman yüklenemedi");
                      } finally {
                        setDocumentBusy(false);
                      }
                    }}
                  />
                </label>
              </div>
              {documentError && (
                <div className="mb-2 rounded border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {documentError}
                </div>
              )}
              <div className="divide-y divide-border rounded border border-border">
                {selectedDocuments.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">Bu göreve henüz doküman eklenmedi.</div>
                ) : selectedDocuments.map((document) => {
                  const sourceDocument = document.document_id
                    ? live.documents.find((item) => item.id === document.document_id) || null
                    : null;
                  const filename = sourceDocument?.original_filename || document.original_filename || "Doküman";
                  return (
                    <div key={document.id} className="flex items-center gap-2 px-3 py-2.5">
                      <FileText className="h-4 w-4 shrink-0 text-teal-600" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">{filename}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {sourceDocument ? `${sourceDocument.tender_id} · Tender Hub` : "ERP dokümanı"}
                        </p>
                      </div>
                      <button title="Görüntüle" onClick={() => openTaskDocument(document.id)} className="p-1.5 text-slate-400 hover:text-teal-600">
                        <Eye className="h-4 w-4" />
                      </button>
                      <button title="İndir" onClick={() => downloadTaskDocument(document.id, filename)} className="p-1.5 text-slate-400 hover:text-teal-600">
                        <Download className="h-4 w-4" />
                      </button>
                      {isAdmin(session) && (
                        <button
                          title="Sil"
                          onClick={async () => {
                            setDocumentError("");
                            try {
                              await deleteERPTaskDocument(document.id);
                              live.refresh();
                            } catch (error) {
                              setDocumentError(error instanceof Error ? error.message : "Doküman silinemedi");
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Son Mesajlar</p>
              <div className="space-y-2">
                {selectedComments.length === 0 ? (
                  <div className="rounded border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                    Bu görevde henüz mesaj yok.
                  </div>
                ) : selectedComments.map((comment) => {
                  const author = overview?.users.find((user) => user.id === comment.author_user_id);
                  return (
                    <div key={comment.id} className="rounded border border-border p-2.5">
                      <p className="text-xs text-foreground">{comment.body}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {author?.name || "Admin"} · {relativeTime(comment.created_at)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

// ─── APPROVALS ────────────────────────────────────────────────────────────────
function ApprovalsPage({ live }: { live: LiveData }) {
  const [selected, setSelected] = useState<number | null>(0);
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const overview = live.overview;
  const approvals = (overview?.tasks || [])
    .filter((task) => task.status === "pending_approval")
    .map((task) => {
      const assignee = getAssignee(task, overview);
      return {
        id: task.id,
        task: task.title,
        person: assignee?.name || "Atanmamış",
        due: formatDateShort(task.deadline_at),
        submitted: relativeTime(task.created_at),
        note: (overview?.help_messages || []).find((message) => message.task_id === task.id)?.body || "Çalışan tamamlama onayı istedi.",
        docs: (overview?.documents || []).filter((doc) => doc.task_id === task.id).map((doc) => doc.original_filename || doc.file_path || "Belge"),
        activity: (overview?.help_messages || [])
          .filter((message) => message.task_id === task.id)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      };
    });
  const sel = selected !== null ? approvals[selected] : null;
  return (
    <div className="p-6 flex gap-4 h-[calc(100vh-112px)]">
      <div className="w-80 bg-white border border-border rounded overflow-hidden flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-border bg-slate-50">
          <h3 className="text-xs font-semibold text-foreground">Bekleyen Onaylar ({approvals.length})</h3>
        </div>
        <div className="overflow-y-auto flex-1">
          {approvals.length === 0 ? (
            <div className="px-4 py-6 text-xs text-center text-muted-foreground">Bekleyen onay yok.</div>
          ) : approvals.map((a, i) => (
            <button
              key={i}
              onClick={() => setSelected(i)}
              className={`w-full text-left px-4 py-3 border-b border-border transition-colors ${selected === i ? "bg-teal-50 border-l-2 border-l-teal-500" : "hover:bg-slate-50"}`}
            >
              <p className="text-xs font-medium text-foreground truncate">{a.task}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{a.person} · {a.submitted}</p>
              <div className="mt-1.5"><Badge label="Tamamlama Talep" /></div>
            </button>
          ))}
        </div>
      </div>

      {sel ? (
        <div className="flex-1 bg-white border border-border rounded overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{sel.task}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{sel.person} · Son tarih: {sel.due} · Gönderildi: {sel.submitted}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={busyTaskId === sel.id}
                onClick={async () => {
                  setBusyTaskId(sel.id);
                  setActionError("");
                  try {
                    await approveERPTaskCompletion(sel.id, "admin");
                    setSelected(0);
                    live.refresh();
                  } catch (error) {
                    setActionError(error instanceof Error ? error.message : "Görev onaylanamadı");
                  } finally {
                    setBusyTaskId(null);
                  }
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Onayla
              </button>
              <button
                disabled={busyTaskId === sel.id}
                onClick={async () => {
                  setBusyTaskId(sel.id);
                  setActionError("");
                  try {
                    await rejectERPTaskCompletion(
                      sel.id,
                      "admin",
                      "Görev yönetici incelemesinden sonra tekrar çalışmaya gönderildi.",
                    );
                    setSelected(0);
                    live.refresh();
                  } catch (error) {
                    setActionError(error instanceof Error ? error.message : "Görev reddedilemedi");
                  } finally {
                    setBusyTaskId(null);
                  }
                }}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors flex items-center gap-1.5"
              >
                <XCircle className="w-3.5 h-3.5" /> Reddet
              </button>
              <button className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-xs font-medium rounded text-slate-600 transition-colors flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Mesaj Gönder
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {actionError && (
              <div className="bg-red-50 border border-red-100 rounded px-3 py-2 text-xs text-red-700">
                {actionError}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Çalışan Notu</p>
              <div className="bg-slate-50 border border-border rounded p-3 text-xs text-foreground">{sel.note}</div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Ekli Dosyalar</p>
              <div className="space-y-2">
                {sel.docs.map((d, i) => (
                  <div key={i} className="flex items-center gap-2.5 bg-slate-50 border border-border rounded p-2.5">
                    <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                    <span className="text-xs font-medium text-foreground flex-1">{d}</span>
                    <button className="text-slate-400 hover:text-teal-600 transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                    <button className="text-slate-400 hover:text-teal-600 transition-colors"><Download className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Aktivite Günlüğü</p>
              <div className="space-y-2">
                {sel.activity.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Henüz görev aktivitesi yok.</p>
                ) : sel.activity.map((entry) => {
                  const author = overview?.users.find((user) => user.id === entry.author_user_id);
                  return (
                  <div key={entry.id} className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0" />
                    <div>
                      <p className="text-xs text-foreground">{entry.body}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {author?.name || "Admin"} · {relativeTime(entry.created_at)}
                      </p>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 bg-white border border-border rounded flex items-center justify-center text-muted-foreground text-xs">
          Sol taraftan bir onay seçin
        </div>
      )}
    </div>
  );
}

// ─── MESSAGES ─────────────────────────────────────────────────────────────────
function MessagesPage({ live, session }: { live: LiveData; session: ERPSession }) {
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(true);
  const overview = live.overview;
  const comments = overview?.help_messages || [];
  const allowedTaskIds = userTaskIds(overview, session.user_id);
  const visibleTasks = (overview?.tasks || []).filter((task) => (
    isAdmin(session) ? comments.some((message) => message.task_id === task.id) : allowedTaskIds.has(task.id)
  ));
  const threads = visibleTasks.map((task) => {
    const taskComments = comments
      .filter((message) => message.task_id === task.id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const lastMessage = taskComments[taskComments.length - 1];
    const assignee = getAssignee(task, overview);
    return {
      taskId: task.id,
      person: isAdmin(session) ? (assignee?.name || "Atanmamış") : "Admin",
      last: lastMessage?.body || "Henüz mesaj yok.",
      time: relativeTime(lastMessage?.created_at || task.created_at),
      unread: isAdmin(session)
        ? taskComments.filter((message) => message.author_user_id !== null).length
        : taskComments.filter((message) => message.author_user_id === null).length,
      task: task.title,
    };
  });
  useEffect(() => {
    if (threads.length === 0) {
      setSelectedTaskId(null);
      return;
    }
    if (!selectedTaskId || !threads.some((thread) => thread.taskId === selectedTaskId)) {
      setSelectedTaskId(threads[0].taskId);
    }
  }, [threads.length, selectedTaskId]);
  const selectedThread = threads.find((thread) => thread.taskId === selectedTaskId) || threads[0];
  const selectedTask = selectedThread
    ? visibleTasks.find((task) => task.id === selectedThread.taskId) || null
    : null;
  const selectedAssignee = selectedTask ? getAssignee(selectedTask, overview) : null;
  const selectedDocuments = (overview?.documents || []).filter((document) => document.task_id === selectedThread?.taskId);
  const linkedTenderDocuments = selectedDocuments
    .map((document) => document.document_id
      ? live.documents.find((item) => item.id === document.document_id) || null
      : null)
    .filter((document): document is ApiDocument => Boolean(document));
  const messages = comments
    .filter((message) => selectedThread && message.task_id === selectedThread.taskId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((message) => {
      const user = overview?.users.find((item) => item.id === message.author_user_id);
      return {
        from: user?.name || "Admin",
        text: message.body,
        time: new Date(message.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
        date: new Date(message.created_at).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" }),
        kind: message.kind,
        own: isAdmin(session) ? message.author_user_id === null : message.author_user_id === session.user_id,
      };
    });
  const sendMessage = async () => {
    if (!selectedThread || draft.trim().length < 2) return;
    setSending(true);
    setSendError("");
    try {
      await createERPTaskComment(selectedThread.taskId, {
        author_user_id: isAdmin(session) ? null : session.user_id,
        body: draft,
        kind: isAdmin(session) ? "reply" : "help",
      });
      setDraft("");
      live.refresh();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Mesaj gönderilemedi");
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="p-6 flex gap-4 h-[calc(100vh-112px)]">
      <div className="w-72 bg-white border border-border rounded overflow-hidden flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-border bg-slate-50">
          <h3 className="text-xs font-semibold">Konuşmalar</h3>
        </div>
        <div className="overflow-y-auto flex-1">
          {threads.length === 0 ? (
            <div className="px-4 py-6 text-xs text-center text-muted-foreground">Canlı veride mesaj yok.</div>
          ) : threads.map((t, i) => (
            <button
              key={t.taskId}
              onClick={() => setSelectedTaskId(t.taskId)}
              className={`w-full text-left px-4 py-3 border-b border-border transition-colors ${selectedThread?.taskId === t.taskId ? "bg-teal-50 border-l-2 border-l-teal-500" : "hover:bg-slate-50"}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">{t.person}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">{t.time}</span>
                  {t.unread > 0 && (
                    <span className="bg-teal-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{t.unread}</span>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-teal-600 truncate mt-0.5">{t.task}</p>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">{t.last}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-w-0 bg-white border border-border rounded flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p className="text-xs font-semibold text-foreground">{selectedThread?.person || "Mesaj yok"}</p>
            <p className="text-[10px] text-teal-600">{selectedThread?.task || "-"}</p>
          </div>
          <div className="flex items-center gap-2">
            {selectedTask && <Badge label={taskLabel(selectedTask.status)} />}
            <button
              type="button"
              onClick={() => setDetailsOpen((value) => !value)}
              className="text-xs px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-border rounded text-muted-foreground flex items-center gap-1"
            >
              <PanelLeftOpen className="w-3 h-3" /> Detay
            </button>
            <button className="text-slate-400 hover:text-slate-600"><MoreHorizontal className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Bu görev için henüz mesaj yok.
            </div>
          ) : messages.map((m, i) => (
            <div key={i} className={`flex ${m.own ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-sm rounded px-3 py-2 ${m.own ? "bg-teal-600 text-white" : "bg-slate-100 text-foreground"}`}>
                <div className={`mb-1 flex items-center gap-2 text-[10px] ${m.own ? "text-teal-100" : "text-muted-foreground"}`}>
                  <span className="font-semibold">{m.from}</span>
                  <span>{m.date}</span>
                  <span>{m.kind}</span>
                </div>
                <p className="text-xs whitespace-pre-wrap">{m.text}</p>
                <p className={`text-[10px] mt-1 ${m.own ? "text-teal-200" : "text-muted-foreground"}`}>{m.time}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-border p-3 flex items-end gap-2">
          <textarea
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Yanıtınızı yazın..."
            className="flex-1 text-xs bg-slate-50 border border-border rounded px-3 py-2 resize-none outline-none focus:ring-1 focus:ring-teal-400"
          />
          <div className="flex flex-col gap-1.5">
            <button className="p-1.5 text-slate-400 hover:text-teal-600 transition-colors"><Paperclip className="w-4 h-4" /></button>
            <button
              onClick={sendMessage}
              disabled={!selectedThread || sending || draft.trim().length < 2}
              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors"
            >
              {sending ? "Gönderiliyor" : "Gönder"}
            </button>
          </div>
        </div>
        {sendError && <div className="px-3 pb-3 text-xs text-red-600">{sendError}</div>}
      </div>
      {detailsOpen && selectedTask && (
        <aside className="w-80 shrink-0 bg-white border border-border rounded flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-slate-50 px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-foreground">Thread Detayı</p>
              <p className="text-[10px] text-muted-foreground">{messages.length} mesaj</p>
            </div>
            <button type="button" onClick={() => setDetailsOpen(false)} className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Görev</p>
              <div className="space-y-2 rounded border border-border bg-slate-50 p-3">
                <p className="text-xs font-semibold text-foreground">{selectedTask.title}</p>
                {selectedTask.description && <p className="text-xs text-muted-foreground">{selectedTask.description}</p>}
                <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                  <div>
                    <span className="block font-semibold text-slate-500">Durum</span>
                    <Badge label={taskLabel(selectedTask.status)} />
                  </div>
                  <div>
                    <span className="block font-semibold text-slate-500">Son Tarih</span>
                    <span className="font-mono">{formatDateShort(selectedTask.deadline_at)}</span>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Katılımcılar</p>
              <div className="space-y-2">
                {["Admin", selectedAssignee?.name || "Atanmamış"].map((name) => (
                  <div key={name} className="flex items-center gap-2 rounded border border-border px-3 py-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
                      {shortName(name)}
                    </div>
                    <span className="text-xs font-medium text-foreground">{name}</span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Dokümanlar</p>
              {selectedDocuments.length === 0 ? (
                <p className="rounded border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">Doküman eklenmemiş.</p>
              ) : (
                <div className="space-y-2">
                  {selectedDocuments.map((document) => {
                    const linked = document.document_id
                      ? linkedTenderDocuments.find((item) => item.id === document.document_id)
                      : null;
                    return (
                      <div key={document.id} className="rounded border border-border px-3 py-2">
                        <div className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                          <span className="truncate text-xs font-medium text-foreground">{document.original_filename || linked?.original_filename || "Doküman"}</span>
                        </div>
                        <p className="mt-1 truncate text-[10px] text-muted-foreground">
                          {linked ? `${linked.organization || "Tender Hub"} · ${displayStatus(linked.status)}` : document.visibility}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Konuşma Özeti</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border border-border bg-slate-50 p-3">
                  <p className="text-lg font-bold font-mono text-foreground">{messages.length}</p>
                  <p className="text-[10px] text-muted-foreground">Toplam mesaj</p>
                </div>
                <div className="rounded border border-border bg-slate-50 p-3">
                  <p className="text-lg font-bold font-mono text-foreground">{selectedDocuments.length}</p>
                  <p className="text-[10px] text-muted-foreground">Ek</p>
                </div>
              </div>
            </section>
          </div>
        </aside>
      )}
    </div>
  );
}

// ─── NOTIFICATIONS ─────────────────────────────────────────────────────────────
function NotificationsPage({ live }: { live: LiveData }) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => browserNotificationPermission());
  const [browserEnabled, setBrowserEnabled] = useState(() => browserNotificationsEnabled());
  const [preferenceMessage, setPreferenceMessage] = useState("");
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const notifs = live.notifications.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    desc: item.body || "",
    time: relativeTime(item.created_at),
    read: Boolean(item.read_at),
  }));
  const icons: Record<string, any> = {
    task: ClipboardList, deadline: Clock, approved: CheckCircle2,
    message: MessageSquare, overdue: AlertTriangle, account: UserPlus, rejected: XCircle
  };
  const colors: Record<string, string> = {
    task: "bg-blue-100 text-blue-600", deadline: "bg-amber-100 text-amber-600",
    approved: "bg-emerald-100 text-emerald-600", message: "bg-teal-100 text-teal-600",
    overdue: "bg-red-100 text-red-600", account: "bg-violet-100 text-violet-600",
    rejected: "bg-slate-100 text-slate-600"
  };

  useEffect(() => {
    let alive = true;
    getERPNotificationPreferences()
      .then((preference) => {
        if (!alive) return;
        setBrowserEnabled(preference.browser_push_enabled);
        setBrowserNotificationsEnabled(preference.browser_push_enabled);
        setPermission(browserNotificationPermission());
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const toggleBrowserNotifications = async () => {
    setPreferenceMessage("");
    if (!browserNotificationsSupported()) {
      setPreferenceMessage("Bu tarayıcı masaüstü bildirimlerini desteklemiyor.");
      return;
    }
    setPreferenceSaving(true);
    try {
      if (browserEnabled) {
        await disableClosedDashboardWebPush();
        await updateERPNotificationPreferences({ browser_push_enabled: false });
        setBrowserNotificationsEnabled(false);
        setBrowserEnabled(false);
        setPermission(browserNotificationPermission());
        setPreferenceMessage("Masaüstü ve Web Push bildirimleri kapatıldı.");
        return;
      }

      let nextPermission = Notification.permission;
      if (nextPermission === "default") {
        nextPermission = await Notification.requestPermission();
      }
      setPermission(nextPermission);

      if (nextPermission !== "granted") {
        await updateERPNotificationPreferences({ browser_push_enabled: false });
        setBrowserNotificationsEnabled(false);
        setBrowserEnabled(false);
        setPreferenceMessage("Tarayıcı bildirim izni verilmedi. Kilit/site ayarlarından izin verebilirsiniz.");
        return;
      }

      await enableClosedDashboardWebPush();
      await updateERPNotificationPreferences({ browser_push_enabled: true });
      setBrowserNotificationsEnabled(true);
      setBrowserEnabled(true);
      setPreferenceMessage("Bildirimler açıldı. Dashboard kapalıyken de Web Push gönderilebilir.");
    } catch (err) {
      setPreferenceMessage(err instanceof Error ? err.message : "Bildirim tercihi güncellenemedi.");
    } finally {
      setPreferenceSaving(false);
    }
  };

  return (
    <div className="p-6">
      <div className="bg-white border border-border rounded overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-slate-50">
          <h3 className="text-xs font-semibold">Tüm Bildirimler</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleBrowserNotifications}
              disabled={preferenceSaving || permission === "unsupported"}
              className="text-xs text-teal-600 hover:underline disabled:text-muted-foreground"
            >
              {browserEnabled ? "Masaüstü bildirimi açık" : permission === "denied" ? "Bildirim izni engelli" : "Masaüstü bildirimi aç"}
            </button>
            <button
              onClick={async () => {
                await markAllERPNotificationsRead();
                live.refresh();
              }}
              className="text-xs text-teal-600 hover:underline"
            >
              Tümünü Okundu İşaretle
            </button>
          </div>
        </div>
        {preferenceMessage && (
          <div className="px-4 py-2 border-b border-border text-[10px] text-muted-foreground bg-white">
            {preferenceMessage}
          </div>
        )}
        <div className="divide-y divide-border">
          {notifs.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">Canlı veride bildirim yok.</div>
          ) : notifs.map((n, i) => {
            const Icon = icons[n.type] || Bell;
            return (
              <button
                key={i}
                onClick={async () => {
                  if (!n.read) {
                    await markERPNotificationRead(n.id);
                    live.refresh();
                  }
                }}
                className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 ${!n.read ? "bg-teal-50/30" : ""}`}
              >
                <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${colors[n.type]}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">{n.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{n.desc}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-muted-foreground">{n.time}</span>
                  {!n.read && <div className="w-2 h-2 rounded-full bg-teal-500" />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function AuthGate({ onSession }: { onSession: (session: ERPSession) => void }) {
  const [mode, setMode] = useState<"user" | "admin" | "register">("user");
  const [adminForm, setAdminForm] = useState({ username: "admin", password: "" });
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submitAdmin = async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const next = await loginERPAdmin(adminForm.username, adminForm.password);
      persistSession(next);
      onSession(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin girişi başarısız");
    } finally {
      setLoading(false);
    }
  };

  const submitUser = async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const next = await loginERPUser(loginForm.email, loginForm.password);
      persistSession(next);
      onSession(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Çalışan girişi başarısız");
    } finally {
      setLoading(false);
    }
  };

  const submitRegister = async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await createERPAccountRequest({
        name: registerForm.name,
        email: registerForm.email,
        password: registerForm.password,
        phone: registerForm.phone || null,
      });
      setRegisterForm({ name: "", email: "", password: "", phone: "" });
      setMode("user");
      setMessage("Hesap isteğiniz admine gönderildi. Onaydan sonra giriş yapabilirsiniz.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hesap isteği gönderilemedi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-4xl grid grid-cols-[360px_1fr] gap-5">
        <div className="bg-white border border-border rounded p-5 space-y-4">
          <div>
            <h1 className="text-lg font-bold text-foreground">DocsBot Ops</h1>
            <p className="text-xs text-muted-foreground mt-1">ERP takip ve Tender Hub çalışma alanına giriş yapın.</p>
          </div>
          <div className="grid grid-cols-3 gap-1 bg-slate-50 border border-border rounded p-1">
            {[
              ["user", "Çalışan"],
              ["admin", "Admin"],
              ["register", "Hesap iste"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => { setMode(key as typeof mode); setError(""); setMessage(""); }}
                className={`text-xs rounded px-2 py-1.5 ${mode === key ? "bg-teal-600 text-white" : "text-muted-foreground hover:bg-white"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "admin" && (
            <form onSubmit={(event) => { event.preventDefault(); submitAdmin(); }} className="space-y-3">
              <input value={adminForm.username} onChange={(event) => setAdminForm({ ...adminForm, username: event.target.value })} className="w-full text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" placeholder="Admin kullanıcı adı" />
              <input required type="password" value={adminForm.password} onChange={(event) => setAdminForm({ ...adminForm, password: event.target.value })} className="w-full text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" placeholder="Admin şifresi" />
              <button disabled={loading} className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded py-2">Admin olarak gir</button>
            </form>
          )}

          {mode === "user" && (
            <form onSubmit={(event) => { event.preventDefault(); submitUser(); }} className="space-y-3">
              <input required type="email" value={loginForm.email} onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })} className="w-full text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" placeholder="E-posta" />
              <input required type="password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} className="w-full text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" placeholder="Şifre" />
              <button disabled={loading} className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded py-2">Çalışan olarak gir</button>
            </form>
          )}

          {mode === "register" && (
            <form onSubmit={(event) => { event.preventDefault(); submitRegister(); }} className="space-y-3">
              <input required value={registerForm.name} onChange={(event) => setRegisterForm({ ...registerForm, name: event.target.value })} className="w-full text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" placeholder="Ad soyad" />
              <input required type="email" value={registerForm.email} onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })} className="w-full text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" placeholder="E-posta" />
              <input required type="password" value={registerForm.password} onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })} className="w-full text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" placeholder="Şifre" />
              <input value={registerForm.phone} onChange={(event) => setRegisterForm({ ...registerForm, phone: event.target.value })} className="w-full text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" placeholder="Telefon" />
              <button disabled={loading} className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded py-2">Hesap isteği gönder</button>
            </form>
          )}

          {message && <div className="text-xs bg-emerald-50 border border-emerald-100 text-emerald-700 rounded px-3 py-2">{message}</div>}
          {error && <div className="text-xs bg-red-50 border border-red-100 text-red-700 rounded px-3 py-2">{error}</div>}
        </div>

        <div className="bg-white border border-border rounded p-6">
          <h2 className="text-sm font-bold text-foreground">Yetki modeli</h2>
          <div className="grid gap-3 mt-4">
            {[
              ["Admin", "Tüm çalışanları, görevleri, onayları, hesap taleplerini ve Tender Hub yönetimini görür."],
              ["Çalışan", "Sadece kendi profili, kendi görevleri, kendi görev konuşmaları ve kendi bildirimlerini görür."],
              ["Mesajlar", "Her konuşma bir göreve bağlıdır. Göreve atanmayan kullanıcı konuşmayı göremez."],
              ["Bildirimler", "Admin bildirimleri user_id=0, çalışan bildirimleri kendi user_id değeriyle çekilir."],
            ].map(([title, text]) => (
              <div key={title} className="border border-border rounded p-3">
                <p className="text-xs font-semibold text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground mt-1">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ACCOUNT REQUESTS ─────────────────────────────────────────────────────────
function AccountRequestsPage({ live }: { live: LiveData }) {
  const [actionError, setActionError] = useState("");
  const requests = live.accountRequests.map((request) => ({
    id: request.id,
    name: request.name,
    email: request.email,
    phone: request.phone || "-",
    dept: "-",
    role: request.requested_role,
    created: new Date(request.created_at).toLocaleString("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
  }));
  return (
    <div className="p-6 space-y-4">
      {actionError && <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2">{actionError}</div>}
      <div className="bg-white border border-border rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-slate-50">
          <h3 className="text-xs font-semibold">Bekleyen Hesap Talepleri ({requests.length})</h3>
        </div>
        <div className="divide-y divide-border">
          {requests.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">Bekleyen hesap talebi yok.</div>
          ) : requests.map((r) => (
            <div key={r.id} className="px-4 py-4 flex items-center gap-4">
              <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 text-xs font-bold shrink-0">
                {shortName(r.name)}
              </div>
              <div className="flex-1 grid grid-cols-4 gap-4">
                <div>
                  <p className="text-xs font-semibold text-foreground">{r.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{r.email}</p>
                  <p className="text-[10px] text-muted-foreground">{r.phone}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Departman</p>
                  <p className="text-xs font-medium text-foreground">{r.dept}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Talep Edilen Rol</p>
                  <p className="text-xs font-medium text-foreground">{r.role}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Tarih</p>
                  <p className="text-xs font-mono text-muted-foreground">{r.created}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={async () => {
                    setActionError("");
                    try {
                      await approveERPAccountRequest(r.id);
                      live.refresh();
                    } catch (error) {
                      setActionError(error instanceof Error ? error.message : "Talep onaylanamadı");
                    }
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded transition-colors"
                >
                  Onayla
                </button>
                <button
                  onClick={async () => {
                    setActionError("");
                    try {
                      await rejectERPAccountRequest(r.id);
                      live.refresh();
                    } catch (error) {
                      setActionError(error instanceof Error ? error.message : "Talep reddedilemedi");
                    }
                  }}
                  className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded border border-red-200 transition-colors"
                >
                  Reddet
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── TENDER DASHBOARD ─────────────────────────────────────────────────────────
function TenderDashboardPage({ setPage, live }: { setPage: (p: Page) => void; live: LiveData }) {
  const docs = live.documents;
  const today = new Date().toLocaleDateString("tr-TR");
  const todayDocs = docs.filter((doc) => new Date(doc.timestamp).toLocaleDateString("tr-TR") === today);
  const unclassified = docs.filter((doc) => doc.document_type === "unknown" || displayStatus(doc.status) === "unclassified");
  const telegramGroups = new Set(docs.filter((doc) => doc.source === "telegram").map((doc) => doc.tender_id));
  const recentDocs = docs.slice(0, 5);
  const groupRows = Array.from(telegramGroups).slice(0, 5).map((tenderId) => {
    const groupDocs = docs.filter((doc) => doc.tender_id === tenderId);
    const first = groupDocs[0];
    return {
      name: tenderId,
      branch: first?.internal_unit || "-",
      docs: groupDocs.length,
      bot: true,
    };
  });
  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: "Toplam İhale", value: live.tenders.length, icon: Package, color: "bg-slate-50" },
          { label: "Toplam Belge", value: docs.length, icon: FileText, color: "bg-teal-50" },
          { label: "Bugün Alınan", value: todayDocs.length, icon: TrendingUp, color: "bg-blue-50" },
          { label: "Sınıflandırılmamış", value: unclassified.length, icon: AlertTriangle, color: "bg-amber-50" },
          { label: "Telegram Grubu", value: telegramGroups.size, icon: Send, color: "bg-violet-50" },
          { label: "Obsidian Notu", value: live.vaultNotes.length, icon: BookOpen, color: "bg-emerald-50" },
        ].map((k, i) => <KPICard key={i} label={k.label} value={k.value} icon={k.icon} color={k.color} />)}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white border border-border rounded">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-xs font-semibold">Son Yüklenen Belgeler</h3>
            <button onClick={() => setPage("documents")} className="text-xs text-teal-600 hover:underline flex items-center gap-1">Tümü <ChevronRight className="w-3 h-3" /></button>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-border text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">Dosya Adı</th>
                <th className="text-left px-4 py-2 font-medium">İhale Şirketi</th>
                <th className="text-left px-4 py-2 font-medium">Şube</th>
                <th className="text-left px-4 py-2 font-medium">Tarih</th>
                <th className="text-left px-4 py-2 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentDocs.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Canlı veride belge yok.</td></tr>
              ) : recentDocs.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50 transition-colors cursor-pointer">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                      <span className="font-mono text-[11px] text-foreground truncate max-w-[200px]">{d.stored_filename || d.original_filename || `Belge #${d.id}`}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{d.organization || "-"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{d.internal_unit || "-"}</td>
                  <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{new Date(d.timestamp).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-4 py-2.5"><Badge label={displayStatus(d.status) === "classified" ? "Sınıflandırıldı" : "Sınıflandırılmamış"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-border rounded">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Aktif Telegram Grupları</h3>
            </div>
            <div className="divide-y divide-border">
              {groupRows.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">Telegram kaynaklı belge yok.</div>
              ) : groupRows.map((g) => (
                <div key={g.name} className="flex items-center gap-2.5 px-4 py-2.5">
                  <div className="w-6 h-6 rounded bg-teal-100 flex items-center justify-center shrink-0">
                    <Send className="w-3 h-3 text-teal-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{g.name}</p>
                    <p className="text-[10px] text-muted-foreground">{g.branch} · {g.docs} belge</p>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${g.bot ? "bg-emerald-500" : "bg-red-400"}`} title={g.bot ? "Bot aktif" : "Bot kapalı"} />
                </div>
              ))}
            </div>
            <div className="p-3">
              <button onClick={() => setPage("telegram-groups")} className="w-full text-xs text-teal-600 hover:underline">Grupları Yönet</button>
            </div>
          </div>

          <div className="bg-white border border-border rounded">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Hızlı İşlemler</h3>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
              {[
                { label: "Klasör Ağacı", icon: FolderOpen, page: "folder-tree" as Page },
                { label: "Belge Yükle", icon: Upload, page: "upload" as Page },
                { label: "Obsidian Demo", icon: BookOpen, page: "obsidian" as Page },
                { label: "Grupları Gör", icon: Send, page: "telegram-groups" as Page },
              ].map((a, i) => (
                <button key={i} onClick={() => setPage(a.page)}
                  className="flex flex-col items-center gap-1.5 p-2.5 bg-slate-50 hover:bg-slate-100 rounded border border-border transition-colors">
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

// ─── TELEGRAM GROUPS ──────────────────────────────────────────────────────────
function TelegramGroupsPage({ live }: { live: LiveData }) {
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState(1);
  const [branch, setBranch] = useState("");
  const branches = ["Mobit", "Stok Enerji", "Depart", "Area", "Mobiser"];
  const companies = Array.from(new Set(live.tenders.map((tender) => tender.organization).filter(Boolean))).sort();
  const telegramDocuments = live.documents.filter((document) => document.source === "telegram");
  const groups = Array.from(new Set(telegramDocuments.map((document) => document.tender_id))).map((tenderId) => {
    const docs = documentsForTender(tenderId, telegramDocuments);
    const tender = live.tenders.find((item) => item.tender_id === tenderId);
    const sortedDocs = [...docs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const firstDoc = sortedDocs[sortedDocs.length - 1];
    const lastDoc = sortedDocs[0];
    return {
      name: tender?.title || tenderId,
      branch: tender?.internal_unit || docs.find((document) => document.internal_unit)?.internal_unit || "-",
      company: tender?.organization || docs.find((document) => document.organization)?.organization || "-",
      created: formatDateShort(tender?.created_at || firstDoc?.timestamp),
      docs: docs.length,
      lastDoc: relativeTime(lastDoc?.timestamp),
      bot: true,
    };
  });
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{groups.length} grup bağlı</p>
        <button
          onClick={() => { setShowModal(true); setStep(1); setBranch(""); }}
          className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Yeni Grup Ekle
        </button>
      </div>

      <div className="bg-white border border-border rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-border text-muted-foreground">
              <th className="text-left px-4 py-2.5 font-medium">Grup Adı</th>
              <th className="text-left px-4 py-2.5 font-medium">Şube</th>
              <th className="text-left px-4 py-2.5 font-medium">İhale Şirketi</th>
              <th className="text-left px-4 py-2.5 font-medium">Oluşturulma</th>
              <th className="text-center px-4 py-2.5 font-medium">Belge</th>
              <th className="text-left px-4 py-2.5 font-medium">Son Belge</th>
              <th className="text-left px-4 py-2.5 font-medium">Bot</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groups.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-xs text-muted-foreground">
                  Henüz Telegram kaynaklı grup/belge yok.
                </td>
              </tr>
            )}
            {groups.map((g, i) => (
              <tr key={i} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-teal-100 flex items-center justify-center shrink-0">
                      <Send className="w-3 h-3 text-teal-600" />
                    </div>
                    <span className="font-medium text-foreground">{g.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{g.branch}</td>
                <td className="px-4 py-3 text-muted-foreground">{g.company}</td>
                <td className="px-4 py-3 font-mono text-muted-foreground">{g.created}</td>
                <td className="px-4 py-3 text-center font-mono font-medium text-foreground">{g.docs}</td>
                <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{g.lastDoc}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${g.bot ? "bg-emerald-500" : "bg-red-400"}`} />
                    <span className="text-muted-foreground">{g.bot ? "Aktif" : "Kapalı"}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button className="text-slate-400 hover:text-slate-600"><MoreHorizontal className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded border border-border w-[480px] shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold">Yeni Telegram Grubu Ekle</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-5">
                {[1, 2].map(s => (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step >= s ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-400"}`}>{s}</div>
                    <span className={`text-xs ${step >= s ? "text-foreground font-medium" : "text-muted-foreground"}`}>{s === 1 ? "Şube Seç" : "İhale Şirketi Seç"}</span>
                    {s < 2 && <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
                  </div>
                ))}
              </div>

              {step === 1 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground mb-3">Dahili şube seçin:</p>
                  {branches.map(b => (
                    <button key={b} onClick={() => setBranch(b)}
                      className={`w-full text-left px-3 py-2.5 rounded border text-xs font-medium transition-colors ${branch === b ? "border-teal-500 bg-teal-50 text-teal-700" : "border-border hover:bg-slate-50 text-foreground"}`}>
                      {b}
                    </button>
                  ))}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 bg-slate-50 border border-border rounded px-2.5 py-1.5">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <input placeholder="İhale şirketi ara..." className="text-xs bg-transparent outline-none flex-1" />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {(companies.length ? companies : ["BEDAS", "AYEDAS", "TEDAS", "IGDAS", "IBB", "EPDK"]).map(c => (
                      <button key={c} className="w-full text-left px-3 py-2 rounded hover:bg-slate-50 text-xs text-foreground border border-transparent hover:border-border transition-colors">
                        {c}
                      </button>
                    ))}
                  </div>
                  <button className="flex items-center gap-1.5 text-xs text-teal-600 hover:underline">
                    <Plus className="w-3.5 h-3.5" /> Yeni şirket ekle
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-t border-border">
              <button onClick={() => step > 1 ? setStep(s => s - 1) : setShowModal(false)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <ChevronLeft className="w-3.5 h-3.5" /> {step > 1 ? "Geri" : "İptal"}
              </button>
              <button
                onClick={() => step < 2 ? (branch && setStep(2)) : setShowModal(false)}
                disabled={step === 1 && !branch}
                className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-xs font-medium rounded transition-colors"
              >
                {step < 2 ? "İleri" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DOCUMENTS ────────────────────────────────────────────────────────────────
function DocumentFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 rounded border border-border bg-white px-2.5 py-1.5">
      <span className="text-[10px] text-muted-foreground">{label}:</span>
      <select
        aria-label={`${label} filtresi`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-32 bg-transparent text-xs text-foreground outline-none"
      >
        <option value="all">Tümü</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function DocumentsPage({ live }: { live: LiveData }) {
  const pageSize = 10;
  const [searchTerm, setSearchTerm] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [taskDocument, setTaskDocument] = useState<ApiDocument | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskPriority, setTaskPriority] = useState("normal");
  const [taskDeadline, setTaskDeadline] = useState("");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [assigneeTeamId, setAssigneeTeamId] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [previewFile, setPreviewFile] = useState<FilePreview | null>(null);
  const docs = useMemo(() => live.documents.map((doc) => ({
    raw: doc,
    id: doc.id,
    name: doc.stored_filename || doc.original_filename || `Belge #${doc.id}`,
    company: doc.organization || "-",
    branch: doc.internal_unit || "-",
    tenderId: doc.tender_id,
    year: String(doc.year || new Date(doc.timestamp).getFullYear()),
    date: new Date(doc.timestamp).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" }),
    type: fileType(doc),
    size: formatBytes(doc.file_size),
    status: displayStatus(doc.status) === "classified" ? "Sınıflandırıldı" : "Sınıflandırılmamış",
  })), [live.documents]);
  const filterOptions = useMemo(() => ({
    years: [...new Set(docs.map((doc) => doc.year))].sort().reverse(),
    branches: [...new Set(docs.map((doc) => doc.branch).filter((value) => value !== "-"))].sort(),
    companies: [...new Set(docs.map((doc) => doc.company).filter((value) => value !== "-"))].sort(),
    types: [...new Set(docs.map((doc) => doc.type))].sort(),
  }), [docs]);
  const filteredDocs = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase("tr-TR");
    return docs.filter((doc) => {
      const matchesQuery = !query || [
        doc.name,
        doc.company,
        doc.branch,
        doc.tenderId,
      ].some((value) => value.toLocaleLowerCase("tr-TR").includes(query));
      return matchesQuery
        && (yearFilter === "all" || doc.year === yearFilter)
        && (branchFilter === "all" || doc.branch === branchFilter)
        && (companyFilter === "all" || doc.company === companyFilter)
        && (typeFilter === "all" || doc.type === typeFilter);
    });
  }, [docs, searchTerm, yearFilter, branchFilter, companyFilter, typeFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredDocs.length / pageSize));
  const visibleDocs = filteredDocs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, yearFilter, branchFilter, companyFilter, typeFilter, live.documents.length]);

  useEffect(() => {
    if (currentPage > pageCount) setCurrentPage(pageCount);
  }, [currentPage, pageCount]);

  useEffect(() => {
    return () => {
      if (previewFile) URL.revokeObjectURL(previewFile.url);
    };
  }, [previewFile]);

  async function handleDocumentFile(document: ApiDocument, download: boolean) {
    setActionError("");
    try {
      const blob = await getTenderDocumentBlob(document.id, download);
      if (download) {
        downloadBlob(blob, document.stored_filename || document.original_filename || `document-${document.id}`);
      } else {
        setPreviewFile((current) => {
          if (current) URL.revokeObjectURL(current.url);
          return createFilePreview(
            blob,
            document.stored_filename || document.original_filename || `document-${document.id}`,
            document.original_filename || document.stored_filename || `Belge #${document.id}`,
          );
        });
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Belge açılamadı.");
    }
  }

  function openTaskDialog(document: ApiDocument) {
    setActionError("");
    setTaskDocument(document);
    setTaskTitle(`${document.tender_id} - ${document.original_filename || document.stored_filename || "Belge inceleme"}`);
    setTaskDescription("");
    setTaskPriority("normal");
    setTaskDeadline("");
    setAssigneeUserId("");
    setAssigneeTeamId("");
  }

  async function submitDocumentTask() {
    if (!taskDocument) return;
    setTaskSaving(true);
    setActionError("");
    try {
      await createTaskFromTenderDocument(taskDocument.id, {
        title: taskTitle,
        description: taskDescription || null,
        assignee_user_ids: assigneeUserId ? [Number(assigneeUserId)] : [],
        assignee_team_ids: assigneeTeamId ? [Number(assigneeTeamId)] : [],
        priority: taskPriority,
        deadline_at: taskDeadline ? new Date(taskDeadline).toISOString() : null,
      });
      setTaskDocument(null);
      await live.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Görev oluşturulamadı.");
    } finally {
      setTaskSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      {actionError && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</div>}
      <div className="flex items-center gap-2 flex-wrap">
        <DocumentFilter label="Yıl" value={yearFilter} onChange={setYearFilter} options={filterOptions.years} />
        <DocumentFilter label="Şube" value={branchFilter} onChange={setBranchFilter} options={filterOptions.branches} />
        <DocumentFilter label="Şirket" value={companyFilter} onChange={setCompanyFilter} options={filterOptions.companies} />
        <DocumentFilter label="Tür" value={typeFilter} onChange={setTypeFilter} options={filterOptions.types} />
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white border border-border rounded px-2.5 py-1.5">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Belge ara..."
              className="text-xs bg-transparent outline-none w-36"
            />
          </div>
        </div>
      </div>
      <div className="bg-white border border-border rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-border text-muted-foreground">
              <th className="text-left px-4 py-2.5 font-medium">Dosya Adı</th>
              <th className="text-left px-4 py-2.5 font-medium">İhale Şirketi</th>
              <th className="text-left px-4 py-2.5 font-medium">Şube</th>
              <th className="text-left px-4 py-2.5 font-medium">İhale ID</th>
              <th className="text-left px-4 py-2.5 font-medium">Tarih</th>
              <th className="text-left px-4 py-2.5 font-medium">Tür</th>
              <th className="text-left px-4 py-2.5 font-medium">Boyut</th>
              <th className="text-left px-4 py-2.5 font-medium">Durum</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibleDocs.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Filtrelere uygun belge bulunamadı.</td></tr>
            ) : visibleDocs.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50 transition-colors cursor-pointer">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                    <span className="font-mono text-[11px] text-foreground truncate max-w-[180px]">{d.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{d.company}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{d.branch}</td>
                <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{d.tenderId}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{d.date}</td>
                <td className="px-4 py-2.5">
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-100 text-slate-600">{d.type}</span>
                </td>
                <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{d.size}</td>
                <td className="px-4 py-2.5"><Badge label={d.status} /></td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1">
                    <button title="Önizle" onClick={() => handleDocumentFile(d.raw, false)} className="text-slate-400 hover:text-teal-600 transition-colors p-1"><Eye className="w-3.5 h-3.5" /></button>
                    <button title="İndir" onClick={() => handleDocumentFile(d.raw, true)} className="text-slate-400 hover:text-teal-600 transition-colors p-1"><Download className="w-3.5 h-3.5" /></button>
                    <button title="ERP görevi oluştur" onClick={() => openTaskDialog(d.raw)} className="text-slate-400 hover:text-teal-600 transition-colors p-1"><Link className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-slate-50">
          <span className="text-[10px] text-muted-foreground">
            {filteredDocs.length === 0
              ? "0 belge gösteriliyor"
              : `${filteredDocs.length} belgeden ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, filteredDocs.length)} gösteriliyor`}
          </span>
          <div className="flex items-center gap-1">
            <button
              title="Önceki sayfa"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-12 text-center text-[10px] font-medium text-foreground">
              {currentPage} / {pageCount}
            </span>
            <button
              title="Sonraki sayfa"
              disabled={currentPage === pageCount}
              onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
      {taskDocument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50" onMouseDown={(event) => event.currentTarget === event.target && setTaskDocument(null)}>
          <div className="w-[520px] max-w-[calc(100vw-32px)] rounded border border-border bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Belgeden ERP görevi oluştur</h3>
                <p className="mt-1 max-w-[420px] truncate text-[10px] text-muted-foreground">{taskDocument.original_filename || taskDocument.stored_filename}</p>
              </div>
              <button title="Kapat" onClick={() => setTaskDocument(null)} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-3 p-5">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Görev başlığı
                <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} className="mt-1.5 w-full rounded border border-border bg-slate-50 px-3 py-2 text-xs font-normal normal-case text-foreground outline-none focus:ring-1 focus:ring-teal-400" />
              </label>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Açıklama
                <textarea rows={3} value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} className="mt-1.5 w-full resize-y rounded border border-border bg-slate-50 px-3 py-2 text-xs font-normal normal-case text-foreground outline-none focus:ring-1 focus:ring-teal-400" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Çalışan
                  <select value={assigneeUserId} onChange={(event) => setAssigneeUserId(event.target.value)} className="mt-1.5 w-full rounded border border-border bg-slate-50 px-2.5 py-2 text-xs font-normal normal-case text-foreground">
                    <option value="">Atanmamış</option>
                    {(live.overview?.users || []).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                </label>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Ekip
                  <select value={assigneeTeamId} onChange={(event) => setAssigneeTeamId(event.target.value)} className="mt-1.5 w-full rounded border border-border bg-slate-50 px-2.5 py-2 text-xs font-normal normal-case text-foreground">
                    <option value="">Ekip yok</option>
                    {(live.overview?.teams || []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Öncelik
                  <select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value)} className="mt-1.5 w-full rounded border border-border bg-slate-50 px-2.5 py-2 text-xs font-normal normal-case text-foreground">
                    <option value="low">Düşük</option>
                    <option value="normal">Normal</option>
                    <option value="high">Yüksek</option>
                    <option value="urgent">Acil</option>
                  </select>
                </label>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Son tarih
                  <input type="datetime-local" value={taskDeadline} onChange={(event) => setTaskDeadline(event.target.value)} className="mt-1.5 w-full rounded border border-border bg-slate-50 px-2.5 py-2 text-xs font-normal normal-case text-foreground" />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button onClick={() => setTaskDocument(null)} className="rounded border border-border px-4 py-2 text-xs text-muted-foreground hover:bg-slate-50">İptal</button>
              <button disabled={taskSaving || taskTitle.trim().length < 3} onClick={submitDocumentTask} className="rounded bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-40">
                {taskSaving ? "Oluşturuluyor..." : "Görevi oluştur"}
              </button>
            </div>
          </div>
        </div>
      )}
      {previewFile && (
        <FilePreviewModal
          preview={previewFile}
          onClose={() => {
            URL.revokeObjectURL(previewFile.url);
            setPreviewFile(null);
          }}
        />
      )}
    </div>
  );
}

// ─── FOLDER TREE ──────────────────────────────────────────────────────────────
function FolderTreePage({ live }: { live: LiveData }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ originals: true, ihaleler: true });
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [treeError, setTreeError] = useState("");
  const [previewFile, setPreviewFile] = useState<FilePreview | null>(null);
  const toggle = (key: string) => setExpanded(p => ({ ...p, [key]: !p[key] }));
  const roots = [live.folderTree?.data_originals, live.folderTree?.obsidian_vault].filter(Boolean) as ApiTreeNode[];
  const flattenTree = (node: ApiTreeNode, depth = 0, parent?: string): Array<ApiTreeNode & { depth: number; parent?: string }> => {
    const current = [{ ...node, depth, parent }];
    if (expanded[node.path] || depth === 0) {
      return [...current, ...node.children.flatMap((child) => flattenTree(child, depth + 1, node.path))];
    }
    return current;
  };
  const rows = roots.flatMap((root) => flattenTree(root));
  const selectedNode = rows.find((row) => row.path === selectedPath) || roots[0];
  const selectedChildren = selectedNode?.children || [];

  useEffect(() => {
    return () => {
      if (previewFile) URL.revokeObjectURL(previewFile.url);
    };
  }, [previewFile]);

  async function openTreeFile(item: ApiTreeNode) {
    if (!item.view_url) return;
    setTreeError("");
    try {
      const blob = await getDashboardTreeFileBlob(item.view_url);
      setPreviewFile((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return createFilePreview(blob, item.name, item.name);
      });
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : "Dosya açılamadı.");
    }
  }

  return (
    <div className="p-6 flex gap-4 h-[calc(100vh-112px)]">
      <div className="w-72 bg-white border border-border rounded flex flex-col shrink-0">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input placeholder="Klasörde ara..." className="text-xs bg-transparent outline-none flex-1" />
        </div>
        <div className="flex-1 overflow-y-auto p-2 font-mono text-xs">
          {rows.length === 0 && <div className="p-3 text-[11px] text-muted-foreground">Klasör ağacı yüklenemedi veya boş.</div>}
          {rows.map((item, i) => (
            <div key={i}
              style={{ paddingLeft: item.depth * 16 + 8 }}
              onClick={() => setSelectedPath(item.path)}
              className={`flex items-center gap-1.5 py-1 rounded cursor-pointer hover:bg-slate-50 transition-colors ${selectedPath === item.path ? "bg-teal-50 text-teal-700" : "text-foreground"}`}>
              {item.type === "folder" && item.children.length > 0 ? (
                <button onClick={(event) => { event.stopPropagation(); toggle(item.path); }} className="shrink-0">
                  {expanded[item.path]
                    ? <ChevronDown className="w-3 h-3 text-slate-400" />
                    : <ChevronRight className="w-3 h-3 text-slate-400" />}
                </button>
              ) : <div className="w-3 shrink-0" />}
              {item.type === "folder"
                ? <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                : <File className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
              <span className="truncate text-[11px]">{item.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 bg-white border border-border rounded flex flex-col">
        {treeError && <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{treeError}</div>}
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border text-[10px] text-muted-foreground font-mono">
          {(selectedNode?.path || "data").split(/[\\/]/).filter(Boolean).slice(-5).map((part, index, parts) => (
            <span key={part + index} className="flex items-center gap-1.5">
              <span className={index === parts.length - 1 ? "text-foreground font-semibold" : ""}>{part}</span>
              {index < parts.length - 1 && <ChevronRight className="w-3 h-3" />}
            </span>
          ))}
        </div>
        <div className="flex-1 p-4">
          <div className="grid grid-cols-4 gap-3">
            {selectedChildren.length === 0 && <div className="col-span-4 text-xs text-muted-foreground">Bu klasörde alt öğe yok.</div>}
            {selectedChildren.map((item, i) => (
              <div key={i} onClick={() => item.type === "folder" ? setSelectedPath(item.path) : openTreeFile(item)} className="border border-border rounded p-3 hover:border-teal-300 cursor-pointer transition-all hover:shadow-sm">
                {item.type === "folder" ? <Folder className="w-8 h-8 text-amber-400 mb-2" /> : <File className="w-8 h-8 text-slate-400 mb-2" />}
                <p className="text-[10px] font-mono font-medium text-foreground break-all">{item.name}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{item.type === "folder" ? `${item.children.length} öğe` : formatBytes(item.size)}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-border px-4 py-3 flex items-center gap-3">
          <button disabled title="Java upload migration is pending" className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded px-3 py-1.5 opacity-50 cursor-not-allowed">
            <Upload className="w-3.5 h-3.5" /> Yükle
          </button>
          <button disabled title="Bulk download is not available yet" className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded px-3 py-1.5 opacity-50 cursor-not-allowed">
            <Download className="w-3.5 h-3.5" /> Tümünü İndir
          </button>
        </div>
      </div>
      {previewFile && (
        <FilePreviewModal
          preview={previewFile}
          onClose={() => {
            URL.revokeObjectURL(previewFile.url);
            setPreviewFile(null);
          }}
        />
      )}
    </div>
  );
}

// ─── UPLOAD ───────────────────────────────────────────────────────────────────
function UploadPage({ live }: { live: LiveData }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [branch, setBranch] = useState("");
  const [organization, setOrganization] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [tenderId, setTenderId] = useState("");
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const branches = [
    { value: "MOBIT", label: "Mobit" },
    { value: "STOK_ENERJI", label: "Stok Enerji" },
    { value: "DEPART", label: "Depart" },
    { value: "AREA", label: "Area" },
    { value: "MOBISER", label: "Mobiser" },
  ];
  const organizations = useMemo(
    () => [...new Set([
      ...live.tenders.map((tender) => tender.organization),
      ...live.documents.map((document) => document.organization).filter(Boolean) as string[],
    ])].sort(),
    [live.tenders, live.documents],
  );
  const matchingTenders = useMemo(
    () => live.tenders.filter((tender) =>
      (!branch || tender.internal_unit === branch)
      && (!organization || tender.organization === organization.trim().toUpperCase())
      && tender.year === year),
    [live.tenders, branch, organization, year],
  );

  function chooseFile(selected: File | null) {
    setError("");
    setSuccess("");
    setFile(selected);
  }

  async function submitUpload() {
    if (!file || !branch || !organization.trim()) {
      setError("Dosya, dahili şube ve ihale şirketi zorunludur.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const uploaded = await uploadTenderDocument(file, {
        internal_unit: branch,
        organization: organization.trim(),
        year,
        tender_id: tenderId || undefined,
        caption: caption.trim() || undefined,
      });
      setSuccess(`${uploaded.stored_filename || uploaded.original_filename} kaydedildi. İhale: ${uploaded.tender_id}`);
      setFile(null);
      setCaption("");
      setTenderId(uploaded.tender_id);
      if (fileInput.current) fileInput.current.value = "";
      await live.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Belge yüklenemedi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-5">
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      {success && <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{success}</div>}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          chooseFile(e.dataTransfer.files.item(0));
        }}
        className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${dragging ? "border-teal-400 bg-teal-50" : "border-slate-200 bg-white hover:border-teal-300"}`}
      >
        <Upload className={`w-8 h-8 mx-auto mb-3 ${dragging ? "text-teal-500" : "text-slate-300"}`} />
        <p className="text-sm font-medium text-foreground">{file ? file.name : "Belgeyi buraya sürükleyin"}</p>
        {file && <p className="mt-1 text-[10px] text-teal-700">{formatBytes(file.size)}</p>}
        <p className="text-xs text-muted-foreground mt-1">veya</p>
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={event => chooseFile(event.target.files?.item(0) || null)}
        />
        <button type="button" onClick={() => fileInput.current?.click()} className="mt-3 px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded transition-colors">
          Dosya Seç
        </button>
        <p className="text-[10px] text-muted-foreground mt-3">PDF, Office, metin ve görsel dosyaları · Maks. 25 MB</p>
      </div>

      <div className="bg-white border border-border rounded p-4 space-y-4">
        <h3 className="text-xs font-semibold text-foreground">Sınıflandırma Bilgileri</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Dahili Şube *</label>
            <select value={branch} onChange={e => setBranch(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-border rounded px-2.5 py-2 outline-none focus:ring-1 focus:ring-teal-400">
              <option value="">Şube seçin...</option>
              {branches.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">İhale Şirketi *</label>
            <div className="flex items-center gap-1.5 bg-slate-50 border border-border rounded px-2.5 py-2">
              <Search className="w-3 h-3 text-slate-400 shrink-0" />
              <input
                list="tender-upload-organizations"
                value={organization}
                onChange={e => {
                  setOrganization(e.target.value);
                  setTenderId("");
                }}
                placeholder="Şirket ara veya yaz..."
                className="text-xs bg-transparent outline-none flex-1"
              />
              <datalist id="tender-upload-organizations">
                {organizations.map(value => <option key={value} value={value} />)}
              </datalist>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Yıl *</label>
            <input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={e => {
                setYear(Number(e.target.value));
                setTenderId("");
              }}
              className="w-full text-xs font-mono bg-slate-50 border border-border rounded px-2.5 py-2 outline-none focus:ring-1 focus:ring-teal-400"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Mevcut İhale</label>
            <select
              value={tenderId}
              onChange={e => setTenderId(e.target.value)}
              className="w-full text-xs font-mono bg-slate-50 border border-border rounded px-2.5 py-2 outline-none focus:ring-1 focus:ring-teal-400"
            >
              <option value="">Yeni ihale oluştur</option>
              {matchingTenders.map(tender => <option key={tender.tender_id} value={tender.tender_id}>{tender.tender_id}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Notlar</label>
            <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="İsteğe bağlı açıklama..." className="w-full text-xs bg-slate-50 border border-border rounded px-2.5 py-2 outline-none focus:ring-1 focus:ring-teal-400" />
          </div>
        </div>
        <div className="pt-2 flex items-center gap-3">
          <button disabled={saving} onClick={submitUpload} className="px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors flex items-center gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Yükle ve Sınıflandır
          </button>
          <button onClick={() => {
            chooseFile(null);
            setCaption("");
            if (fileInput.current) fileInput.current.value = "";
          }} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-xs font-medium rounded text-slate-600 transition-colors">Temizle</button>
        </div>
      </div>
    </div>
  );
}

// ─── OBSIDIAN DEMO ────────────────────────────────────────────────────────────
function ObsidianPage({ live }: { live: LiveData }) {
  const firstNote = live.vaultNotes[0];
  const [activeNote, setActiveNote] = useState(firstNote?.path || "");
  const [noteContent, setNoteContent] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ "2026": true, "MOBIT": true });
  const toggle = (k: string) => setExpanded(p => ({ ...p, [k]: !p[k] }));
  const selectedNote = live.vaultNotes.find((note) => note.path === activeNote) || firstNote;
  const selectedTenderId = selectedNote?.name.replace(/\.md$/i, "") || live.tenders[0]?.tender_id || "Henüz not yok";
  const selectedTender = live.tenders.find((tender) => selectedTenderId.includes(tender.tender_id)) || live.tenders[0];
  const relatedDocuments = selectedTender ? documentsForTender(selectedTender.tender_id, live.documents) : live.documents.slice(0, 5);
  const noteTags = selectedNote?.tags?.length ? selectedNote.tags : [selectedTender?.organization, selectedTender?.year?.toString(), selectedTender?.internal_unit].filter(Boolean) as string[];
  const linkedNoteNames = useMemo(() => {
    const names = Array.from(noteContent.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g))
      .map((match) => match[1].trim())
      .filter(Boolean);
    return Array.from(new Set(names)).slice(0, 10);
  }, [noteContent]);

  useEffect(() => {
    if (!selectedNote) {
      setNoteContent("");
      return;
    }
    getVaultNote(selectedNote.path)
      .then((note) => setNoteContent(note.content))
      .catch(() => setNoteContent(""));
  }, [selectedNote?.path]);

  async function openTenderDocument(document: ApiDocument) {
    const blob = await getTenderDocumentBlob(document.id, false);
    openBlob(blob);
  }
  return (
    <div className="flex h-[calc(100vh-48px)] bg-[#1e1e2e] text-slate-200 font-mono text-xs">
      {/* Left: Vault Tree */}
      <aside className="w-56 border-r border-white/5 flex flex-col shrink-0 bg-[#181825]">
        <div className="px-3 py-2 border-b border-white/5">
          <div className="flex items-center gap-1.5 bg-white/5 rounded px-2 py-1">
            <Search className="w-3 h-3 text-slate-500" />
            <input placeholder="⌘K arama..." className="bg-transparent outline-none text-[10px] text-slate-400 flex-1 placeholder:text-slate-600" />
          </div>
        </div>
        <div className="px-2 py-1 border-b border-white/5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 px-1 py-1">VAULT: DocsBot</p>
        </div>
        <div className="flex-1 overflow-y-auto p-1 scrollbar-hide">
          {live.vaultNotes.length === 0 && <div className="px-2 py-3 text-[10px] text-slate-500">Henüz Obsidian notu yok.</div>}
          {[
            { key: "2026", label: "📅 2026", depth: 0, has: true },
            ...live.vaultNotes.map((note) => ({ key: note.path, label: note.name.replace(/\.md$/i, ""), depth: 1, has: false, par: "2026" })),
          ].filter(item => !item.par || expanded[item.par]).map((item, i) => (
            <div key={i}
              style={{ paddingLeft: item.depth * 12 + 4 }}
              onClick={() => !item.has && setActiveNote(item.key)}
              className={`flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer transition-colors text-[10px] ${item.key === activeNote ? "bg-teal-600/20 text-teal-400" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"}`}
            >
              {item.has ? (
                <button onClick={e => { e.stopPropagation(); toggle(item.key); }}>
                  {expanded[item.key] ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                </button>
              ) : <div className="w-2.5" />}
              <span className="truncate">{item.label}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* Center: Note Editor */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-[#1e1e2e]">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span>vault</span><ChevronRight className="w-2.5 h-2.5" /><span className="text-teal-400">{selectedNote?.name || selectedTenderId}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="text-[10px] px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-slate-400 transition-colors flex items-center gap-1">
              <Download className="w-2.5 h-2.5" /> İndir
            </button>
            <button className="text-[10px] px-2 py-1 bg-teal-600/20 hover:bg-teal-600/30 rounded text-teal-400 transition-colors flex items-center gap-1">
              <Link className="w-2.5 h-2.5" /> ERP Görevine Ekle
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          {/* YAML Frontmatter */}
          <div className="bg-[#181825] border border-white/10 rounded mb-5 overflow-hidden">
            <div className="px-3 py-1.5 bg-white/5 border-b border-white/5">
              <span className="text-[9px] text-slate-600 uppercase tracking-widest">YAML Frontmatter</span>
            </div>
            <pre className="text-[11px] text-slate-400 p-4 leading-relaxed overflow-auto">
{`---
ihale_id: ${selectedTender?.tender_id || selectedTenderId}
ihale_sirketi: ${selectedTender?.organization || "-"}
dahili_sube: ${selectedTender?.internal_unit || "-"}
yil: ${selectedTender?.year || "-"}
tarih: ${selectedTender ? formatDateShort(selectedTender.created_at) : "-"}
belge_sayisi: ${relatedDocuments.length}
durum: ${selectedTender?.status || "unknown"}
etiketler: [${noteTags.join(", ")}]
---`}
            </pre>
          </div>

          {/* Note Content */}
          <div className="space-y-4">
            <h1 className="text-lg font-bold text-slate-100">{selectedNote?.name?.replace(/\.md$/i, "") || selectedTenderId}</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              Bu görünüm gerçek Obsidian vault notlarından ve Tender Hub belgelerinden beslenir.{" "}
              <span className="text-teal-400 cursor-pointer hover:underline">[[{selectedTender?.organization || "ihale"}]]</span>{" "}
              kayıtları ile ilişkili dosyalar aşağıda listelenir.
            </p>

            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-300 border-b border-white/10 pb-1">Belgeler</h2>
              {relatedDocuments.length === 0 && <div className="text-[11px] text-slate-500">Bu nota bağlı belge bulunamadı.</div>}
              {relatedDocuments.map((d, i) => (
                <div key={i} onClick={() => openTenderDocument(d)} className="flex items-center gap-2.5 bg-white/5 rounded px-3 py-2 hover:bg-white/8 cursor-pointer transition-colors">
                  <FileText className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <span className="text-slate-300 flex-1">{d.original_filename || d.stored_filename || `Belge #${d.id}`}</span>
                  <span className="text-slate-600 text-[10px]">{formatBytes(d.file_size)}</span>
                  <span className="text-slate-600 text-[10px]">{formatDateShort(d.timestamp)}</span>
                  <Eye className="w-3 h-3 text-slate-600 hover:text-teal-400" />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-300 border-b border-white/10 pb-1">Bağlantılı Notlar</h2>
              <div className="flex flex-wrap gap-2">
                {linkedNoteNames.length === 0 && <span className="text-[11px] text-slate-500">Bağlantılı not bulunamadı.</span>}
                {linkedNoteNames.map((name) => `[[${name}]]`).map((l, i) => (
                  <span key={i} className="text-teal-400 hover:text-teal-300 cursor-pointer text-[11px] hover:underline">{l}</span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-300 border-b border-white/10 pb-1">Etiketler</h2>
              <div className="flex flex-wrap gap-1.5">
                {noteTags.map((t, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-600/20 text-violet-400 border border-violet-600/20"># {t}</span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-300 border-b border-white/10 pb-1">Markdown İçeriği</h2>
              <pre className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-xs text-slate-300 whitespace-pre-wrap break-words min-h-20">
                {noteContent || "Seçili notta içerik bulunamadı."}
              </pre>
            </div>
          </div>
        </div>
        {/* Bottom toolbar */}
        <div className="border-t border-white/5 px-4 py-2 flex items-center gap-3 bg-[#181825]">
          <button className="text-[10px] px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-slate-400 flex items-center gap-1 transition-colors">
            <Eye className="w-2.5 h-2.5" /> Belge Önizle
          </button>
          <button className="text-[10px] px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-slate-400 flex items-center gap-1 transition-colors">
            <Download className="w-2.5 h-2.5" /> Tümünü İndir
          </button>
          <button className="text-[10px] px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-slate-400 flex items-center gap-1 transition-colors">
            <GitBranch className="w-2.5 h-2.5" /> Karşılaştır
          </button>
          <button className="text-[10px] px-2 py-1 bg-teal-600/20 hover:bg-teal-600/30 rounded text-teal-400 flex items-center gap-1 transition-colors">
            <Cpu className="w-2.5 h-2.5" /> Özet Oluştur
          </button>
        </div>
      </main>

      {/* Right: Graph + Metadata */}
      <aside className="w-60 border-l border-white/5 flex flex-col bg-[#181825] shrink-0">
        <div className="px-3 py-2 border-b border-white/5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Graf Görünümü</p>
        </div>
        <div className="h-40 bg-[#13131f] m-2 rounded border border-white/5 flex items-center justify-center relative overflow-hidden">
          {!selectedNote && !selectedTender ? (
            <span className="text-[10px] text-slate-600">Graf için veri yok.</span>
          ) : (
          <svg width="100%" height="100%" viewBox="0 0 200 140">
            <circle cx="100" cy="70" r="18" fill="#0D9488" fillOpacity="0.3" stroke="#0D9488" strokeWidth="1.5" />
            <text x="100" y="74" textAnchor="middle" fill="#5eead4" fontSize="7">{selectedTenderId.slice(0, 16)}</text>
            <circle cx="40" cy="30" r="12" fill="#7c3aed" fillOpacity="0.3" stroke="#7c3aed" strokeWidth="1" />
            <text x="40" y="34" textAnchor="middle" fill="#a78bfa" fontSize="6">{(selectedTender?.internal_unit || "-").slice(0, 10)}</text>
            <circle cx="160" cy="30" r="12" fill="#2563eb" fillOpacity="0.3" stroke="#2563eb" strokeWidth="1" />
            <text x="160" y="34" textAnchor="middle" fill="#93c5fd" fontSize="6">{(selectedTender?.organization || "-").slice(0, 10)}</text>
            <circle cx="100" cy="130" r="9" fill="#059669" fillOpacity="0.3" stroke="#059669" strokeWidth="1" />
            <text x="100" y="134" textAnchor="middle" fill="#6ee7b7" fontSize="5.5">Belge×{relatedDocuments.length}</text>
            <line x1="100" y1="52" x2="52" y2="42" stroke="#7c3aed" strokeWidth="0.8" strokeOpacity="0.5" />
            <line x1="100" y1="52" x2="148" y2="42" stroke="#2563eb" strokeWidth="0.8" strokeOpacity="0.5" />
            <line x1="100" y1="88" x2="100" y2="121" stroke="#059669" strokeWidth="0.8" strokeOpacity="0.5" />
          </svg>
          )}
        </div>

        <div className="px-3 py-2 border-b border-white/5 border-t border-white/5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Bağlantılı Notlar ({linkedNoteNames.length})</p>
        </div>
        <div className="px-2 py-1 space-y-0.5">
          {linkedNoteNames.length === 0 && <div className="text-[10px] text-slate-600 px-1 py-1">Henüz bağlantı yok.</div>}
          {linkedNoteNames.map((l, i) => (
            <div key={i} className="text-[10px] text-teal-400 hover:text-teal-300 cursor-pointer px-1 py-0.5 hover:bg-white/5 rounded">
              [[{l}]]
            </div>
          ))}
        </div>

        <div className="px-3 py-2 border-b border-white/5 border-t border-white/5 mt-1">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Meta Veri</p>
        </div>
        <div className="px-3 py-2 space-y-1.5 text-[10px]">
          {[
            ["İhale ID", selectedTender?.tender_id || selectedTenderId],
            ["Şirket", selectedTender?.organization || "-"],
            ["Şube", selectedTender?.internal_unit || "-"],
            ["Yıl", selectedTender?.year?.toString() || "-"],
            ["Belge", relatedDocuments.length.toString()],
            ["Not", live.vaultNotes.length.toString()],
          ].map(([k, v], i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-slate-600">{k}</span>
              <span className="text-slate-300">{v}</span>
            </div>
          ))}
        </div>

        <div className="px-3 py-2 border-t border-white/5 mt-auto">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">AI Önerileri</p>
          <div className="bg-teal-600/10 border border-teal-600/20 rounded p-2 text-[10px] text-teal-300">
            <Cpu className="w-3 h-3 mb-1 text-teal-500" />
            AI çıkarım MVP sonrası bağlanacak. Şimdilik gerçek belge ve not ağacı gösteriliyor.
          </div>
        </div>
      </aside>
    </div>
  );
}

// ─── TENDER DETAIL ────────────────────────────────────────────────────────────
function TenderDetailPage() {
  return (
    <div className="p-6 flex gap-4">
      <div className="flex-1 space-y-4">
        <div className="bg-white border border-border rounded p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-foreground">BEDAS-2026-20260601-001</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Transformatör bakım ve onarım ihalesi</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="text-xs px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-border rounded flex items-center gap-1.5 text-muted-foreground transition-colors">
                <Download className="w-3.5 h-3.5" /> Tümünü İndir
              </button>
              <button className="text-xs px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded flex items-center gap-1.5 transition-colors">
                <BookOpen className="w-3.5 h-3.5" /> Obsidian'da Aç
              </button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 p-4 bg-slate-50 rounded border border-border">
            {[
              ["İhale Şirketi", "BEDAŞ"],
              ["Dahili Şube", "Mobit"],
              ["İhale ID", "BEDAS-2026-001"],
              ["Tarih", "1 Haz 2026"],
            ].map(([k, v], i) => (
              <div key={i}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{k}</p>
                <p className="text-xs font-semibold text-foreground mt-0.5">{v}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-border rounded">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-xs font-semibold">Belgeler (3)</h3>
          </div>
          <div className="divide-y divide-border">
            {[
              { name: "BEDAS-2026-001-teknik-sartname.pdf", size: "2.4 MB", date: "1 Haz 2026", type: "PDF" },
              { name: "BEDAS-2026-001-sozlesme-taslagi.pdf", size: "1.1 MB", date: "1 Haz 2026", type: "PDF" },
              { name: "BEDAS-2026-002-malzeme-listesi.xlsx", size: "340 KB", date: "11 Haz 2026", type: "XLSX" },
            ].map((d, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <FileText className="w-4 h-4 text-teal-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-mono font-medium text-foreground">{d.name}</p>
                  <p className="text-[10px] text-muted-foreground">{d.type} · {d.size} · {d.date}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button className="text-slate-400 hover:text-teal-600 transition-colors p-1"><Eye className="w-3.5 h-3.5" /></button>
                  <button className="text-slate-400 hover:text-teal-600 transition-colors p-1"><Download className="w-3.5 h-3.5" /></button>
                  <button className="text-slate-400 hover:text-teal-600 transition-colors p-1"><Link className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-border rounded">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-xs font-semibold">İlgili ERP Görevleri</h3>
          </div>
          <div className="divide-y divide-border">
            {[
              { title: "BEDAS transformatör bakım raporu hazırlama", assignee: "Mehmet Kaya", status: "Devam Ediyor" },
              { title: "Kablo malzeme listesi hazırlama", assignee: "Ayşe Demir", status: "Tamamlama Talep" },
            ].map((t, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <ClipboardList className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-foreground">{t.title}</p>
                  <p className="text-[10px] text-muted-foreground">{t.assignee}</p>
                </div>
                <Badge label={t.status} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="w-64 space-y-4 shrink-0">
        <div className="bg-amber-50 border border-amber-200 rounded p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <p className="text-xs font-semibold text-amber-700">Eksik Bilgiler</p>
          </div>
          <ul className="text-[10px] text-amber-600 space-y-1 list-disc list-inside">
            <li>Tahmini birim fiyat girilmedi</li>
            <li>Teknik gereksinimlerin tamamı yüklenmedi</li>
          </ul>
        </div>

        <div className="bg-white border border-border rounded">
          <div className="px-3 py-2.5 border-b border-border">
            <h3 className="text-xs font-semibold">Aktivite Zaman Çizelgesi</h3>
          </div>
          <div className="p-3 space-y-3">
            {[
              { text: "3. belge eklendi", time: "11 Haz" },
              { text: "ERP görevi oluşturuldu", time: "5 Haz" },
              { text: "İhale sınıflandırıldı", time: "1 Haz" },
              { text: "Telegram'dan alındı", time: "1 Haz" },
            ].map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-medium text-foreground">{a.text}</p>
                  <p className="text-[9px] text-muted-foreground">{a.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AI EXTRACTION ────────────────────────────────────────────────────────────
function AIExtractionPage() {
  return (
    <div className="p-6 space-y-5">
      <div className="bg-violet-50 border border-violet-200 rounded px-4 py-3 flex items-center gap-3">
        <Cpu className="w-4 h-4 text-violet-500 shrink-0" />
        <p className="text-xs text-violet-700">Bu sayfa planlanan AI özelliklerini önizlemektedir. Bazı işlevler henüz aktif değildir.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <div className="bg-white border border-border rounded">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Çıkarılan Alanlar — BEDAS-2026-20260601-001</h3>
              <Badge label="Aktif" />
            </div>
            <div className="p-4 space-y-3">
              {[
                { field: "Tahmini Bedel", value: "₺4.850.000", confidence: 87, missing: false },
                { field: "İhale Tarihi", value: "15 Temmuz 2026", confidence: 96, missing: false },
                { field: "Son Teklif Tarihi", value: "10 Temmuz 2026", confidence: 91, missing: false },
                { field: "Teminat Mektubu", value: "%3 geçici teminat", confidence: 78, missing: false },
                { field: "Teknik Kapasite", value: "—", confidence: 0, missing: true },
                { field: "Adet / Miktar", value: "—", confidence: 0, missing: true },
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-36 shrink-0">
                    <p className="text-[10px] font-medium text-muted-foreground">{f.field}</p>
                  </div>
                  <div className="flex-1">
                    {f.missing ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Eksik</span>
                        <input placeholder="Manuel girin..." className="text-xs bg-red-50 border border-red-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-red-300 flex-1" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{f.value}</span>
                        <div className="flex items-center gap-1 ml-auto">
                          <div className="h-1.5 w-20 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${f.confidence}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground">%{f.confidence}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-border rounded">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-xs font-semibold">İhale Karşılaştırma</h3>
              <button className="text-xs text-teal-600 hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> İhale Ekle
              </button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="font-medium text-muted-foreground">Alan</div>
                <div className="font-medium text-foreground">BEDAS-2026-001</div>
                <div className="font-medium text-muted-foreground text-slate-400">Karşılaştırılacak ihale seç...</div>
                {[
                  ["Tahmini Bedel", "₺4.850.000", "—"],
                  ["İhale Tarihi", "15 Tem 2026", "—"],
                  ["Teminat", "%3", "—"],
                ].map(([k, v1, v2], i) => (
                  <>
                    <div key={`k${i}`} className="text-[10px] text-muted-foreground py-1.5 border-t border-border">{k}</div>
                    <div key={`v1${i}`} className="text-[10px] text-foreground py-1.5 border-t border-border font-medium">{v1}</div>
                    <div key={`v2${i}`} className="text-[10px] text-slate-400 py-1.5 border-t border-border">{v2}</div>
                  </>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-border rounded">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Belgeye Soru Sor</h3>
            </div>
            <div className="p-3 space-y-2">
              <textarea rows={3} placeholder="Örn: Teknik garantinin kapsamı nedir?" className="w-full text-xs bg-slate-50 border border-border rounded px-2.5 py-2 resize-none outline-none focus:ring-1 focus:ring-teal-400" />
              <button className="w-full bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium py-1.5 rounded transition-colors flex items-center justify-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" /> Soru Sor
              </button>
              <div className="bg-slate-50 border border-border rounded p-2.5 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Yanıt:</p>
                <p>Teknik garanti süresi, sözleşme imzalanmasından itibaren 24 ay olarak belirtilmiştir (Madde 7.3).</p>
                <p className="text-[10px] text-slate-400 mt-1">Kaynak: teknik-sartname.pdf, sayfa 12</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-border rounded">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Özet Rapor Oluştur</h3>
            </div>
            <div className="p-3 space-y-2">
              <button className="w-full bg-slate-50 hover:bg-slate-100 border border-border text-xs font-medium py-2 rounded transition-colors flex items-center justify-center gap-1.5 text-foreground">
                <FileSearch className="w-3.5 h-3.5 text-teal-600" /> Özet Oluştur
              </button>
              <button className="w-full bg-slate-50 hover:bg-slate-100 border border-border text-xs font-medium py-2 rounded transition-colors flex items-center justify-center gap-1.5 text-foreground">
                <ExternalLink className="w-3.5 h-3.5 text-teal-600" /> Word'e Aktar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PAGE TITLES ──────────────────────────────────────────────────────────────
const PAGE_TITLES: Record<Page, string> = {
  home: "Ana Sayfa",
  "erp-overview": "ERP-TAKIP — Genel Bakış",
  employees: "Çalışanlar",
  tasks: "Görevler",
  approvals: "Tamamlama Onayları",
  messages: "Mesajlar",
  notifications: "Bildirimler",
  "account-requests": "Hesap Talepleri",
  "tender-dashboard": "Tender Hub — Dashboard",
  "telegram-groups": "Telegram Grupları",
  documents: "Belgeler",
  "folder-tree": "Klasör Ağacı",
  upload: "Belge Yükle",
  obsidian: "Obsidian Demo",
  "tender-detail": "İhale Detayı",
  "ai-extraction": "AI Çıkarımı",
};

export default function App() {
  const [page, setPage] = useState<Page>("erp-overview");
  const [employeeFocus, setEmployeeFocus] = useState<EmployeeFocus>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [session, setSession] = useState<ERPSession | null>(() => readStoredSession());
  const live = useLiveData(session);
  const userAllowedPages: Page[] = ["home", "erp-overview", "employees", "tasks", "messages", "notifications"];
  const navigate = (next: Page) => {
    if (next !== "employees") setEmployeeFocus(null);
    setPage(next);
  };
  const openOverdueEmployees = () => {
    setEmployeeFocus("overdue");
    setPage("employees");
  };

  useEffect(() => {
    if (session && !isAdmin(session) && !userAllowedPages.includes(page)) {
      setPage("erp-overview");
    }
  }, [page, session?.role]);

  useEffect(() => {
    const handleExpiredSession = () => {
      persistSession(null);
      setSession(null);
      setEmployeeFocus(null);
      setPage("erp-overview");
    };
    window.addEventListener("docsbot:session-expired", handleExpiredSession);
    return () => window.removeEventListener("docsbot:session-expired", handleExpiredSession);
  }, []);

  if (!session) {
    return <AuthGate onSession={(next) => { setSession(next); setEmployeeFocus(null); setPage("erp-overview"); }} />;
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
      <Sidebar
        current={page}
        setPage={navigate}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        session={session}
        live={live}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          title={PAGE_TITLES[page]}
          setPage={navigate}
          session={session}
          live={live}
          onLogout={async () => {
            await logoutERP(session.refresh_token).catch(() => undefined);
            persistSession(null);
            setSession(null);
            setEmployeeFocus(null);
            setPage("erp-overview");
          }}
        />
        <main className="flex-1 overflow-auto">
          {page === "home" && <HomePage setPage={navigate} live={live} onEmployeeDrilldown={openOverdueEmployees} />}
          {page === "erp-overview" && <ERPOverviewPage setPage={navigate} live={live} onEmployeeDrilldown={openOverdueEmployees} />}
          {page === "employees" && <EmployeesPage live={live} session={session} focus={employeeFocus} onFocusClear={() => setEmployeeFocus(null)} />}
          {page === "tasks" && <TasksPage live={live} session={session} />}
          {page === "approvals" && isAdmin(session) && <ApprovalsPage live={live} />}
          {page === "messages" && <MessagesPage live={live} session={session} />}
          {page === "notifications" && <NotificationsPage live={live} />}
          {page === "account-requests" && isAdmin(session) && <AccountRequestsPage live={live} />}
          {page === "tender-dashboard" && isAdmin(session) && <TenderDashboardPage setPage={navigate} live={live} />}
          {page === "telegram-groups" && isAdmin(session) && <TelegramGroupsPage live={live} />}
          {page === "documents" && isAdmin(session) && <DocumentsPage live={live} />}
          {page === "folder-tree" && isAdmin(session) && <FolderTreePage live={live} />}
          {page === "upload" && isAdmin(session) && <UploadPage live={live} />}
          {page === "obsidian" && isAdmin(session) && <ObsidianPage live={live} />}
          {page === "tender-detail" && isAdmin(session) && <TenderDetailPage />}
          {page === "ai-extraction" && isAdmin(session) && <AIExtractionPage />}
        </main>
      </div>
    </div>
  );
}
