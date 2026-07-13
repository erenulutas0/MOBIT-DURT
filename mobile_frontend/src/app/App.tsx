import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import { AppUpdateBanner } from "./components/AppUpdateBanner";
import { AssistantPanel } from "./components/AssistantPanel";
import { AuthFeedback, AuthModeToggle } from "./components/AuthPanels";
import mobitLogo from "@/imports/image.png";
import { MessagesTab } from "./MessagesTab";
import { TabErrorBoundary } from "./components/TabErrorBoundary";
import {
  Avatar,
  Card,
  EmptyState,
  PdfCanvasPreview,
  SectionHeader,
  Skeleton,
  TopBar,
  blobToDataUrl,
  isPdfFile,
  profilePhotoKey,
  readProfilePhoto,
} from "./shared";
import type { AuthUser, DirectMessageOpenRequest, Role, RoomOpenRequest } from "./shared";
import {
  SESSION_EXPIRED_EVENT,
  approveERPAccountRequest,
  clearStoredSession,
  createDocumentGroup,
  getBackendHealth,
  addERPTaskDependency,
  createERPTask,
  linkERPTaskDocumentGroup,
  removeERPTaskDependency,
  createERPAccountRequest,
  registerMobilePushToken,
  getDocumentGroups,
  getERPAccountRequests,
  getMobileAppUpdateInfo,
  getERPNotificationPreferences,
  getERPOverview,
  getFolderTree,
  getTenderDocumentBlob,
  getTenderDocumentsPage,
  getTendersPage,
  getVaultNotes,
  loadStoredUserAsync,
  loginToBackend,
  markAllERPNotificationsRead,
  markERPNotificationRead,
  rejectERPAccountRequest,
  requestERPAccountDeletion,
  saveSession,
  unregisterMobilePushToken,
  updateERPNotificationPreferences,
  updateERPTaskDetails,
  sendDocumentGroupMessage,
} from "./api";
import type { DocumentGroupSummary, ERPAccountRequest, ERPNotificationPreference, ERPOverview, ERPTask, FolderTree, MobileAppUpdateInfo, Tender, TenderDocument, TreeNode, VaultNote } from "./api";
import {
  employeeStatusLabel,
  formatDate,
  formatFileSize,
  taskPriorityLabel,
  taskStatusLabel,
  tenderStatusLabel,
} from "./utils/formatters";
import { validateAccountRequestForm, validateLoginForm } from "./utils/authForms";
import { buildTaskAgenda } from "./utils/taskCalendar";
import {
  dependencyCandidates,
  openPredecessorsOf,
  predecessorsOf,
  subtaskProgress,
  subtasksOf,
  successorsOf,
} from "./utils/taskRelations";
import {
  companySlug,
  deadlineRemainingLabel,
  initials,
  taskAssigneeName,
  taskAssignees,
} from "./utils/mobileWorkflow";
import {
  buildKnowledgeGraphData,
  KG_CAT_COLORS,
  KG_CAT_LABELS,
} from "./utils/knowledgeGraph";
import type { KnowledgeGraphData, KnowledgeGraphEdge, KnowledgeGraphNode } from "./utils/knowledgeGraph";
import {
  Users, ClipboardList, CheckSquare, MessageSquare,
  Bell, UserPlus, FileText, Send, FolderOpen, Upload, BookOpen,
  Cpu, ChevronRight, Search, Building2, Bot,
  AlertTriangle, CheckCircle2, XCircle,
  Download, Eye, Link, Tag, Paperclip, Pencil,
  Wifi, CalendarDays, GitBranch,
  Settings, ChevronLeft, X, Plus,
  Filter, Clock, Shield,
  HelpCircle, Home, User, LogOut, Lock, Mail,
  Flag, Menu, Command, ZoomIn, ZoomOut, LocateFixed, Share2,
  Image as ImageIcon, Trash2, Loader2, RefreshCw, Sparkles,
} from "lucide-react";

// ─── TYPES ────────────────────────────────────────────────────────────────────

type Tab = "home" | "erp" | "tender" | "messages" | "profile";
type ERPScreen =
  | "overview" | "employees" | "employee-detail"
  | "tasks" | "calendar" | "create-task" | "task-detail" | "edit-task" | "approvals" | "approval-detail"
  | "account-requests" | "notifications";
type TenderScreen =
  | "dashboard" | "documents" | "document-detail"
  | "document-groups" | "folder-tree" | "upload"
  | "obsidian" | "tender-detail" | "ai-extraction";
type ERPOpenRequest = { kind: "task"; taskId: number; nonce: number } | { kind: "account-requests"; nonce: number };
type NotificationNavigationTarget =
  | { kind: "direct"; messageId: number }
  | { kind: "room"; groupId: number; view: "chat" | "documents" }
  | { kind: "task"; taskId: number }
  | { kind: "account-requests" };
type NotificationPreferenceToggleKey =
  | "task_assigned_enabled"
  | "manager_message_enabled"
  | "employee_help_message_enabled"
  | "completion_updates_enabled"
  | "deadline_alerts_enabled"
  | "browser_push_enabled"
  | "mobile_push_enabled"
  | "email_enabled";

// ─── STATUS MAP ───────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { bg: string; text: string; dot: string }> = {
  "Online":             { bg: "bg-emerald-500/15", text: "text-emerald-400", dot: "bg-emerald-500" },
  "Away":               { bg: "bg-amber-500/15",   text: "text-amber-400",   dot: "bg-amber-400" },
  "Offline":            { bg: "bg-slate-700/60",   text: "text-slate-400",   dot: "bg-slate-500" },
  "Çevrimiçi":          { bg: "bg-emerald-500/15", text: "text-emerald-400", dot: "bg-emerald-500" },
  "Uzakta":             { bg: "bg-amber-500/15",   text: "text-amber-400",   dot: "bg-amber-400" },
  "Çevrimdışı":         { bg: "bg-slate-700/60",   text: "text-slate-400",   dot: "bg-slate-500" },
  "Devam Ediyor":       { bg: "bg-blue-500/15",    text: "text-blue-400",    dot: "bg-blue-500" },
  "Tamamlama Talep":    { bg: "bg-violet-500/15",  text: "text-violet-400",  dot: "bg-violet-500" },
  "Tamamlandı":         { bg: "bg-emerald-500/15", text: "text-emerald-400", dot: "bg-emerald-500" },
  "Gecikmiş":           { bg: "bg-red-500/15",     text: "text-red-400",     dot: "bg-red-500" },
  "İptal":              { bg: "bg-slate-700/60",   text: "text-slate-400",   dot: "bg-slate-500" },
  "Yapılacak":          { bg: "bg-slate-700/60",   text: "text-slate-400",   dot: "bg-slate-500" },
  "Aktif":              { bg: "bg-emerald-500/15", text: "text-emerald-400", dot: "bg-emerald-500" },
  "Sınıflandırılmamış": { bg: "bg-amber-500/15",   text: "text-amber-400",   dot: "bg-amber-400" },
  "Sınıflandırıldı":    { bg: "bg-emerald-500/15", text: "text-emerald-400", dot: "bg-emerald-500" },
};

const TASK_FILTER_TO_STATUS: Record<string, string | null> = {
  "Tümü": null,
  "Yapılacak": "todo",
  "Devam Ediyor": "in_progress",
  "Tamamlama Talep": "pending_approval",
  "Gecikmiş": "overdue",
  "Tamamlandı": "done",
};

const MOBILE_DEVICE_ID_KEY = "docsbot.mobile.device_id";
// CI stamps VITE_APP_VERSION to keep the in-app version aligned with the release; local builds
// fall back to this committed default.
const APP_VERSION = import.meta.env.VITE_APP_VERSION || "1.0.14";
const NATIVE_PUSH_ENABLED = import.meta.env.VITE_ENABLE_NATIVE_PUSH === "true";

function nativeMobilePlatform(): "android" | "ios" | null {
  const platform = Capacitor.getPlatform();
  return platform === "android" || platform === "ios" ? platform : null;
}

function getMobileDeviceId() {
  const stored = localStorage.getItem(MOBILE_DEVICE_ID_KEY);
  if (stored) return stored;

  const next = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  localStorage.setItem(MOBILE_DEVICE_ID_KEY, next);
  return next;
}

function parsePositiveNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

type NotificationUrgency = "critical" | "high" | "normal";

function notificationUrgency(priority?: string | null): NotificationUrgency {
  const value = (priority || "").toUpperCase();
  if (value === "CRITICAL" || value === "URGENT") return "critical";
  if (value === "HIGH") return "high";
  return "normal";
}

function notificationNavigationTarget(payload: {
  eventKey?: string | null;
  taskId?: number | string | null;
}): NotificationNavigationTarget | null {
  const directMessageId = payload.eventKey?.startsWith("direct-message:")
    ? parsePositiveNumber(payload.eventKey.split(":")[1])
    : null;
  if (directMessageId) return { kind: "direct", messageId: directMessageId };

  const eventParts = payload.eventKey?.split(":") || [];
  const groupId = parsePositiveNumber(eventParts[1]);
  if (eventParts[0] === "document-group-message" && groupId) {
    return { kind: "room", groupId, view: "chat" };
  }
  if (
    ["document-group-document-uploaded", "document-group-document-replaced", "document-group-member-added", "document-group-member-removed"].includes(eventParts[0])
    && groupId
  ) {
    return {
      kind: "room",
      groupId,
      view: eventParts[0].startsWith("document-group-document") ? "documents" : "chat",
    };
  }
  if (eventParts[0] === "account-deletion-request") {
    return { kind: "account-requests" };
  }

  const taskId = parsePositiveNumber(payload.taskId);
  return taskId ? { kind: "task", taskId } : null;
}

function nativePushTarget(data: Record<string, unknown> | undefined): NotificationNavigationTarget | null {
  if (!data) return null;
  const taskId = typeof data.task_id === "string" || typeof data.task_id === "number"
    ? data.task_id
    : typeof data.taskId === "string" || typeof data.taskId === "number"
      ? data.taskId
      : null;
  return notificationNavigationTarget({
    eventKey: String(data.event_key || data.eventKey || ""),
    taskId,
  });
}

const PUSH_RECEIVED_EVENT = "docsbot:push-received";

async function createNativePushChannels() {
  // Android notification channels; sound/priority routing per urgency is
  // selected server-side via the FCM channel id.
  await PushNotifications.createChannel({
    id: "tasks_normal",
    name: "Görev bildirimleri",
    description: "Görev, mesaj ve onay bildirimleri",
    importance: 3,
  });
  await PushNotifications.createChannel({
    id: "tasks_critical",
    name: "Kritik görev uyarıları",
    description: "Yaklaşan deadline ve geciken görev uyarıları",
    importance: 5,
    vibration: true,
  });
}

async function registerNativePushNotifications(onAction: (target: NotificationNavigationTarget) => void) {
  const platform = nativeMobilePlatform();
  if (!platform || !NATIVE_PUSH_ENABLED) return;

  let permissions = await PushNotifications.checkPermissions();
  if (permissions.receive === "prompt") {
    permissions = await PushNotifications.requestPermissions();
  }
  if (permissions.receive !== "granted") return;

  if (platform === "android") {
    await createNativePushChannels().catch(error => {
      console.warn("Push notification channels could not be created.", error);
    });
  }

  await PushNotifications.removeAllListeners();
  await PushNotifications.addListener("pushNotificationReceived", () => {
    // Foreground push: the OS does not show a banner, so let open views
    // refresh their data instead.
    window.dispatchEvent(new CustomEvent(PUSH_RECEIVED_EVENT));
  });
  await PushNotifications.addListener("registration", token => {
    void registerMobilePushToken({
      platform,
      deviceId: getMobileDeviceId(),
      token: token.value,
      appVersion: APP_VERSION,
    }).catch(error => {
      console.warn("Mobile push token could not be registered.", error);
    });
  });
  await PushNotifications.addListener("registrationError", error => {
    console.warn("Mobile push registration failed.", error);
  });
  await PushNotifications.addListener("pushNotificationActionPerformed", event => {
    const target = nativePushTarget(event.notification.data as Record<string, unknown> | undefined);
    if (target) onAction(target);
  });
  await PushNotifications.register();
}

async function unregisterNativePushNotifications() {
  const platform = nativeMobilePlatform();
  if (!platform || !NATIVE_PUSH_ENABLED) return;

  await unregisterMobilePushToken({
    platform,
    deviceId: getMobileDeviceId(),
  }).catch(error => {
    console.warn("Mobile push token could not be unregistered.", error);
  });
  await PushNotifications.removeAllListeners().catch(() => undefined);
}

function taskDocumentCount(task: ERPTask, overview: ERPOverview | null) {
  return overview?.documents.filter(item => item.task_id === task.id).length || 0;
}

// ─── PRIMITIVES ───────────────────────────────────────────────────────────────
function Badge({ label }: { label: string }) {
  const s = STATUS_MAP[label] || { bg: "bg-slate-700/60", text: "text-slate-400", dot: "" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${s.bg} ${s.text}`}>
      {label}
    </span>
  );
}

/** Eases a numeric stat from its previous value to the next one (~400ms). */
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const previous = useRef(value);

  useEffect(() => {
    const from = previous.current;
    previous.current = value;
    if (from === value) return;
    const start = performance.now();
    const duration = 400;
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (value - from) * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);

  return <>{display}</>;
}

function KPIRow({ items }: { items: { label: string; value: string | number; color?: string; icon?: any }[] }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <Card key={i} className="p-3">
            {Icon && <Icon className={`w-4 h-4 mb-2 ${item.color || "text-primary"}`} />}
            <p className={`text-2xl font-bold font-mono tracking-tight ${item.color || "text-foreground"}`}>
              {typeof item.value === "number" ? <AnimatedNumber value={item.value} /> : item.value}
            </p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{item.label}</p>
          </Card>
        );
      })}
    </div>
  );
}

/** Dashboard placeholder shown while the first load is in flight. */
function DashboardSkeleton() {
  return (
    <div className="space-y-5" aria-hidden>
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-24" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    </div>
  );
}

function writeProfilePhoto(userIdOrEmail: number | string | null | undefined, value: string) {
  try {
    window.localStorage.setItem(profilePhotoKey(userIdOrEmail), value);
  } catch {
    // The selected image is kept local; storage pressure should not break profile rendering.
  }
}

/** ISO timestamp → value for a datetime-local input, in the device's timezone. */
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function flattenFolders(node: TreeNode | null | undefined, depth = 0): { path: string; name: string; depth: number }[] {
  if (!node || node.type !== "folder") return [];
  const self = node.path ? [{ path: node.path, name: node.name, depth }] : [];
  return [
    ...self,
    ...node.children.flatMap(child => flattenFolders(child, depth + 1)),
  ];
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin, notice }: { onLogin: (u: AuthUser) => void; notice?: string }) {
  const [mode, setMode] = useState<"login" | "request">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [requestName, setRequestName] = useState("");
  const [requestEmail, setRequestEmail] = useState("");
  const [requestPhone, setRequestPhone] = useState("");
  const [requestPassword, setRequestPassword] = useState("");
  const [requestPasswordConfirm, setRequestPasswordConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const switchMode = (nextMode: "login" | "request") => {
    setError("");
    setSuccess("");
    setMode(nextMode);
  };

  const handleLogin = async () => {
    setError("");
    setSuccess("");
    const validation = validateLoginForm(email, password);
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setLoading(true);
    try {
      const user = await loginToBackend(email, password);
      saveSession(user);
      onLogin({ id: user.id, name: user.name, email: user.email, role: user.role, dept: user.dept });
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Giriş yapılamadı.");
      setLoading(false);
    }
  };

  const handleAccountRequest = async () => {
    setError("");
    setSuccess("");
    const validation = validateAccountRequestForm({
      name: requestName,
      email: requestEmail,
      phone: requestPhone,
      password: requestPassword,
      passwordConfirm: requestPasswordConfirm,
    });
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    setLoading(true);
    try {
      await createERPAccountRequest(validation.payload);
      setSuccess("Hesap talebiniz admin onayına gönderildi.");
      setEmail(validation.payload.email);
      setPassword("");
      setRequestName("");
      setRequestEmail("");
      setRequestPhone("");
      setRequestPassword("");
      setRequestPasswordConfirm("");
      setMode("login");
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Hesap talebi oluşturulamadı.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full bg-background px-6 overflow-y-auto">
      <div className="tab-enter min-h-full flex flex-col justify-center py-8">
      {/* Logo */}
      <div className="flex flex-col items-center mb-8">
        <ImageWithFallback src={mobitLogo} alt="Mobit" className="h-14 object-contain mb-5" />
        <h1 className="text-xl font-bold text-foreground">Mobit</h1>
        <p className="text-sm text-muted-foreground mt-1">Operasyonel Yönetim Platformu</p>
      </div>

      {notice && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <p className="text-xs text-amber-200">{notice}</p>
        </div>
      )}

      <AuthModeToggle mode={mode} onChange={switchMode} />

      {/* Form */}
      <div className="space-y-3">
        {mode === "login" ? (
          <>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1.5">E-posta</label>
              <div className="flex items-center gap-2.5 bg-card border border-border rounded-xl px-4 py-3">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                  placeholder="ornek@mobit.com.tr"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Şifre</label>
              <div className="flex items-center gap-2.5 bg-card border border-border rounded-xl px-4 py-3">
                <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleLogin()}
                  placeholder="••••••••"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
                <button onClick={() => setShowPw(v => !v)} className="text-muted-foreground text-xs font-medium shrink-0">
                  {showPw ? "Gizle" : "Göster"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Ad Soyad</label>
              <div className="flex items-center gap-2.5 bg-card border border-border rounded-xl px-4 py-3">
                <User className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  value={requestName}
                  onChange={e => setRequestName(e.target.value)}
                  placeholder="Adınız ve soyadınız"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1.5">E-posta</label>
              <div className="flex items-center gap-2.5 bg-card border border-border rounded-xl px-4 py-3">
                <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="email"
                  value={requestEmail}
                  onChange={e => setRequestEmail(e.target.value)}
                  placeholder="ornek@mobit.com.tr"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Telefon</label>
              <div className="flex items-center gap-2.5 bg-card border border-border rounded-xl px-4 py-3">
                <UserPlus className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="tel"
                  value={requestPhone}
                  onChange={e => setRequestPhone(e.target.value)}
                  placeholder="İsteğe bağlı"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Şifre</label>
              <div className="flex items-center gap-2.5 bg-card border border-border rounded-xl px-4 py-3">
                <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type={showPw ? "text" : "password"}
                  value={requestPassword}
                  onChange={e => setRequestPassword(e.target.value)}
                  placeholder="En az 10 karakter"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
                <button onClick={() => setShowPw(v => !v)} className="text-muted-foreground text-xs font-medium shrink-0">
                  {showPw ? "Gizle" : "Göster"}
                </button>
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground block mb-1.5">Şifre Tekrar</label>
              <div className="flex items-center gap-2.5 bg-card border border-border rounded-xl px-4 py-3">
                <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type={showPw ? "text" : "password"}
                  value={requestPasswordConfirm}
                  onChange={e => setRequestPasswordConfirm(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAccountRequest()}
                  placeholder="Şifrenizi tekrar yazın"
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
              </div>
            </div>
          </>
        )}

        <AuthFeedback success={success} error={error} />

        <button
          onClick={mode === "login" ? handleLogin : handleAccountRequest}
          disabled={loading}
          className="w-full py-3.5 bg-primary rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity mt-2"
        >
          {loading
            ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> {mode === "login" ? "Giriş yapılıyor..." : "Talep gönderiliyor..."}</>
            : mode === "login" ? "Giriş Yap" : "Talep Oluştur"}
        </button>
        {mode === "request" && (
          <p className="text-[11px] text-muted-foreground text-center leading-relaxed px-2">
            Talebiniz yöneticilere iletilir. Onaylandıktan sonra belirlediğiniz şifreyle giriş yapabilirsiniz.
          </p>
        )}
      </div>

      <p className="text-[10px] text-muted-foreground text-center mt-8">
        v1.0.6 · Mobit © 2026
      </p>
      </div>
    </div>
  );
}

// ─── HOME TAB ─────────────────────────────────────────────────────────────────
function HomeTab({ user, setTab }: { user: AuthUser; setTab: (t: Tab) => void }) {
  const isAdmin = user.role === "admin";
  const [showAssistant, setShowAssistant] = useState(false);
  const [appUpdate, setAppUpdate] = useState<MobileAppUpdateInfo | null>(null);
  // null = probe in flight; the status card must reflect reality, not wishful constants
  const [backendUp, setBackendUp] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    const probe = () => void getBackendHealth().then(ok => {
      if (!cancelled) setBackendUp(ok);
    });
    probe();
    const intervalId = window.setInterval(probe, 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [isAdmin]);

  useEffect(() => {
    let cancelled = false;
    void getMobileAppUpdateInfo(APP_VERSION)
      .then(update => {
        if (!cancelled) setAppUpdate(update.update_available ? update : null);
      })
      .catch(() => {
        if (!cancelled) setAppUpdate(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex flex-col min-h-full">
      <div className="px-4 pt-5 pb-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Hoş geldiniz,</p>
            <h1 className="text-xl font-bold text-foreground">{user.name}</h1>
          </div>
          <ImageWithFallback src={mobitLogo} alt="Mobit" className="h-10 object-contain" />
        </div>
        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
          <Building2 className="w-3.5 h-3.5" />
          <span>Mobit</span>
          <span className="opacity-30">·</span>
          <div className={`w-2 h-2 rounded-full ${isAdmin ? "bg-teal-500" : "bg-blue-500"}`} />
          <span className={isAdmin ? "text-teal-400" : "text-blue-400"}>
            {isAdmin ? "Admin" : "Kullanıcı"}
          </span>
        </div>
      </div>

      <div className="flex-1 px-4 py-5 space-y-5">
        {appUpdate && <AppUpdateBanner update={appUpdate} />}

        <div className="space-y-3">
          {/* Mobit-Asistan — the personal briefing entry point */}
          <div className="rounded-2xl p-px bg-gradient-to-br from-violet-500/40 via-violet-500/10 to-transparent surface-elevated">
          <button onClick={() => setShowAssistant(true)}
            className="w-full bg-gradient-to-br from-[#1B1330] to-[#10101A] rounded-[calc(1rem-1px)] p-4 text-left active:scale-[0.98] transition-transform">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-violet-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground">Mobit-Asistan</p>
                <p className="text-xs text-muted-foreground">
                  Günün özeti: görevler, teslim tarihleri, hatırlatmalar
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
          </button>
          </div>

          <div className="rounded-2xl p-px bg-gradient-to-br from-blue-500/40 via-blue-500/10 to-transparent surface-elevated">
          <button onClick={() => setTab("erp")}
            className="w-full bg-gradient-to-br from-[#131B2E] to-[#10101A] rounded-[calc(1rem-1px)] p-4 text-left active:scale-[0.98] transition-transform">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-blue-400" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold text-foreground">Operasyon Yönetimi</p>
                <p className="text-xs text-muted-foreground">
                  {isAdmin ? "Görev ve çalışan yönetimi" : "Görevlerim ve mesajlarım"}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="bg-black/20 rounded-xl px-3 py-2.5 text-center">
              <p className="text-sm text-blue-300 font-medium">
                {isAdmin ? "Tüm çalışan & görev yönetimi" : "Kendi görevleriniz ve mesajlarınız"}
              </p>
            </div>
          </button>
          </div>

          {isAdmin && (
            <div className="rounded-2xl p-px bg-gradient-to-br from-teal-500/40 via-teal-500/10 to-transparent surface-elevated">
            <button onClick={() => setTab("tender")}
              className="w-full bg-gradient-to-br from-[#12211F] to-[#10101A] rounded-[calc(1rem-1px)] p-4 text-left active:scale-[0.98] transition-transform">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center">
                  <FileText className="w-5 h-5 text-teal-400" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-foreground">Doküman Ağı</p>
                  <p className="text-xs text-muted-foreground">Şirket, belge ve çalışma alanları</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
              <div className="bg-black/20 rounded-xl px-3 py-2.5 text-center">
                <p className="text-sm text-teal-300 font-medium">Belgeler, çalışma alanları ve bilgi ağı</p>
              </div>
            </button>
            </div>
          )}
        </div>

        {/* System status — admin only */}
        {isAdmin && (
          <div>
            <SectionHeader title="Sistem Durumu" />
            <Card className="divide-y divide-border">
              {[
                {
                  label: "Sunucu & Veritabanı",
                  tone: backendUp === null ? "pending" : backendUp ? "ok" : "down",
                  detail: backendUp === null ? "Kontrol ediliyor…" : backendUp ? "Aktif" : "Ulaşılamıyor",
                },
                { label: "AI Servisi", tone: "planned", detail: "Yakında" },
              ].map((s, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-2 h-2 rounded-full ${
                      s.tone === "ok" ? "bg-emerald-500"
                        : s.tone === "down" ? "bg-red-500"
                        : s.tone === "pending" ? "bg-slate-500 animate-pulse"
                        : "bg-slate-600"
                    }`} />
                    <span className="text-sm text-foreground">{s.label}</span>
                  </div>
                  <span className={`text-xs ${s.tone === "down" ? "text-red-400" : "text-muted-foreground"}`}>{s.detail}</span>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* Quick links for user */}
        {!isAdmin && (
          <div>
            <SectionHeader title="Hızlı Erişim" />
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Görevlerim",  icon: ClipboardList, tab: "erp"      as Tab, color: "text-blue-400",   bg: "bg-blue-500/15" },
                { label: "Mesajlarım",  icon: MessageSquare, tab: "messages" as Tab, color: "text-teal-400",   bg: "bg-teal-500/15" },
                { label: "Bildirimler", icon: Bell,          tab: "erp"      as Tab, color: "text-violet-400", bg: "bg-violet-500/15" },
                { label: "Profilim",    icon: User,          tab: "profile"  as Tab, color: "text-slate-400",  bg: "bg-slate-500/15" },
              ].map((item, i) => {
                const Icon = item.icon;
                return (
                  <button key={i} onClick={() => setTab(item.tab)}
                    className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2 active:scale-[0.97] transition-transform text-left">
                    <div className={`w-9 h-9 rounded-xl ${item.bg} flex items-center justify-center`}>
                      <Icon className={`w-5 h-5 ${item.color}`} />
                    </div>
                    <span className="text-sm font-semibold text-foreground">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
        <div className="h-4" />
      </div>

      {showAssistant && (
        <AssistantPanel
          userName={user.name}
          onClose={() => setShowAssistant(false)}
          onOpenTasks={() => {
            setShowAssistant(false);
            setTab("erp");
          }}
          onOpenMessages={() => {
            setShowAssistant(false);
            setTab("messages");
          }}
        />
      )}
    </div>
  );
}

// ─── ERP TAB ──────────────────────────────────────────────────────────────────
function ERPTab({
  user,
  onOpenDirectMessage,
  onOpenDocumentRoom,
  openRequest,
}: {
  user: AuthUser;
  onOpenDirectMessage: (messageId: number) => void;
  onOpenDocumentRoom: (groupId: number, view: "chat" | "documents") => void;
  openRequest?: ERPOpenRequest | null;
}) {
  const isAdmin = user.role === "admin";
  const [screen, setScreen] = useState<ERPScreen>("overview");
  const [taskFilter, setTaskFilter] = useState("Tümü");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [overview, setOverview] = useState<ERPOverview | null>(null);
  const [accountRequests, setAccountRequests] = useState<ERPAccountRequest[]>([]);
  const [notificationPrefs, setNotificationPrefs] = useState<ERPNotificationPreference | null>(null);
  const [prefSaving, setPrefSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [taskInstructions, setTaskInstructions] = useState("");
  const [taskPriority, setTaskPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [taskDeadlineLocal, setTaskDeadlineLocal] = useState("");
  const [taskAssigneeIds, setTaskAssigneeIds] = useState<number[]>([]);
  const [taskLeaderId, setTaskLeaderId] = useState<number | null>(null);
  const [createTaskGroup, setCreateTaskGroup] = useState(false);
  const [taskGroupName, setTaskGroupName] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPriority, setEditPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [editDeadlineLocal, setEditDeadlineLocal] = useState("");
  const [editClearDeadline, setEditClearDeadline] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [createTaskParentId, setCreateTaskParentId] = useState<number | null>(null);
  const [dependencyPickerId, setDependencyPickerId] = useState("");
  const [dependencyBusy, setDependencyBusy] = useState(false);

  const navTo = (s: ERPScreen) => setScreen(s);
  const back = () => navTo("overview");
  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const [nextOverview, nextPrefs, nextRequests] = await Promise.all([
        getERPOverview(),
        getERPNotificationPreferences().catch(() => null),
        isAdmin ? getERPAccountRequests().catch(() => []) : Promise.resolve([]),
      ]);
      setOverview(nextOverview);
      if (nextPrefs) setNotificationPrefs(nextPrefs);
      setAccountRequests(nextRequests);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "ERP verisi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, [user.id, user.role]);

  useEffect(() => {
    const handler = () => void refresh();
    window.addEventListener(PUSH_RECEIVED_EVENT, handler);
    return () => window.removeEventListener(PUSH_RECEIVED_EVENT, handler);
  }, [user.id, user.role]);

  const visibleTasks = useMemo(() => {
    const tasks = overview?.tasks || [];
    if (isAdmin) return tasks;
    const assignedIds = new Set(
      (overview?.assignments || [])
        .filter(item => item.assignee_user_id === user.id)
        .map(item => item.task_id)
    );
    return tasks.filter(task => assignedIds.has(task.id));
  }, [isAdmin, overview, user.id]);

  const filteredTasks = useMemo(() => {
    const status = TASK_FILTER_TO_STATUS[taskFilter];
    return status ? visibleTasks.filter(task => task.status === status) : visibleTasks;
  }, [taskFilter, visibleTasks]);

  const activeTasks = visibleTasks.filter(task => !["done", "cancelled"].includes(task.status));
  const pendingTasks = visibleTasks.filter(task => task.status === "pending_approval");
  const overdueTasks = visibleTasks.filter(task => task.status === "overdue");
  const unreadNotifications = (overview?.notifications || []).filter(item => !item.read_at).length;
  const recentTasks = [...visibleTasks]
    .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime())
    .slice(0, 3);
  const employeeSearchTerm = employeeSearch.toLocaleLowerCase("tr-TR").trim();
  const filteredEmployees = (overview?.users || [])
    .filter(employee => {
      if (!employeeSearchTerm) return true;
      return [
        employee.name,
        employee.email || "",
        employee.role === "admin" ? "admin yönetici" : "kullanıcı çalışan",
        employeeStatusLabel(employee.status),
      ].join(" ").toLocaleLowerCase("tr-TR").includes(employeeSearchTerm);
    })
    .sort((left, right) => left.name.localeCompare(right.name, "tr", { sensitivity: "base" }));
  const taskAssignableUsers = (overview?.users || [])
    .filter(employee => employee.approved_at && employee.role !== "admin")
    .sort((left, right) => left.name.localeCompare(right.name, "tr", { sensitivity: "base" }));
  const selectedTaskAssignees = taskAssignableUsers.filter(employee => taskAssigneeIds.includes(employee.id));
  const selectedTaskLeader = selectedTaskAssignees.find(employee => employee.id === taskLeaderId) || selectedTaskAssignees[0] || null;
  const taskDeadlineIso = taskDeadlineLocal ? new Date(taskDeadlineLocal).toISOString() : null;

  const openEditTask = (task: ERPTask) => {
    setEditTitle(task.title);
    setEditDescription(task.description || "");
    const priority = task.priority?.toLowerCase();
    setEditPriority(priority === "low" || priority === "high" || priority === "urgent" ? priority : "normal");
    setEditDeadlineLocal(isoToLocalInput(task.deadline_at));
    setEditClearDeadline(false);
    setError("");
    navTo("edit-task");
  };

  const submitTaskEdit = async () => {
    if (!selectedTaskId) return;
    if (editTitle.trim().length < 3) {
      setError("Görev başlığı en az 3 karakter olmalıdır.");
      return;
    }
    setError("");
    setEditSaving(true);
    try {
      await updateERPTaskDetails(selectedTaskId, {
        title: editTitle.trim(),
        description: editDescription,
        priority: editPriority,
        ...(editClearDeadline
          ? { clear_deadline: true }
          : editDeadlineLocal
            ? { deadline_at: new Date(editDeadlineLocal).toISOString() }
            : {}),
      });
      await refresh();
      navTo("task-detail");
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Görev güncellenemedi.");
    } finally {
      setEditSaving(false);
    }
  };

  const resetTaskForm = () => {
    setTaskTitle("");
    setTaskInstructions("");
    setTaskPriority("normal");
    setTaskDeadlineLocal("");
    setTaskAssigneeIds([]);
    setTaskLeaderId(null);
    setCreateTaskGroup(false);
    setTaskGroupName("");
    setCreateTaskParentId(null);
  };

  const startSubtaskCreation = (parentTask: ERPTask) => {
    resetTaskForm();
    setCreateTaskParentId(parentTask.id);
    setError("");
    navTo("create-task");
  };

  const submitDependencyAdd = async () => {
    if (!selectedTaskId || !dependencyPickerId || dependencyBusy) return;
    setDependencyBusy(true);
    setError("");
    try {
      await addERPTaskDependency(selectedTaskId, Number(dependencyPickerId));
      setDependencyPickerId("");
      await refresh();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Görev bağımlılığı eklenemedi.");
    } finally {
      setDependencyBusy(false);
    }
  };

  const submitDependencyRemove = async (predecessorTaskId: number) => {
    if (!selectedTaskId || dependencyBusy) return;
    setDependencyBusy(true);
    setError("");
    try {
      await removeERPTaskDependency(selectedTaskId, predecessorTaskId);
      await refresh();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Görev bağımlılığı kaldırılamadı.");
    } finally {
      setDependencyBusy(false);
    }
  };

  const toggleTaskAssignee = (employeeId: number) => {
    setTaskAssigneeIds(current => {
      const exists = current.includes(employeeId);
      const next = exists ? current.filter(id => id !== employeeId) : [...current, employeeId];
      setTaskLeaderId(leader => next.includes(leader || -1) ? leader : next[0] || null);
      if (next.length < 2) setCreateTaskGroup(false);
      return next;
    });
  };

  const submitTask = async () => {
    if (!isAdmin || taskSaving) return;
    if (!taskTitle.trim()) {
      setError("Görev başlığı zorunludur.");
      return;
    }
    if (taskAssigneeIds.length === 0) {
      setError("En az bir çalışan seçin.");
      return;
    }
    setTaskSaving(true);
    setError("");
    try {
      const leader = selectedTaskLeader;
      const memberLines = selectedTaskAssignees
        .map(employee => `- ${employee.name}${employee.id === leader?.id ? " (Sorumlu)" : ""}`)
        .join("\n");
      const description = [
        taskInstructions.trim(),
        "",
        "Görev dağılımı:",
        leader ? `Sorumlu: ${leader.name}` : "",
        "Katılımcılar:",
        memberLines,
      ].filter(Boolean).join("\n");
      const task = await createERPTask({
        title: taskTitle.trim(),
        description,
        assigneeUserIds: taskAssigneeIds,
        responsibleUserId: leader?.id || null,
        priority: taskPriority,
        deadlineAt: taskDeadlineIso,
        parentTaskId: createTaskParentId,
      });
      let createdGroupId: number | null = null;
      if (createTaskGroup && taskAssigneeIds.length > 1) {
        const detail = await createDocumentGroup({
          name: taskGroupName.trim() || `${taskTitle.trim()} çalışma alanı`,
          description: description.slice(0, 1000),
          memberUserIds: taskAssigneeIds,
        });
        createdGroupId = detail.group.id;
        await sendDocumentGroupMessage(detail.group.id, [
          `Görev: ${task.title}`,
          leader ? `Sorumlu: ${leader.name}` : "",
          taskDeadlineIso ? `Teslim: ${formatDate(taskDeadlineIso)} (${deadlineRemainingLabel(taskDeadlineIso)})` : "",
          "",
          taskInstructions.trim(),
        ].filter(Boolean).join("\n"));
        try {
          await linkERPTaskDocumentGroup(task.id, detail.group.id);
        } catch (linkException) {
          console.warn("Görev odaya bağlanamadı.", linkException);
        }
      }
      await refresh();
      resetTaskForm();
      if (createdGroupId) {
        onOpenDocumentRoom(createdGroupId, "chat");
      } else {
        setSelectedTaskId(task.id);
        navTo("task-detail");
      }
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Görev oluşturulamadı.");
    } finally {
      setTaskSaving(false);
    }
  };

  const openTask = (taskId: number) => {
    setSelectedTaskId(taskId);
    navTo("task-detail");
  };

  useEffect(() => {
    if (!openRequest) return;
    if (openRequest.kind === "task") {
      openTask(openRequest.taskId);
      return;
    }
    if (openRequest.kind === "account-requests" && isAdmin) {
      navTo("account-requests");
    }
  }, [openRequest?.nonce]);

  const markNotificationRead = async (notificationId: number) => {
    const updated = await markERPNotificationRead(notificationId);
    setOverview(current => current
      ? { ...current, notifications: current.notifications.map(item => item.id === updated.id ? updated : item) }
      : current);
  };

  const openNotification = async (notification: ERPOverview["notifications"][number]) => {
    if (!notification.read_at) {
      await markNotificationRead(notification.id);
    }
    const target = notificationNavigationTarget({
      eventKey: notification.event_key,
      taskId: notification.task_id,
    });
    if (!target) return;
    if (target.kind === "direct") {
      onOpenDirectMessage(target.messageId);
    } else if (target.kind === "room") {
      onOpenDocumentRoom(target.groupId, target.view);
    } else if (target.kind === "task") {
      openTask(target.taskId);
    } else if (target.kind === "account-requests" && isAdmin) {
      navTo("account-requests");
    }
  };

  const markAllNotificationsRead = async () => {
    await markAllERPNotificationsRead();
    const readAt = new Date().toISOString();
    setOverview(current => current
      ? { ...current, notifications: current.notifications.map(item => ({ ...item, read_at: item.read_at || readAt })) }
      : current);
  };

  const approveAccountRequest = async (requestId: number) => {
    setLoading(true);
    setError("");
    try {
      await approveERPAccountRequest(requestId);
      await refresh();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Hesap talebi onaylanamadı.");
      setLoading(false);
    }
  };

  const rejectAccountRequest = async (requestId: number) => {
    setLoading(true);
    setError("");
    try {
      await rejectERPAccountRequest(requestId);
      await refresh();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Hesap talebi reddedilemedi.");
      setLoading(false);
    }
  };

  const toggleNotificationPreference = async (key: NotificationPreferenceToggleKey) => {
    if (!notificationPrefs) return;
    setPrefSaving(true);
    setError("");
    try {
      const next = await updateERPNotificationPreferences({ [key]: !notificationPrefs[key] });
      setNotificationPrefs(next);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Bildirim tercihi güncellenemedi.");
    } finally {
      setPrefSaving(false);
    }
  };

  const TaskList = ({ tasks, emptyDesc }: { tasks: ERPTask[]; emptyDesc: string }) => (
    tasks.length === 0 ? (
      <EmptyState
        icon={ClipboardList}
        title="Görev bulunamadı"
        desc={emptyDesc}
        action={isAdmin ? "Yenile" : undefined}
        onAction={isAdmin ? refresh : undefined}
      />
    ) : (
      <div className="space-y-3">
        {tasks.map(task => (
          <Card key={task.id} className="p-4" onPress={() => openTask(task.id)}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground leading-snug">{task.title}</p>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                  {task.description || "Açıklama eklenmemiş."}
                </p>
              </div>
              <Badge label={taskStatusLabel(task.status)} />
            </div>
            <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5 min-w-0">
                <User className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">{taskAssigneeName(task, overview)}</span>
              </span>
              <span className="flex items-center gap-1.5 justify-end">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span>{formatDate(task.deadline_at)}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <Flag className="w-3.5 h-3.5 shrink-0" />
                <span>{taskPriorityLabel(task.priority)}</span>
              </span>
              <span className="flex items-center gap-1.5 justify-end">
                <Paperclip className="w-3.5 h-3.5 shrink-0" />
                <span>{taskDocumentCount(task, overview)} belge</span>
              </span>
            </div>
          </Card>
        ))}
      </div>
    )
  );

  const LoadingOrError = () => (
    <>
      {loading && !overview && <DashboardSkeleton />}
      {error && (
        <Card className="p-4 border-red-500/30 bg-red-500/10">
          <p className="text-sm font-semibold text-red-300">Operasyon bağlantısı kurulamadı</p>
          <p className="text-xs text-red-200/80 mt-1">{error}</p>
          <button onClick={refresh} className="mt-3 px-3 py-2 rounded-lg bg-red-500/20 text-xs font-semibold text-red-100">
            Yeniden Dene
          </button>
        </Card>
      )}
    </>
  );

  // OVERVIEW
  if (screen === "overview") return (
    <div className="flex flex-col min-h-full">
      <TopBar
        title={
          <div>
            <p className="text-[10px] text-muted-foreground">Modül</p>
            <h1 className="text-base font-bold text-foreground leading-tight">Operasyon Yönetimi</h1>
          </div>
        }
        actions={
          <button onClick={() => navTo("notifications")} className="relative w-9 h-9 flex items-center justify-center rounded-full bg-muted">
            <Bell className="w-4 h-4 text-foreground" />
            {unreadNotifications > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-[9px] font-bold text-white flex items-center justify-center">
                {unreadNotifications > 9 ? "9+" : unreadNotifications}
              </span>
            )}
          </button>
        }
      />
      <div className="flex-1 px-4 py-5 space-y-5">
        <LoadingOrError />
        {/* Counters render only from real data — no misleading zeros while the load fails */}
        {isAdmin && overview && (
          <>
            <KPIRow items={[
              { label: "Aktif Görev",    value: activeTasks.length, icon: ClipboardList, color: "text-blue-400" },
              { label: "Onay Bekleyen",  value: pendingTasks.length, icon: CheckSquare,  color: "text-violet-400" },
              { label: "Gecikmiş",       value: overdueTasks.length, icon: AlertTriangle, color: "text-red-400" },
            ]} />
            <KPIRow items={[
              { label: "Çevrimiçi",      value: (overview?.users || []).filter(item => item.status === "online").length, icon: Wifi,      color: "text-emerald-400" },
              { label: "Yardım Mesajı",  value: (overview?.help_messages || []).length, icon: HelpCircle,color: "text-amber-400" },
              { label: "Bildirim",       value: unreadNotifications, icon: Bell,  color: "text-teal-400" },
            ]} />
          </>
        )}
        {!isAdmin && overview && (
          <KPIRow items={[
            { label: "Aktif",      value: activeTasks.length, icon: ClipboardList, color: "text-blue-400" },
            { label: "Onay",       value: pendingTasks.length, icon: CheckSquare,  color: "text-violet-400" },
            { label: "Bildirim",   value: unreadNotifications, icon: Bell,        color: "text-teal-400" },
          ]} />
        )}

        <div className="grid grid-cols-2 gap-3">
          {isAdmin ? (
            <>
              <button onClick={() => navTo("employees")}
                className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2 active:scale-[0.97] transition-transform text-left">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
                  <Users className="w-5 h-5 text-blue-400" />
                </div>
                <span className="text-sm font-semibold text-foreground">Çalışanlar</span>
              </button>
              <button onClick={() => navTo("tasks")}
                className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2 active:scale-[0.97] transition-transform text-left">
                <div className="w-9 h-9 rounded-xl bg-teal-500/15 flex items-center justify-center">
                  <ClipboardList className="w-5 h-5 text-teal-400" />
                </div>
                <span className="text-sm font-semibold text-foreground">Görevler</span>
              </button>
              <button onClick={() => navTo("create-task")}
                className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2 active:scale-[0.97] transition-transform text-left">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                  <Plus className="w-5 h-5 text-emerald-400" />
                </div>
                <span className="text-sm font-semibold text-foreground">Görev Ver</span>
              </button>
              <button onClick={() => navTo("approvals")}
                className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2 active:scale-[0.97] transition-transform text-left">
                <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
                  <CheckSquare className="w-5 h-5 text-violet-400" />
                </div>
                <span className="text-sm font-semibold text-foreground">Onaylar</span>
              </button>
              <button onClick={() => navTo("account-requests")}
                className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2 active:scale-[0.97] transition-transform text-left">
                <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
                  <UserPlus className="w-5 h-5 text-amber-400" />
                </div>
                <span className="text-sm font-semibold text-foreground">Hesap Talepleri</span>
              </button>
            </>
          ) : (
            <>
              <button onClick={() => navTo("tasks")}
                className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2 active:scale-[0.97] transition-transform text-left">
                <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
                  <ClipboardList className="w-5 h-5 text-blue-400" />
                </div>
                <span className="text-sm font-semibold text-foreground">Görevlerim</span>
              </button>
              <button onClick={() => navTo("notifications")}
                className="bg-card border border-border rounded-xl p-4 flex flex-col gap-2 active:scale-[0.97] transition-transform text-left">
                <div className="w-9 h-9 rounded-xl bg-violet-500/15 flex items-center justify-center">
                  <Bell className="w-5 h-5 text-violet-400" />
                </div>
                <span className="text-sm font-semibold text-foreground">Bildirimler</span>
              </button>
            </>
          )}
        </div>

        {/* Tasks list */}
        <div>
          <SectionHeader
            title={isAdmin ? "Tüm Görevler" : "Görevlerim"}
            action="Tümünü Gör"
            onAction={() => navTo("tasks")}
          />
          <TaskList
            tasks={recentTasks}
            emptyDesc={isAdmin ? "Görevler atandığında burada görünecek." : "Size atanan görevler burada görünecek."}
          />
        </div>
        <div className="h-4" />
      </div>
    </div>
  );

  // EMPLOYEES (admin only)
  if (screen === "employees") return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Çalışanlar" onBack={back} actions={
        <button className="w-9 h-9 flex items-center justify-center rounded-full bg-primary">
          <Plus className="w-4 h-4 text-white" />
        </button>
      } />
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2.5">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            value={employeeSearch}
            onChange={event => setEmployeeSearch(event.target.value)}
            placeholder="İsim, e-posta veya rol ara..."
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1"
          />
        </div>
        <p className="mt-2 text-[10px] text-muted-foreground">
          {filteredEmployees.length} / {(overview?.users || []).length} çalışan gösteriliyor
        </p>
      </div>
      <div className="flex-1 px-4 pt-2 pb-4">
        <LoadingOrError />
        {(overview?.users || []).length === 0 ? (
          <EmptyState
            icon={Users}
            title="Çalışan bulunamadı"
            desc="Henüz kayıtlı çalışan yok. Yeni çalışan ekleyin."
            action="Yenile"
            onAction={refresh}
          />
        ) : filteredEmployees.length === 0 ? (
          <EmptyState
            icon={Search}
            title="Sonuç bulunamadı"
            desc="Arama metnini değiştirerek tekrar deneyin."
          />
        ) : (
          <div className="space-y-3">
            {filteredEmployees.map(employee => (
              <Card key={employee.id} className="p-4 flex items-center gap-3">
                <Avatar name={employee.name} color={employee.role === "admin" ? "bg-teal-600" : "bg-slate-700"} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{employee.name}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {employee.email || "E-posta yok"} · {employee.role === "admin" ? "Admin" : "Kullanıcı"}
                  </p>
                </div>
                <Badge label={employeeStatusLabel(employee.status)} />
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (screen === "edit-task" && isAdmin) {
    const task = visibleTasks.find(item => item.id === selectedTaskId) || null;
    const editDeadlineIso = editDeadlineLocal && !editClearDeadline ? new Date(editDeadlineLocal).toISOString() : null;
    return (
      <div className="flex flex-col min-h-full">
        <TopBar title="Görevi Düzenle" onBack={() => navTo("task-detail")} />
        <div className="flex-1 px-4 py-4 space-y-4">
          {error && (
            <Card className="p-4 border-red-500/30 bg-red-500/10">
              <p className="text-xs text-red-200/90">{error}</p>
            </Card>
          )}
          {!task ? (
            <EmptyState icon={ClipboardList} title="Görev bulunamadı" desc="Görev silinmiş veya erişim kapsamınız dışında kalmış olabilir." />
          ) : (
            <>
              <Card className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-primary" />
                  <h3 className="text-sm font-bold text-foreground">Görev Bilgisi</h3>
                </div>
                <input
                  value={editTitle}
                  onChange={event => setEditTitle(event.target.value)}
                  placeholder="Görev başlığı"
                  className="w-full bg-muted rounded-xl px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none"
                />
                <textarea
                  value={editDescription}
                  onChange={event => setEditDescription(event.target.value)}
                  rows={4}
                  placeholder="Talimatlar ve açıklama"
                  className="w-full bg-muted rounded-xl px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={editPriority}
                    onChange={event => setEditPriority(event.target.value as typeof editPriority)}
                    className="bg-muted rounded-xl px-3 py-3 text-sm text-foreground outline-none"
                  >
                    <option value="low">Düşük</option>
                    <option value="normal">Normal</option>
                    <option value="high">Yüksek</option>
                    <option value="urgent">Acil</option>
                  </select>
                  <input
                    type="datetime-local"
                    value={editDeadlineLocal}
                    disabled={editClearDeadline}
                    onChange={event => setEditDeadlineLocal(event.target.value)}
                    className={`bg-muted rounded-xl px-3 py-3 text-sm text-foreground outline-none ${editClearDeadline ? "opacity-40" : ""}`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setEditClearDeadline(value => !value)}
                  className="flex items-center gap-2 text-xs text-muted-foreground"
                >
                  <span className={`w-4 h-4 rounded border flex items-center justify-center ${editClearDeadline ? "bg-primary border-primary" : "border-border"}`}>
                    {editClearDeadline && <CheckCircle2 className="w-3 h-3 text-white" />}
                  </span>
                  Deadline'ı kaldır
                </button>
                {editDeadlineIso && (
                  <p className="text-[11px] text-muted-foreground">
                    Teslim süresi: {formatDate(editDeadlineIso)} · {deadlineRemainingLabel(editDeadlineIso)}
                  </p>
                )}
                <p className="text-[11px] text-muted-foreground">
                  Deadline değişirse yaklaşan-teslim uyarıları yeni tarihe göre yeniden kurulur.
                </p>
              </Card>
              <button
                onClick={() => void submitTaskEdit()}
                disabled={editSaving}
                className={`w-full py-3.5 rounded-xl text-sm font-semibold text-white bg-primary active:scale-[0.99] transition-transform ${editSaving ? "opacity-60" : ""}`}
              >
                {editSaving ? "Kaydediliyor…" : "Değişiklikleri Kaydet"}
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  if (screen === "create-task" && isAdmin) return (
    <div className="flex flex-col min-h-full">
      <TopBar title={createTaskParentId ? "Alt Görev Ver" : "Görev Ver"} onBack={() => navTo("tasks")} />
      <div className="flex-1 px-4 py-4 space-y-4">
        <LoadingOrError />

        {createTaskParentId && (() => {
          const parent = visibleTasks.find(item => item.id === createTaskParentId) || null;
          return (
            <Card className="p-3 border-primary/30 bg-primary/10">
              <div className="flex items-center gap-3">
                <Link className="w-4 h-4 text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Ana görev</p>
                  <p className="text-sm font-medium text-foreground truncate">
                    {parent ? `#${parent.id} ${parent.title}` : `#${createTaskParentId}`}
                  </p>
                </div>
                <button
                  onClick={() => setCreateTaskParentId(null)}
                  className="w-7 h-7 flex items-center justify-center rounded-full bg-muted shrink-0"
                  title="Alt görev bağlantısını kaldır"
                >
                  <X className="w-3.5 h-3.5 text-foreground" />
                </button>
              </div>
            </Card>
          );
        })()}

        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-bold text-foreground">Görev Bilgisi</h3>
          </div>
          <input
            value={taskTitle}
            onChange={event => setTaskTitle(event.target.value)}
            placeholder="Görev başlığı"
            className="w-full bg-muted rounded-xl px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          <textarea
            value={taskInstructions}
            onChange={event => setTaskInstructions(event.target.value)}
            rows={4}
            placeholder="Talimatlar, beklentiler ve patron notları"
            className="w-full bg-muted rounded-xl px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none"
          />
          <div className="grid grid-cols-2 gap-2">
            <select
              value={taskPriority}
              onChange={event => setTaskPriority(event.target.value as typeof taskPriority)}
              className="bg-muted rounded-xl px-3 py-3 text-sm text-foreground outline-none"
            >
              <option value="low">Düşük</option>
              <option value="normal">Normal</option>
              <option value="high">Yüksek</option>
              <option value="urgent">Acil</option>
            </select>
            <input
              type="datetime-local"
              value={taskDeadlineLocal}
              onChange={event => setTaskDeadlineLocal(event.target.value)}
              className="bg-muted rounded-xl px-3 py-3 text-sm text-foreground outline-none"
            />
          </div>
          {taskDeadlineLocal && (
            <p className="text-[11px] text-muted-foreground">
              Teslim süresi: {formatDate(taskDeadlineIso)} · {deadlineRemainingLabel(taskDeadlineIso)}
            </p>
          )}
        </Card>

        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Çalışan Seçimi</h3>
            </div>
            <span className="text-[10px] text-muted-foreground">{taskAssigneeIds.length} kişi</span>
          </div>
          {taskAssignableUsers.length === 0 ? (
            <EmptyState icon={User} title="Çalışan yok" desc="Onaylı çalışanlar burada listelenecek." />
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {taskAssignableUsers.map(employee => {
                const selected = taskAssigneeIds.includes(employee.id);
                const leader = taskLeaderId === employee.id;
                return (
                  <div
                    key={employee.id}
                    className={`rounded-xl border p-3 transition-colors ${selected ? "border-primary/50 bg-primary/10" : "border-border bg-muted/30"}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleTaskAssignee(employee.id)}
                      className="w-full flex items-center gap-3 text-left"
                    >
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${selected ? "bg-primary text-white" : "bg-slate-700 text-white"}`}>
                        {initials(employee.name)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground truncate">{employee.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{employee.email || "E-posta yok"}</p>
                      </div>
                      <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selected ? "border-primary bg-primary" : "border-muted-foreground/40"}`}>
                        {selected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                      </div>
                    </button>
                    {selected && (
                      <button
                        type="button"
                        onClick={() => setTaskLeaderId(employee.id)}
                        className={`mt-2 w-full rounded-lg px-3 py-2 text-xs font-semibold flex items-center justify-center gap-2 ${leader ? "bg-primary text-white" : "bg-background/70 text-muted-foreground"}`}
                      >
                        <GitBranch className="w-3.5 h-3.5" />
                        {leader ? "Görev sorumlusu" : "Sorumlu yap"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {taskAssigneeIds.length > 1 && (
          <Card className="p-4 space-y-3">
            <label className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold text-foreground">Çalışma alanı oluştur</p>
                <p className="text-xs text-muted-foreground mt-1">Seçili kişilere özel mesaj ve doküman alanı açılır.</p>
              </div>
              <input
                type="checkbox"
                checked={createTaskGroup}
                onChange={event => setCreateTaskGroup(event.target.checked)}
                className="w-5 h-5 accent-teal-500"
              />
            </label>
            {createTaskGroup && (
              <input
                value={taskGroupName}
                onChange={event => setTaskGroupName(event.target.value)}
                placeholder={`${taskTitle || "Görev"} çalışma alanı`}
                className="w-full bg-muted rounded-xl px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
            )}
          </Card>
        )}

        {selectedTaskAssignees.length > 0 && (
          <Card className="p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground mb-3">Görev Ağacı</p>
            <div className="space-y-2">
              {selectedTaskLeader && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-xs font-bold text-white">
                    {initials(selectedTaskLeader.name)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{selectedTaskLeader.name}</p>
                    <p className="text-[10px] text-primary">Sorumlu</p>
                  </div>
                </div>
              )}
              {selectedTaskAssignees.filter(employee => employee.id !== selectedTaskLeader?.id).map(employee => (
                <div key={employee.id} className="ml-4 pl-4 border-l border-border flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-[10px] font-bold text-foreground">
                    {initials(employee.name)}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">{employee.name}</p>
                    <p className="text-[10px] text-muted-foreground">Görevli</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <button
          onClick={() => void submitTask()}
          disabled={taskSaving || !taskTitle.trim() || taskAssigneeIds.length === 0}
          className="w-full py-3.5 rounded-xl bg-primary text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {taskSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Görevi Yayınla
        </button>
        <div className="h-6" />
      </div>
    </div>
  );

  // TASKS
  if (screen === "tasks") {
    const statuses = ["Tümü", "Yapılacak", "Devam Ediyor", "Tamamlama Talep", "Gecikmiş", "Tamamlandı"];
    return (
      <div className="flex flex-col min-h-full">
        <TopBar title={isAdmin ? "Görevler" : "Görevlerim"} onBack={back} actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => navTo("calendar")}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-muted text-foreground"
              title="Görev takvimi"
            >
              <CalendarDays className="w-4 h-4" />
            </button>
            {isAdmin && (
              <button onClick={() => navTo("create-task")} className="w-9 h-9 flex items-center justify-center rounded-full bg-primary">
                <Plus className="w-4 h-4 text-white" />
              </button>
            )}
          </div>
        } />
        <div className="overflow-x-auto px-4 py-3" style={{ scrollbarWidth: "none" }}>
          <div className="flex gap-2" style={{ width: "max-content" }}>
            {statuses.map(s => (
              <button key={s} onClick={() => setTaskFilter(s)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${taskFilter === s ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                {s}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 px-4 pb-4">
          <LoadingOrError />
          <TaskList
            tasks={filteredTasks}
            emptyDesc={isAdmin ? "Bu filtrede görev yok. Yeni görev oluşturun." : "Bu filtrede size ait görev yok."}
          />
        </div>
      </div>
    );
  }

  // TASK CALENDAR / AGENDA
  if (screen === "calendar") {
    const agenda = buildTaskAgenda(visibleTasks);
    const timeLabel = (value: string | null) => {
      if (!value) return "—";
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) return "—";
      return new Intl.DateTimeFormat("tr-TR", { hour: "2-digit", minute: "2-digit" }).format(date);
    };
    return (
      <div className="flex flex-col min-h-full">
        <TopBar title="Görev Takvimi" onBack={() => navTo("tasks")} />
        <div className="flex-1 px-4 py-4 space-y-5">
          <LoadingOrError />
          {agenda.length === 0 && !loading && (
            <EmptyState
              icon={CalendarDays}
              title="Ajanda boş"
              desc={isAdmin ? "Açık görev yok. Yeni görev oluşturduğunuzda deadline'ına göre burada listelenir." : "Size atanmış açık görev yok."}
            />
          )}
          {agenda.map(section => (
            <div key={section.key}>
              <div className="flex items-center justify-between mb-2">
                <p className={`text-xs font-bold uppercase tracking-wide ${section.kind === "overdue" ? "text-red-400" : "text-muted-foreground"}`}>
                  {section.label}
                </p>
                <span className="text-[11px] text-muted-foreground">{section.tasks.length} görev</span>
              </div>
              <div className="space-y-2">
                {section.tasks.map(task => (
                  <Card key={task.id} className={`p-3 ${section.kind === "overdue" ? "border-red-500/30" : ""}`} onPress={() => openTask(task.id)}>
                    <div className="flex items-center gap-3">
                      <div className="w-12 shrink-0 text-center">
                        <p className={`text-sm font-semibold ${section.kind === "overdue" ? "text-red-300" : "text-foreground"}`}>
                          {section.kind === "none" ? "—" : timeLabel(task.deadline_at)}
                        </p>
                        {section.kind === "overdue" && (
                          <p className="text-[10px] text-red-400/80">{formatDate(task.deadline_at)}</p>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{task.title}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {taskAssigneeName(task, overview)}
                          {(task.priority === "urgent" || task.priority === "high") && ` · ${taskPriorityLabel(task.priority)}`}
                        </p>
                      </div>
                      <Badge label={taskStatusLabel(task.status)} />
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // TASK DETAIL
  if (screen === "task-detail") {
    const task = visibleTasks.find(item => item.id === selectedTaskId) || null;
    const assignedUsers = task ? taskAssignees(task, overview) : [];
    const responsibleAssignment = task
      ? overview?.assignments.find(item => item.task_id === task.id && item.role === "responsible" && item.assignee_user_id)
      : null;
    const leaderLine = task?.description?.match(/Sorumlu:\s*(.+)/i)?.[1]?.trim() || "";
    const leaderUser = assignedUsers.find(employee => employee.id === responsibleAssignment?.assignee_user_id)
      || assignedUsers.find(employee => employee.name === leaderLine)
      || assignedUsers[0]
      || null;
    const comments = (overview?.help_messages || [])
      .filter(item => item.task_id === selectedTaskId)
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
    const allTasks = overview?.tasks || [];
    const taskDependencies = overview?.task_dependencies || [];
    const parentTask = task?.parent_task_id
      ? allTasks.find(item => item.id === task.parent_task_id) || null
      : null;
    const subtasks = task ? subtasksOf(allTasks, task.id) : [];
    const subtaskCounts = task ? subtaskProgress(allTasks, task.id) : { done: 0, total: 0 };
    const predecessors = task ? predecessorsOf(allTasks, taskDependencies, task.id) : [];
    const openPredecessors = task ? openPredecessorsOf(allTasks, taskDependencies, task.id) : [];
    const successors = task ? successorsOf(allTasks, taskDependencies, task.id) : [];
    const pickerCandidates = task && isAdmin ? dependencyCandidates(allTasks, taskDependencies, task.id) : [];

    return (
      <div className="flex flex-col min-h-full">
        <TopBar title="Görev Detayı" onBack={() => navTo("tasks")} />
        <div className="flex-1 px-4 py-4 space-y-4">
          {!task ? (
            <EmptyState icon={ClipboardList} title="Görev bulunamadı" desc="Görev silinmiş veya erişim kapsamınız dışında kalmış olabilir." />
          ) : (
            <>
              <Card className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-base font-bold text-foreground leading-snug">{task.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">#{task.id}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isAdmin && task.status !== "done" && task.status !== "cancelled" && (
                      <button
                        onClick={() => openEditTask(task)}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-muted text-foreground active:scale-95 transition-transform"
                        title="Görevi düzenle"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <Badge label={taskStatusLabel(task.status)} />
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-4 whitespace-pre-wrap">
                  {task.description || "Bu görev için açıklama girilmemiş."}
                </p>
              </Card>

              <Card className="divide-y divide-border">
                {[
                  { label: "Atanan", value: taskAssigneeName(task, overview), icon: User },
                  { label: "Öncelik", value: taskPriorityLabel(task.priority), icon: Flag },
                  { label: "Deadline", value: formatDate(task.deadline_at), icon: CalendarDays },
                  { label: "Kalan Süre", value: deadlineRemainingLabel(task.deadline_at), icon: Clock },
                  { label: "Belge", value: `${taskDocumentCount(task, overview)} bağlı belge`, icon: Paperclip },
                  { label: "Oluşturulma", value: formatDate(task.created_at), icon: Clock },
                ].map((item, index) => {
                  const Icon = item.icon;
                  return (
                    <div key={index} className="flex items-center gap-3 px-4 py-3.5">
                      <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                        <p className="text-sm font-medium text-foreground truncate">{item.value}</p>
                      </div>
                    </div>
                  );
                })}
              </Card>

              {openPredecessors.length > 0 && (
                <Card className="p-3 border-amber-500/30 bg-amber-500/10">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <p className="text-xs text-amber-200/90">
                      Bu görev {openPredecessors.length} açık görevi bekliyor; onlar tamamlanmadan bu görev tamamlanamaz.
                    </p>
                  </div>
                </Card>
              )}

              {task.document_group_id && (
                <Card className="p-3" onPress={() => onOpenDocumentRoom(task.document_group_id!, "chat")}>
                  <div className="flex items-center gap-3">
                    <MessageSquare className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Görev odası</p>
                      <p className="text-sm font-medium text-foreground">Çalışma alanını aç</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </div>
                </Card>
              )}

              {parentTask && (
                <Card className="p-3" onPress={() => openTask(parentTask.id)}>
                  <div className="flex items-center gap-3">
                    <Link className="w-4 h-4 text-primary shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Ana görev</p>
                      <p className="text-sm font-medium text-foreground truncate">#{parentTask.id} {parentTask.title}</p>
                    </div>
                    <Badge label={taskStatusLabel(parentTask.status)} />
                  </div>
                </Card>
              )}

              {(subtasks.length > 0 || (isAdmin && !task.parent_task_id && task.status !== "done" && task.status !== "cancelled")) && (
                <Card className="p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-primary" />
                      <h3 className="text-sm font-bold text-foreground">Alt Görevler</h3>
                    </div>
                    {subtaskCounts.total > 0 && (
                      <span className="text-[10px] text-muted-foreground">{subtaskCounts.done}/{subtaskCounts.total} tamamlandı</span>
                    )}
                  </div>
                  {subtasks.length === 0 ? (
                    <p className="text-xs text-muted-foreground mb-3">Bu görevin alt görevi yok.</p>
                  ) : (
                    <div className="space-y-2 mb-3">
                      {subtasks.map(subtask => (
                        <button
                          key={subtask.id}
                          onClick={() => openTask(subtask.id)}
                          className="w-full flex items-center gap-3 rounded-xl bg-muted/40 px-3 py-2.5 text-left"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-foreground truncate">{subtask.title}</p>
                            <p className="text-[10px] text-muted-foreground">{formatDate(subtask.deadline_at)}</p>
                          </div>
                          <Badge label={taskStatusLabel(subtask.status)} />
                        </button>
                      ))}
                    </div>
                  )}
                  {isAdmin && !task.parent_task_id && task.status !== "done" && task.status !== "cancelled" && (
                    <button
                      onClick={() => startSubtaskCreation(task)}
                      className="w-full py-2.5 rounded-xl bg-muted text-xs font-semibold text-foreground flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" /> Alt görev ekle
                    </button>
                  )}
                </Card>
              )}

              {(predecessors.length > 0 || successors.length > 0 || (isAdmin && task.status !== "done" && task.status !== "cancelled")) && (
                <Card className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <GitBranch className="w-4 h-4 text-primary" />
                    <h3 className="text-sm font-bold text-foreground">Bağımlılıklar</h3>
                  </div>
                  {predecessors.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Beklenen görevler</p>
                      <div className="space-y-2">
                        {predecessors.map(predecessor => (
                          <div key={predecessor.id} className="flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2.5">
                            <button onClick={() => openTask(predecessor.id)} className="min-w-0 flex-1 text-left">
                              <p className="text-sm font-medium text-foreground truncate">#{predecessor.id} {predecessor.title}</p>
                            </button>
                            <Badge label={taskStatusLabel(predecessor.status)} />
                            {isAdmin && (
                              <button
                                onClick={() => void submitDependencyRemove(predecessor.id)}
                                disabled={dependencyBusy}
                                className="w-7 h-7 flex items-center justify-center rounded-full bg-red-500/10 text-red-300 shrink-0 disabled:opacity-50"
                                title="Bağımlılığı kaldır"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {successors.length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1.5">Bu görevi bekleyenler</p>
                      <div className="space-y-2">
                        {successors.map(successor => (
                          <button
                            key={successor.id}
                            onClick={() => openTask(successor.id)}
                            className="w-full flex items-center gap-2 rounded-xl bg-muted/40 px-3 py-2.5 text-left"
                          >
                            <p className="min-w-0 flex-1 text-sm font-medium text-foreground truncate">#{successor.id} {successor.title}</p>
                            <Badge label={taskStatusLabel(successor.status)} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {isAdmin && task.status !== "done" && task.status !== "cancelled" && (
                    pickerCandidates.length === 0 && predecessors.length === 0 && successors.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Bağımlılık eklenebilecek başka açık görev yok.</p>
                    ) : pickerCandidates.length > 0 && (
                      <div className="flex items-center gap-2">
                        <select
                          value={dependencyPickerId}
                          onChange={event => setDependencyPickerId(event.target.value)}
                          className="min-w-0 flex-1 bg-muted rounded-xl px-3 py-2.5 text-xs text-foreground outline-none"
                        >
                          <option value="">Beklenecek görevi seç…</option>
                          {pickerCandidates.map(candidate => (
                            <option key={candidate.id} value={candidate.id}>#{candidate.id} {candidate.title}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => void submitDependencyAdd()}
                          disabled={!dependencyPickerId || dependencyBusy}
                          className="px-3 py-2.5 rounded-xl bg-primary text-white text-xs font-semibold disabled:opacity-50 shrink-0"
                        >
                          Ekle
                        </button>
                      </div>
                    )
                  )}
                </Card>
              )}

              {assignedUsers.length > 0 && (
                <Card className="p-4">
                  <div className="flex items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <GitBranch className="w-4 h-4 text-primary" />
                      <h3 className="text-sm font-bold text-foreground">Görev Ağı</h3>
                    </div>
                    <span className="text-[10px] text-muted-foreground">{assignedUsers.length} kişi</span>
                  </div>
                  <div className="space-y-2">
                    {leaderUser && (
                      <div className="flex items-center gap-3 rounded-xl bg-primary/10 border border-primary/20 px-3 py-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-bold">
                          {initials(leaderUser.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-foreground truncate">{leaderUser.name}</p>
                          <p className="text-[10px] text-primary">Görev sorumlusu</p>
                        </div>
                      </div>
                    )}
                    {assignedUsers.filter(employee => employee.id !== leaderUser?.id).map(employee => (
                      <div key={employee.id} className="ml-4 pl-4 border-l border-border flex items-center gap-3 rounded-r-xl bg-muted/30 px-3 py-2.5">
                        <div className="w-7 h-7 rounded-full bg-slate-700 text-white flex items-center justify-center text-[10px] font-bold">
                          {initials(employee.name)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-foreground truncate">{employee.name}</p>
                          <p className="text-[10px] text-muted-foreground">Görevli</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              )}

              <div>
                <SectionHeader title="Mesajlar" />
                {comments.length === 0 ? (
                  <EmptyState icon={MessageSquare} title="Mesaj yok" desc="Bu görevde henüz yardım mesajı veya yönetici notu bulunmuyor." />
                ) : (
                  <div className="space-y-2">
                    {comments.map(comment => (
                      <Card key={comment.id} className="p-3">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold text-foreground">
                            {comment.author_user_id === null ? "Admin" : overview?.users.find(item => item.id === comment.author_user_id)?.name || "Çalışan"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">{formatDate(comment.created_at)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">{comment.body}</p>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // APPROVALS (admin only)
  if (screen === "approvals") return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Tamamlama Onayları" onBack={back} />
      <div className="flex-1 px-4 py-4 space-y-3">
        <LoadingOrError />
        <TaskList
          tasks={pendingTasks}
          emptyDesc="Çalışanlar tamamlama talebinde bulunduğunda burada görünecek."
        />
      </div>
    </div>
  );

  // ACCOUNT REQUESTS (admin only)
  if (screen === "account-requests") return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Hesap Talepleri" onBack={back} actions={
        <button
          onClick={() => void refresh()}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-muted"
        >
          <RefreshCw className="w-4 h-4 text-primary" />
        </button>
      } />
      <div className="flex-1 px-4 py-4 space-y-3">
        <LoadingOrError />
        {accountRequests.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title="Bekleyen talep yok"
            desc="Yeni hesap talepleri burada görünecek."
          />
        ) : (
          accountRequests.map(request => (
            <Card key={request.id} className="p-4">
              <div className="flex items-start gap-3">
                <Avatar name={request.name} color="bg-teal-600" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{request.name}</p>
                      <p className="text-xs text-muted-foreground truncate mt-0.5">{request.email}</p>
                    </div>
                    <Badge label="Bekliyor" />
                  </div>
                  {request.phone && (
                    <p className="text-xs text-muted-foreground mt-2">Telefon: {request.phone}</p>
                  )}
                  <p className="text-[10px] text-muted-foreground mt-2">
                    Talep tarihi: {formatDate(request.created_at)}
                  </p>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button
                      disabled={loading}
                      onClick={() => void rejectAccountRequest(request.id)}
                      className="py-2.5 rounded-xl bg-red-500/10 text-red-300 text-xs font-semibold border border-red-500/20 disabled:opacity-60"
                    >
                      Reddet
                    </button>
                    <button
                      disabled={loading}
                      onClick={() => void approveAccountRequest(request.id)}
                      className="py-2.5 rounded-xl bg-primary text-white text-xs font-semibold disabled:opacity-60"
                    >
                      Onayla
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );

  // NOTIFICATIONS
  const notifications = overview?.notifications || [];
  if (screen === "notifications") return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Bildirimler" onBack={back} actions={
        notifications.some(item => !item.read_at) ? (
          <button
            onClick={() => void markAllNotificationsRead()}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-muted"
          >
            <CheckCircle2 className="w-4 h-4 text-primary" />
          </button>
        ) : undefined
      } />
      <div className="flex-1 px-4 py-4 space-y-5">
        <LoadingOrError />

        <div>
          <SectionHeader title="Tercihler" />
          <Card className="divide-y divide-border">
            {[
              { key: "task_assigned_enabled" as NotificationPreferenceToggleKey, label: "Görev atama", desc: "Yeni görev atandığında bildir" },
              { key: "completion_updates_enabled" as NotificationPreferenceToggleKey, label: "Tamamlama akışı", desc: "Onay ve ret durumlarını bildir" },
              { key: "deadline_alerts_enabled" as NotificationPreferenceToggleKey, label: "Deadline uyarıları", desc: "Yaklaşan ve geciken işleri bildir" },
              { key: "email_enabled" as NotificationPreferenceToggleKey, label: "E-posta yedeği", desc: "Kritik bildirimleri e-postaya da gönder" },
            ].map(item => {
              const enabled = Boolean(notificationPrefs?.[item.key]);
              return (
                <div key={item.key} className="flex items-center justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground">{item.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                  <button
                    disabled={!notificationPrefs || prefSaving}
                    onClick={() => void toggleNotificationPreference(item.key)}
                    className={`w-11 h-6 rounded-full transition-colors relative shrink-0 ${enabled ? "bg-primary" : "bg-muted"} ${prefSaving ? "opacity-60" : ""}`}
                  >
                    <div
                      className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${enabled ? "translate-x-5" : "translate-x-0.5"}`}
                      style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }}
                    />
                  </button>
                </div>
              );
            })}
          </Card>
        </div>

        <div>
          <SectionHeader title="Son Bildirimler" />
          {notifications.length === 0 ? (
            <EmptyState
              icon={Bell}
              title="Bildirim yok"
              desc="Yeni bildirimler burada görünecek."
            />
          ) : (
            <div className="space-y-3">
              {notifications.map(notification => {
                const urgency = notificationUrgency(notification.priority);
                const unread = !notification.read_at;
                const cardTone = unread
                  ? urgency === "critical"
                    ? "border-red-500/50 bg-red-500/10"
                    : urgency === "high"
                      ? "border-amber-500/50 bg-amber-500/10"
                      : "border-primary/40 bg-primary/5"
                  : "";
                const iconTone = unread
                  ? urgency === "critical"
                    ? "bg-red-500/15"
                    : urgency === "high"
                      ? "bg-amber-500/15"
                      : "bg-primary/15"
                  : "bg-muted";
                const iconColor = unread
                  ? urgency === "critical"
                    ? "text-red-500"
                    : urgency === "high"
                      ? "text-amber-500"
                      : "text-primary"
                  : "text-muted-foreground";
                const dotTone = urgency === "critical"
                  ? "bg-red-500 animate-pulse"
                  : urgency === "high"
                    ? "bg-amber-500"
                    : "bg-primary";
                const NotificationIcon = urgency === "critical" ? AlertTriangle : Bell;
                return (
                <Card
                  key={notification.id}
                  className={`p-4 ${cardTone}`}
                  onPress={() => void openNotification(notification)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${iconTone}`}>
                      <NotificationIcon className={`w-4 h-4 ${iconColor}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground leading-snug">
                          {urgency === "critical" && (
                            <span className="mr-1 rounded bg-red-500/15 px-1 py-px text-[9px] font-bold uppercase text-red-500 align-middle">Kritik</span>
                          )}
                          {notification.title}
                        </p>
                        {unread && <span className={`mt-1 w-2 h-2 rounded-full shrink-0 ${dotTone}`} />}
                      </div>
                      {notification.body && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{notification.body}</p>
                      )}
                      <div className="flex items-center justify-between gap-2 mt-2">
                        <span className="text-[10px] text-muted-foreground">{formatDate(notification.created_at)}</span>
                        {notification.task_id && (
                          <button
                            onClick={(event) => {
                              event.stopPropagation();
                              openTask(notification.task_id!);
                            }}
                            className="text-[10px] text-primary font-semibold"
                          >
                            Göreve git
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return null;
}

function KnowledgeGraph({
  user,
  onBack,
  graphData,
  onOpenNode,
}: {
  user: AuthUser;
  onBack: () => void;
  graphData: KnowledgeGraphData;
  onOpenNode: (node: KnowledgeGraphNode) => void;
}) {
  const graphNodes = graphData.nodes;
  const graphEdges = graphData.edges;
  const [selectedNode, setSelectedNode] = useState<KnowledgeGraphNode | null>(null);
  const [activeCat, setActiveCat] = useState("all");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const touchRef = useRef({
    startX: 0,
    startY: 0,
    moved: 0,
    panStart: { x: 0, y: 0 },
    pinchStartDistance: 0,
    zoomStart: 1,
  });
  const wasDragging = useRef(false);
  const nodeMap = useMemo(() => new Map(graphNodes.map(node => [node.id, node])), [graphNodes]);
  const filteredSearch = useMemo(() => {
    const normalized = query.toLocaleLowerCase("tr-TR").trim();
    return normalized
      ? graphNodes.filter(node => `${node.label} ${node.shortLabel} ${node.dept} ${node.owner}`.toLocaleLowerCase("tr-TR").includes(normalized))
      : graphNodes.slice(0, 12);
  }, [graphNodes, query]);
  const groups = useMemo(() => ([
    { title: "Canlı Doküman Ağı", cats: ["tender", "rooms", "documents", "notes"] },
    { title: "ERP Kategorileri", cats: ["finance", "hr", "inventory", "sales", "reports", "contracts", "approvals"] },
  ]), []);

  const clampZoom = (value: number) => Math.max(0.65, Math.min(2.25, Number(value.toFixed(2))));
  const zoomBy = (delta: number) => setZoom(value => clampZoom(value + delta));
  const touchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const handleTouchStart = (event: React.TouchEvent) => {
    if (event.touches.length > 1) {
      touchRef.current = {
        ...touchRef.current,
        pinchStartDistance: touchDistance(event.touches),
        zoomStart: zoom,
        moved: 0,
      };
      wasDragging.current = true;
      return;
    }
    const touch = event.touches[0];
    touchRef.current = { startX: touch.clientX, startY: touch.clientY, moved: 0, panStart: { ...pan }, pinchStartDistance: 0, zoomStart: zoom };
    wasDragging.current = false;
  };
  const handleTouchMove = (event: React.TouchEvent) => {
    if (event.touches.length > 1 && touchRef.current.pinchStartDistance > 0) {
      event.preventDefault();
      const nextDistance = touchDistance(event.touches);
      setZoom(clampZoom(touchRef.current.zoomStart * (nextDistance / touchRef.current.pinchStartDistance)));
      return;
    }
    const touch = event.touches[0];
    const dx = touch.clientX - touchRef.current.startX;
    const dy = touch.clientY - touchRef.current.startY;
    touchRef.current.moved += Math.sqrt(dx * dx + dy * dy);
    if (touchRef.current.moved > 4) {
      wasDragging.current = true;
      setPan({ x: touchRef.current.panStart.x + dx, y: touchRef.current.panStart.y + dy });
    }
  };
  const selectNode = (node: KnowledgeGraphNode) => {
    if (!wasDragging.current) {
      setSelectedNode(node);
      setDrawerOpen(false);
      setSearchOpen(false);
    }
  };
  const edgeStyle = (strength: KnowledgeGraphEdge["str"]) =>
    strength === "strong" ? { opacity: 0.5, width: 1.2 } : strength === "med" ? { opacity: 0.28, width: 0.8 } : { opacity: 0.12, width: 0.5 };

  return (
    <div className="relative flex flex-col h-full min-h-0 overflow-hidden" style={{ background: "#0A0A12" }}>
      <style>{`@keyframes graphPulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 0.15; } }`}</style>
      <TopBar
        title={graphData.dynamic ? "Canlı Bilgi Grafiği" : "Knowledge Graph"}
        onBack={onBack}
        actions={
          <div className="flex items-center gap-2">
            <button onClick={() => setSearchOpen(true)} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
              <Command className="w-4 h-4 text-foreground" />
            </button>
            <button onClick={() => setDrawerOpen(true)} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
              <Menu className="w-4 h-4 text-foreground" />
            </button>
          </div>
        }
      />

      <div className="shrink-0 flex gap-2 overflow-x-auto px-4 py-3 border-b border-border">
        {["all", ...Object.keys(KG_CAT_COLORS)].map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCat(cat)}
            className={`px-3 py-1.5 rounded-full border text-xs font-semibold whitespace-nowrap ${
              activeCat === cat ? "text-white" : "text-muted-foreground border-border bg-muted/50"
            }`}
            style={activeCat === cat ? { background: cat === "all" ? "#14B8A6" : `${KG_CAT_COLORS[cat]}55`, borderColor: cat === "all" ? "#14B8A6" : KG_CAT_COLORS[cat] } : undefined}
          >
            {cat === "all" ? "Tümü" : KG_CAT_LABELS[cat]}
          </button>
        ))}
      </div>

      <div className="relative flex-1 min-h-0 overflow-hidden">
        <div
          className="absolute inset-0"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onWheel={event => {
            event.preventDefault();
            zoomBy(event.deltaY > 0 ? -0.12 : 0.12);
          }}
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            transformOrigin: "center center",
            transition: wasDragging.current ? "none" : "transform 140ms ease-out",
          }}
        >
          <svg viewBox="0 0 360 280" width="100%" height="100%" className="w-full h-full">
            <defs>
              <pattern id="kgGrid" width="20" height="20" patternUnits="userSpaceOnUse">
                <circle cx="0" cy="0" r="0.6" fill="rgba(255,255,255,0.06)" />
              </pattern>
            </defs>
            <rect width="360" height="280" fill="#0A0A12" onClick={() => setSelectedNode(null)} />
            <rect width="360" height="280" fill="url(#kgGrid)" style={{ pointerEvents: "none" }} />
            {graphEdges.map(edge => {
              const source = nodeMap.get(edge.s);
              const target = nodeMap.get(edge.t);
              if (!source || !target) return null;
              const style = edgeStyle(edge.str);
              const dimmed = activeCat !== "all" && source.cat !== activeCat && target.cat !== activeCat;
              return (
                <line
                  key={`${edge.s}-${edge.t}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={KG_CAT_COLORS[source.cat]}
                  strokeWidth={style.width}
                  opacity={dimmed ? 0.04 : style.opacity}
                />
              );
            })}
            {graphNodes.map(node => {
              const color = KG_CAT_COLORS[node.cat];
              const isSelected = selectedNode?.id === node.id;
              const dimmed = activeCat !== "all" && node.cat !== activeCat;
              return (
                <g key={node.id} onClick={() => selectNode(node)} style={{ opacity: dimmed ? 0.2 : 1, cursor: "pointer" }}>
                  <circle cx={node.x} cy={node.y} r={node.r + 7} fill={color} opacity={isSelected ? undefined : 0.06}
                    style={isSelected ? { animation: "graphPulse 2s ease-in-out infinite" } : undefined} />
                  <circle cx={node.x} cy={node.y} r={node.r + 3} fill={color} opacity={0.12} />
                  <circle cx={node.x} cy={node.y} r={node.r} fill={`${color}22`} stroke={color} strokeWidth={isSelected ? 2 : 1} strokeOpacity={isSelected ? 1 : 0.7} />
                  {isSelected && <circle cx={node.x} cy={node.y} r={node.r + 5} fill="none" stroke={color} strokeWidth={1.5} strokeOpacity={0.5} />}
                  {(node.r >= 9 || isSelected) && (
                    <text x={node.x} y={node.y + node.r + 8} textAnchor="middle" fill={color} fontSize={6} fontFamily="JetBrains Mono, monospace">
                      {node.shortLabel}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <div className="absolute right-4 bottom-28 z-10 flex flex-col gap-2">
          <button onClick={() => zoomBy(0.18)} className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center">
            <ZoomIn className="w-4 h-4 text-foreground" />
          </button>
          <div className="w-10 rounded-full bg-card border border-border py-1 text-center text-[10px] font-mono text-muted-foreground">
            {Math.round(zoom * 100)}%
          </div>
          <button onClick={() => zoomBy(-0.18)} className="w-10 h-10 rounded-full bg-card border border-border flex items-center justify-center">
            <ZoomOut className="w-4 h-4 text-foreground" />
          </button>
          <button onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1); }} className="w-10 h-10 rounded-full bg-primary flex items-center justify-center">
            <LocateFixed className="w-4 h-4 text-white" />
          </button>
        </div>
      </div>

      <div className={`absolute inset-y-0 left-0 z-30 w-[260px] border-r border-border bg-[#13131f] transition-transform ${drawerOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="h-14 px-4 flex items-center justify-between border-b border-border">
          <p className="text-sm font-bold text-foreground">Vault Gezgini</p>
          <button onClick={() => setDrawerOpen(false)} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
            <X className="w-4 h-4 text-foreground" />
          </button>
        </div>
        <div className="p-4 space-y-4 overflow-y-auto h-[calc(100%-56px)]">
          <button onClick={() => setSearchOpen(true)} className="w-full flex items-center gap-2 bg-muted rounded-xl px-3 py-2.5 text-left">
            <Search className="w-4 h-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Belge ara...</span>
          </button>
          {groups.map(group => (
            <div key={group.title}>
              <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground mb-2">{group.title}</p>
              <div className="space-y-1">
                {graphNodes.filter(node => group.cats.includes(node.cat)).slice(0, 10).map(node => (
                  <button key={`${group.title}-${node.id}`} onClick={() => selectNode(node)} className="w-full flex items-center gap-2 rounded-lg px-2 py-2 active:bg-muted text-left">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: KG_CAT_COLORS[node.cat] }} />
                    <span className="text-xs text-foreground truncate">{node.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      {drawerOpen && <button className="absolute inset-0 z-20 bg-black/50" onClick={() => setDrawerOpen(false)} aria-label="Menüyü kapat" />}

      {searchOpen && (
        <div className="absolute inset-0 z-40 bg-black/80 p-4">
          <div className="flex items-center gap-2 bg-[#13131f] border border-border rounded-2xl px-3 py-3">
            <Search className="w-4 h-4 text-muted-foreground" />
            <input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Graph içinde ara..."
              className="flex-1 bg-transparent outline-none text-sm text-foreground placeholder:text-muted-foreground" />
            <button onClick={() => setSearchOpen(false)} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <X className="w-4 h-4 text-foreground" />
            </button>
          </div>
          <div className="mt-4 space-y-2 max-h-[70dvh] overflow-y-auto">
            {filteredSearch.map(node => (
              <button key={node.id} onClick={() => selectNode(node)} className="w-full flex items-center gap-3 rounded-xl bg-[#13131f] border border-border p-3 text-left">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center text-[10px] font-mono font-bold" style={{ color: KG_CAT_COLORS[node.cat], background: `${KG_CAT_COLORS[node.cat]}18` }}>
                  {node.shortLabel.slice(0, 3)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-foreground truncate">{node.label}</span>
                  <span className="block text-xs text-muted-foreground truncate">{KG_CAT_LABELS[node.cat]} · {node.status}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className={`absolute left-0 right-0 bottom-0 z-30 rounded-t-2xl border-t border-border bg-[#13131f] p-4 transition-transform ${selectedNode ? "translate-y-0" : "translate-y-full"}`}>
        {selectedNode && (
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <Badge label={selectedNode.status} />
                <h2 className="text-base font-bold text-foreground mt-2 truncate">{selectedNode.label}</h2>
                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{selectedNode.desc}</p>
              </div>
              <button onClick={() => setSelectedNode(null)} className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                <X className="w-4 h-4 text-foreground" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {[
                ["Kategori", KG_CAT_LABELS[selectedNode.cat]],
                ["Sahip", selectedNode.owner],
                ["Departman", selectedNode.dept],
                ["Versiyon", selectedNode.version],
                ["Tarih", selectedNode.date],
                ["Erişim", user.role === "admin" ? "Admin" : "Üye"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl bg-muted px-3 py-2">
                  <p className="text-muted-foreground">{label}</p>
                  <p className="text-foreground font-semibold truncate">{value}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-5 gap-2">
              {[
                { icon: Eye, label: "Aç", onClick: () => onOpenNode(selectedNode), disabled: !selectedNode.entity },
                { icon: MessageSquare, label: "Yorum", disabled: true },
                { icon: CheckCircle2, label: "Onay", disabled: user.role !== "admin" || selectedNode.status !== "İncelemede" },
                { icon: Download, label: "İndir", disabled: true },
                { icon: Share2, label: "Paylaş", disabled: true },
              ].map(action => {
                const Icon = action.icon;
                return (
                  <button key={action.label} type="button" onClick={action.onClick} disabled={action.disabled}
                    className="py-2 rounded-xl bg-muted flex flex-col items-center gap-1 disabled:opacity-35">
                    <Icon className="w-4 h-4 text-primary" />
                    <span className="text-[9px] text-muted-foreground">{action.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TENDER TAB ───────────────────────────────────────────────────────────────
function TenderTab({ user }: { user: AuthUser }) {
  const [screen, setScreen] = useState<TenderScreen>("dashboard");
  const [showGraph, setShowGraph] = useState(false);
  const [obsidianNote, setObsidianNote] = useState("BEDAS-2026-20260601-001");
  const [documents, setDocuments] = useState<TenderDocument[]>([]);
  const [tenders, setTenders] = useState<Tender[]>([]);
  const [vaultNotes, setVaultNotes] = useState<VaultNote[]>([]);
  const [folderTree, setFolderTree] = useState<FolderTree | null>(null);
  const [documentGroups, setDocumentGroups] = useState<DocumentGroupSummary[]>([]);
  const [selectedDocumentId, setSelectedDocumentId] = useState<number | null>(null);
  const [documentQuery, setDocumentQuery] = useState("");
  const [vaultQuery, setVaultQuery] = useState("");
  const [tenderPreviewFile, setTenderPreviewFile] = useState<{ url: string; name: string; type: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const navTo = (s: TenderScreen) => setScreen(s);
  const back = () => navTo("dashboard");
  const selectedDocument = documents.find(item => item.id === selectedDocumentId) || null;
  const todayDocumentCount = documents.filter(item => {
    const date = new Date(item.timestamp);
    const now = new Date();
    return date.getFullYear() === now.getFullYear()
      && date.getMonth() === now.getMonth()
      && date.getDate() === now.getDate();
  }).length;
  const filteredDocuments = documentQuery.trim()
    ? documents.filter(item => {
      const haystack = [
        item.original_filename,
        item.organization,
        item.tender_id,
        item.internal_unit,
        item.document_type,
      ].filter(Boolean).join(" ").toLocaleLowerCase("tr-TR");
      return haystack.includes(documentQuery.toLocaleLowerCase("tr-TR"));
    })
    : documents;
  const filteredVaultNotes = vaultQuery.trim()
    ? vaultNotes.filter(note =>
      [note.name, note.path, ...note.tags]
        .join(" ")
        .toLocaleLowerCase("tr-TR")
        .includes(vaultQuery.toLocaleLowerCase("tr-TR")))
    : vaultNotes;
  const graphData = useMemo(() => buildKnowledgeGraphData({
    documents,
    tenders,
    vaultNotes,
    documentGroups,
  }), [documentGroups, documents, tenders, vaultNotes]);

  useEffect(() => () => {
    if (tenderPreviewFile?.url.startsWith("blob:")) URL.revokeObjectURL(tenderPreviewFile.url);
  }, [tenderPreviewFile]);

  const tenderDocumentName = (document: TenderDocument) =>
    document.original_filename || document.stored_filename || `Belge-${document.id}`;

  const previewTenderDocument = async (document: TenderDocument) => {
    setError("");
    try {
      const blob = await getTenderDocumentBlob(document.id, false);
      const url = URL.createObjectURL(blob);
      if (tenderPreviewFile?.url.startsWith("blob:")) URL.revokeObjectURL(tenderPreviewFile.url);
      setTenderPreviewFile({
        url,
        name: tenderDocumentName(document),
        type: blob.type || document.mime_type || "application/octet-stream",
      });
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Belge görüntülenemedi.");
    }
  };

  const downloadTenderDocument = async (document: TenderDocument) => {
    setError("");
    try {
      const blob = await getTenderDocumentBlob(document.id, true);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = tenderDocumentName(document);
      link.click();
      URL.revokeObjectURL(url);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Belge indirilemedi.");
    }
  };
  const openGraphNode = (node: KnowledgeGraphNode) => {
    if (node.entity?.kind === "document") {
      setSelectedDocumentId(node.entity.id);
      setShowGraph(false);
      navTo("document-detail");
      return;
    }
    if (node.entity?.kind === "note") {
      setObsidianNote(node.entity.name);
      setShowGraph(false);
      navTo("obsidian");
      return;
    }
    if (node.entity?.kind === "room") {
      setShowGraph(false);
      navTo("document-groups");
    }
  };

  const refreshTender = async () => {
    setLoading(true);
    setError("");
    try {
      const [documentPage, tenderPage, notes, tree, rooms] = await Promise.all([
        getTenderDocumentsPage(0, 25),
        getTendersPage(0, 25),
        getVaultNotes().catch(() => ({ vault_root: "", notes: [] })),
        getFolderTree().catch(() => null),
        getDocumentGroups().catch(() => []),
      ]);
      setDocuments(documentPage.items);
      setTenders(tenderPage.items);
      setVaultNotes(notes.notes);
      setFolderTree(tree);
      setDocumentGroups(rooms);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Doküman ağı verisi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user.role === "admin") void refreshTender();
  }, [user.role]);

  const TenderLoadingOrError = () => (
    <>
      {loading && documents.length === 0 && tenders.length === 0 && <DashboardSkeleton />}
      {error && (
        <Card className="p-4 border-red-500/30 bg-red-500/10">
          <p className="text-sm font-semibold text-red-300">Doküman ağı bağlantısı kurulamadı</p>
          <p className="text-xs text-red-200/80 mt-1">{error}</p>
          <button onClick={refreshTender} className="mt-3 px-3 py-2 rounded-lg bg-red-500/20 text-xs font-semibold text-red-100">
            Yeniden Dene
          </button>
        </Card>
      )}
    </>
  );

  const DocumentCard = ({ document }: { document: TenderDocument }) => (
    <Card
      className="p-4"
      onPress={() => {
        setSelectedDocumentId(document.id);
        navTo("document-detail");
      }}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-teal-500/15 flex items-center justify-center shrink-0">
          <FileText className="w-5 h-5 text-teal-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
              {document.original_filename || document.stored_filename || document.tender_id}
            </p>
            <Badge label={tenderStatusLabel(document.status)} />
          </div>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {document.organization || "Kurum yok"} · {document.internal_unit || "Birim yok"}
          </p>
          <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5 min-w-0">
              <Tag className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{document.document_type || "Belge"}</span>
            </span>
            <span className="flex items-center gap-1.5 justify-end">
              <Clock className="w-3.5 h-3.5 shrink-0" />
              <span>{formatDate(document.timestamp)}</span>
            </span>
            <span className="flex items-center gap-1.5 min-w-0">
              <GitBranch className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{document.tender_id}</span>
            </span>
            <span className="flex items-center gap-1.5 justify-end">
              <Paperclip className="w-3.5 h-3.5 shrink-0" />
              <span>{formatFileSize(document.file_size)}</span>
            </span>
          </div>
        </div>
      </div>
    </Card>
  );

  const TreeNodeList = ({ nodes, depth = 0 }: { nodes: TreeNode[]; depth?: number }) => (
    <div className={depth === 0 ? "space-y-2" : "mt-2 space-y-2"}>
      {nodes.slice(0, depth === 0 ? 12 : 6).map(node => (
        <div key={`${node.path}-${node.name}`} style={{ marginLeft: depth * 12 }}>
          <Card className="p-3">
            <div className="flex items-center gap-2.5">
              {node.type === "folder"
                ? <FolderOpen className="w-4 h-4 text-amber-400 shrink-0" />
                : <FileText className="w-4 h-4 text-teal-400 shrink-0" />}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-foreground truncate">{node.name}</p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {node.type === "folder" ? `${node.children.length} öğe` : formatFileSize(node.size || null)}
                </p>
              </div>
            </div>
            {node.type === "folder" && node.children.length > 0 && depth < 1 && (
              <TreeNodeList nodes={node.children} depth={depth + 1} />
            )}
          </Card>
        </div>
      ))}
    </div>
  );

  if (showGraph) {
    return (
      <KnowledgeGraph
        user={user}
        onBack={() => setShowGraph(false)}
        graphData={graphData}
        onOpenNode={openGraphNode}
      />
    );
  }

  if (screen === "dashboard") return (
    <div className="flex flex-col min-h-full">
      <TopBar title={
        <div>
          <p className="text-[10px] text-muted-foreground">Modül</p>
          <h1 className="text-base font-bold text-foreground leading-tight">Doküman Ağı</h1>
        </div>
      } />
      <div className="flex-1 px-4 py-5 space-y-5">
        <TenderLoadingOrError />
        {!error && !loading && (<>
        <KPIRow items={[
          { label: "Şirket Kaydı",  value: tenders.length, color: "text-foreground" },
          { label: "Toplam Belge",  value: documents.length, color: "text-teal-400" },
          { label: "Bugün Alınan",  value: todayDocumentCount, color: "text-blue-400" },
        ]} />
        <KPIRow items={[
          { label: "Sınıflanmamış", value: documents.filter(item => item.status === "unclassified").length, color: "text-amber-400" },
          { label: "Çalışma Alanı",value: documentGroups.length, color: "text-violet-400" },
          { label: "Bilgi Notu", value: vaultNotes.length, color: "text-emerald-400" },
        ]} />
        </>)}

        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "Belgeler",  icon: FileText,   screen: "documents"       as TenderScreen },
            { label: "Alanlar",   icon: Users,       screen: "document-groups" as TenderScreen },
            { label: "Klasörler", icon: FolderOpen,  screen: "folder-tree"     as TenderScreen },
            { label: "Bilgi Ağı", icon: BookOpen,    screen: "obsidian"        as TenderScreen },
          ].map((item, i) => {
            const Icon = item.icon;
            return (
              <button key={i} onClick={() => navTo(item.screen)}
                className="flex flex-col items-center gap-1.5 bg-card border border-border rounded-xl py-3 active:scale-95 transition-transform">
                <Icon className="w-5 h-5 text-primary" />
                <span className="text-[10px] font-medium text-muted-foreground text-center leading-tight">{item.label}</span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setShowGraph(true)}
          className="w-full overflow-hidden rounded-2xl border border-teal-500/25 bg-card active:scale-[0.99] transition-transform"
        >
          <div className="relative min-h-32 bg-[#0A0A12]">
            <svg viewBox="0 0 360 120" className="absolute inset-0 w-full h-full opacity-55">
              <defs>
                <pattern id="kgMiniGrid" width="18" height="18" patternUnits="userSpaceOnUse">
                  <circle cx="0" cy="0" r="0.7" fill="rgba(255,255,255,0.07)" />
                </pattern>
                <linearGradient id="kgFade" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stopColor="#0A0A12" stopOpacity="0.92" />
                  <stop offset="0.52" stopColor="#0A0A12" stopOpacity="0.72" />
                  <stop offset="1" stopColor="#0A0A12" stopOpacity="0.18" />
                </linearGradient>
              </defs>
              <rect width="360" height="120" fill="url(#kgMiniGrid)" />
              {graphData.edges.slice(0, 12).map(edge => {
                const source = graphData.nodes.find(node => node.id === edge.s);
                const target = graphData.nodes.find(node => node.id === edge.t);
                if (!source || !target) return null;
                return (
                  <line
                    key={`mini-${edge.s}-${edge.t}`}
                    x1={source.x}
                    y1={Math.max(16, source.y * 0.42)}
                    x2={target.x}
                    y2={Math.max(16, target.y * 0.42)}
                    stroke={KG_CAT_COLORS[source.cat]}
                    strokeWidth={1}
                    opacity={0.22}
                  />
                );
              })}
              {graphData.nodes.slice(0, 18).map(node => (
                <circle
                  key={`mini-${node.id}`}
                  cx={node.x}
                  cy={Math.max(16, node.y * 0.42)}
                  r={Math.max(3.5, node.r * 0.5)}
                  fill={`${KG_CAT_COLORS[node.cat]}33`}
                  stroke={KG_CAT_COLORS[node.cat]}
                  strokeWidth={1}
                />
              ))}
              <rect width="360" height="120" fill="url(#kgFade)" />
            </svg>
            <div className="relative z-10 flex min-h-32 items-center p-4">
              <div className="text-left max-w-[76%] space-y-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/40 bg-teal-400/15 px-3 py-1.5 shadow-sm shadow-teal-950/20">
                  <GitBranch className="w-3.5 h-3.5 text-teal-200" />
                  <span className="text-[10px] font-bold text-teal-100">Bilgi Grafiğini Aç</span>
                </div>
                <p className="text-lg font-bold text-foreground leading-tight">Bilgi Ağı</p>
                <p className="text-xs text-slate-300 leading-relaxed">Şirket, operasyon ve doküman ilişkilerini tek ekranda inceleyin.</p>
              </div>
              <ChevronRight className="ml-auto w-5 h-5 text-teal-200 shrink-0" />
            </div>
          </div>
        </button>

        <div>
          <SectionHeader title="Son Belgeler" action="Tümü" onAction={() => navTo("documents")} />
          {documents.length === 0 ? (
            <EmptyState
              icon={FileText}
              title="Henüz belge yok"
              desc="App içi odalardan veya manuel yükleme ile belge geldiğinde burada görünecek."
              action="Yenile"
              onAction={refreshTender}
            />
          ) : (
            <div className="space-y-3">
              {documents.slice(0, 3).map(document => <DocumentCard key={document.id} document={document} />)}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => navTo("upload")}
            className="py-3.5 bg-primary rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2">
            <Upload className="w-4 h-4" /> Belge Yükle
          </button>
          <button onClick={() => navTo("ai-extraction")}
            className="py-3.5 bg-card border border-border rounded-xl text-sm font-semibold text-foreground flex items-center justify-center gap-2">
            <Cpu className="w-4 h-4 text-violet-400" /> AI Çıkarımı
          </button>
        </div>
        <div className="h-4" />
      </div>
    </div>
  );

  if (screen === "documents") return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Belgeler" onBack={back} actions={
        <button className="w-9 h-9 flex items-center justify-center rounded-full bg-muted">
          <Filter className="w-4 h-4 text-foreground" />
        </button>
      } />
      <div className="px-4 pt-3 pb-2">
        <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2.5">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            value={documentQuery}
            onChange={event => setDocumentQuery(event.target.value)}
            placeholder="Belge ara..."
            className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1"
          />
        </div>
      </div>
      <div className="flex-1 px-4 pt-2 pb-4 space-y-3">
        <TenderLoadingOrError />
        {filteredDocuments.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="Belge bulunamadı"
            desc={documentQuery ? "Arama kriterine uygun belge yok." : "Yüklenen belgeler burada listelenecek."}
            action="Yenile"
            onAction={refreshTender}
          />
        ) : (
          filteredDocuments.map(document => <DocumentCard key={document.id} document={document} />)
        )}
      </div>
    </div>
  );

  if (screen === "document-detail") return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Belge Detayı" onBack={() => navTo("documents")} />
      <div className="flex-1 px-4 py-4 space-y-4">
        {!selectedDocument ? (
          <EmptyState icon={FileText} title="Belge seçilmedi" desc="Belgeler listesinden bir belge seçin." />
        ) : (
          <>
            <Card className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-base font-bold text-foreground leading-snug">
                    {selectedDocument.original_filename || selectedDocument.stored_filename || selectedDocument.tender_id}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">#{selectedDocument.id} · {selectedDocument.tender_id}</p>
                </div>
                <Badge label={tenderStatusLabel(selectedDocument.status)} />
              </div>
            </Card>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => void previewTenderDocument(selectedDocument)}
                className="py-3 rounded-xl bg-muted text-sm font-bold text-foreground flex items-center justify-center gap-2"
              >
                <Eye className="w-4 h-4 text-primary" /> Önizle
              </button>
              <button
                onClick={() => void downloadTenderDocument(selectedDocument)}
                className="py-3 rounded-xl bg-primary text-sm font-bold text-white flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" /> İndir
              </button>
            </div>

            <Card className="divide-y divide-border">
              {[
                { label: "Kurum", value: selectedDocument.organization || "Kurum yok", icon: Building2 },
                { label: "Dahili Birim", value: selectedDocument.internal_unit || "Birim yok", icon: GitBranch },
                { label: "Belge Tipi", value: selectedDocument.document_type || "Belge", icon: Tag },
                { label: "Tarih", value: formatDate(selectedDocument.timestamp), icon: Clock },
                { label: "Dosya Boyutu", value: formatFileSize(selectedDocument.file_size), icon: Paperclip },
                { label: "Kaynak", value: selectedDocument.source || "Kaynak yok", icon: Send },
              ].map((item, index) => {
                const Icon = item.icon;
                return (
                  <div key={index} className="flex items-center gap-3 px-4 py-3.5">
                    <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="text-sm font-medium text-foreground truncate">{item.value}</p>
                    </div>
                  </div>
                );
              })}
            </Card>

            <div>
              <SectionHeader title="AI Durumları" />
              <Card className="grid grid-cols-3 gap-0 divide-x divide-border">
                {[
                  { label: "Metin", value: selectedDocument.text_extraction_status || "bekliyor" },
                  { label: "Özet", value: selectedDocument.ai_summary_status || "bekliyor" },
                  { label: "Risk", value: selectedDocument.ai_risk_status || "bekliyor" },
                ].map(item => (
                  <div key={item.label} className="p-3 text-center">
                    <p className="text-[10px] text-muted-foreground">{item.label}</p>
                    <p className="text-xs font-semibold text-foreground mt-1 truncate">{item.value}</p>
                  </div>
                ))}
              </Card>
            </div>
          </>
        )}
      </div>
      {tenderPreviewFile && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <div className="h-14 px-4 border-b border-border flex items-center gap-3">
            <button
              onClick={() => {
                if (tenderPreviewFile.url.startsWith("blob:")) URL.revokeObjectURL(tenderPreviewFile.url);
                setTenderPreviewFile(null);
              }}
              className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0"
              aria-label="Önizlemeyi kapat"
            >
              <X className="w-4 h-4 text-foreground" />
            </button>
            <p className="flex-1 min-w-0 text-sm font-semibold text-foreground truncate">{tenderPreviewFile.name}</p>
            <a
              href={tenderPreviewFile.url}
              download={tenderPreviewFile.name}
              className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0"
              aria-label="Belgeyi indir"
            >
              <Download className="w-4 h-4 text-white" />
            </a>
          </div>
          <div className="flex-1 min-h-0 bg-black">
            {tenderPreviewFile.type.startsWith("image/") ? (
              <img src={tenderPreviewFile.url} alt={tenderPreviewFile.name} className="w-full h-full object-contain" />
            ) : tenderPreviewFile.type.startsWith("video/") ? (
              <video src={tenderPreviewFile.url} controls className="w-full h-full" />
            ) : isPdfFile(tenderPreviewFile) ? (
              <PdfCanvasPreview url={tenderPreviewFile.url} />
            ) : (
              <iframe src={tenderPreviewFile.url} title={tenderPreviewFile.name} className="w-full h-full border-0 bg-white" />
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (screen === "document-groups") return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Doküman Grupları" onBack={back} />
      <div className="flex-1 px-4 py-4 space-y-3">
        <TenderLoadingOrError />
        {documentGroups.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Doküman grubu yok"
            desc="Mesajlar > Alanlar bölümünde oluşturulan şirket içi çalışma alanları burada görünecek."
            action="Yenile"
            onAction={refreshTender}
          />
        ) : (
          documentGroups
            .slice()
            .sort((left, right) => left.name.localeCompare(right.name, "tr"))
            .map(group => (
            <Card key={group.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                  <Users className="w-5 h-5 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{group.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {group.description || "Şirket içi doküman ve mesaj odası"}
                      </p>
                    </div>
                    <Badge label={group.archived_at ? "Arşiv" : "Aktif"} />
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1.5 min-w-0">
                      <GitBranch className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{group.tender_id || "Genel klasör"}</span>
                    </span>
                    <span className="flex items-center gap-1.5 justify-end min-w-0">
                      <CalendarDays className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{group.year || "Yıl yok"}</span>
                    </span>
                    <span className="flex items-center gap-1.5 min-w-0">
                      <Users className="w-3.5 h-3.5 shrink-0" />
                      <span>{group.member_count} üye</span>
                    </span>
                    <span className="flex items-center gap-1.5 justify-end min-w-0">
                      <FileText className="w-3.5 h-3.5 shrink-0" />
                      <span>{group.document_count} doküman</span>
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );

  if (screen === "folder-tree") return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Klasör Ağacı" onBack={back} />
      <div className="flex-1 px-4 py-4 space-y-5">
        <TenderLoadingOrError />
        {!folderTree ? (
          <EmptyState
            icon={FolderOpen}
            title="Klasör boş"
            desc="Yüklenen belgeler klasör ağacında görünecek."
            action="Yenile"
            onAction={refreshTender}
          />
        ) : (
          <>
            <div>
              <SectionHeader title="Orijinal Belgeler" />
              <TreeNodeList nodes={folderTree.data_originals.children} />
            </div>
            <div>
              <SectionHeader title="Bilgi Ağı" />
              <TreeNodeList nodes={folderTree.obsidian_vault.children} />
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (screen === "upload") return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Belge Yükle" onBack={back} />
      <div className="flex-1 px-4 py-4 space-y-4">
        <button className="w-full border-2 border-dashed border-border rounded-2xl p-10 flex flex-col items-center gap-3 active:border-primary transition-colors">
          <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
            <Upload className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-semibold text-foreground">Dosya seçin</p>
          <p className="text-xs text-muted-foreground text-center">PDF, DOCX, XLSX · Maks. 50 MB</p>
        </button>
        <Card className="p-4 space-y-4">
          <h3 className="text-sm font-semibold text-foreground">Sınıflandırma Bilgileri</h3>
          {["Dahili Şube *", "Şirket *", "Workflow ID", "Notlar"].map((label, i) => (
            <div key={i}>
              <label className="text-xs font-semibold text-muted-foreground block mb-1.5">{label}</label>
              <div className="bg-muted rounded-xl px-3 py-3">
                <input placeholder={label.replace(" *", "") + "..."} className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-full" />
              </div>
            </div>
          ))}
        </Card>
        <button className="w-full py-4 bg-primary rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2">
          <Upload className="w-4 h-4" /> Yükle ve Sınıflandır
        </button>
        <div className="h-4" />
      </div>
    </div>
  );

  if (screen === "obsidian") return (
    <div className="flex flex-col min-h-full" style={{ background: "#0A0A12" }}>
      <div className="flex items-center h-14 px-4 gap-3 border-b sticky top-0 z-10"
        style={{ borderColor: "rgba(255,255,255,0.06)", background: "#0A0A12" }}>
        <button onClick={back} className="w-8 h-8 flex items-center justify-center rounded-full shrink-0"
          style={{ background: "rgba(255,255,255,0.06)" }}>
          <ChevronLeft className="w-5 h-5 text-slate-300" />
        </button>
        <div className="flex-1 flex items-center gap-1.5 rounded-lg px-3 py-1.5"
          style={{ background: "rgba(255,255,255,0.05)" }}>
          <Search className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <input
            value={vaultQuery}
            onChange={e => setVaultQuery(e.target.value)}
            placeholder="Notlarda ara…"
            className="flex-1 min-w-0 bg-transparent text-xs text-foreground placeholder:text-slate-500 outline-none"
          />
        </div>
        <BookOpen className="w-5 h-5 text-teal-400 shrink-0" />
      </div>
      <div className="flex-1 px-4 py-4">
        <TenderLoadingOrError />
        {vaultNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: "rgba(20,184,166,0.1)" }}>
              <BookOpen className="w-6 h-6 text-teal-400" />
            </div>
            <p className="text-sm font-semibold text-slate-300 mb-1">Vault Boş</p>
            <p className="text-xs text-slate-500 mb-4">Bilgi notları, belgeler yüklendikçe otomatik oluşturulacak.</p>
            <button onClick={refreshTender}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-teal-400 border"
              style={{ borderColor: "rgba(20,184,166,0.3)", background: "rgba(20,184,166,0.08)" }}>
              Yenile
            </button>
          </div>
        ) : filteredVaultNotes.length === 0 ? (
          <EmptyState icon={Search} title="Sonuç yok" desc={`"${vaultQuery}" ile eşleşen not bulunamadı.`} />
        ) : (
          <div className="space-y-3">
            {filteredVaultNotes.map(note => (
              <Card key={note.path} className="p-4">
                <div className="flex items-start gap-3">
                  <BookOpen className="w-5 h-5 text-teal-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">{note.name}</p>
                    <p className="text-xs text-muted-foreground mt-1 truncate">{note.path}</p>
                    <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-500">
                      <span>{formatDate(note.updated)}</span>
                      <span>{note.linked_files} dosya</span>
                    </div>
                    {note.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {note.tags.slice(0, 4).map(tag => (
                          <span key={tag} className="px-2 py-0.5 rounded-full bg-teal-500/10 text-[10px] text-teal-300">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  if (screen === "tender-detail") return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Şirket Kaydı" onBack={back} />
      <div className="flex-1 px-4 py-4">
        <EmptyState icon={FileText} title="Kayıt seçilmedi" desc="Belgeler listesinden bir şirket kaydı seçin." />
      </div>
    </div>
  );

  if (screen === "ai-extraction") return (
    <div className="flex flex-col min-h-full">
      <TopBar title="AI Çıkarımı" onBack={back} />
      <div className="flex-1 px-4 py-4 space-y-4">
        <div className="rounded-xl p-4 flex items-start gap-3"
          style={{ background: "rgba(139,92,246,0.08)", border: "1px solid rgba(139,92,246,0.2)" }}>
          <Cpu className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
          <p className="text-xs" style={{ color: "rgba(196,181,253,0.8)" }}>
            Planlanan AI özellikleri önizlemesi. Çıkarım yapabilmek için önce bir belge seçin.
          </p>
        </div>
        <EmptyState
          icon={Cpu}
          title="Belge seçilmedi"
          desc="AI çıkarımı yapmak için önce belgeler listesinden bir belge seçin."
          action="Belgelere Git"
          onAction={() => navTo("documents")}
        />
        <div>
          <SectionHeader title="Belgeye Soru Sor" />
          {user.role === "admin" && <Card className="p-4 space-y-3">
            <textarea rows={3} placeholder="Örn: Teknik garantinin kapsamı nedir?" className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none" />
            <button className="w-full py-3 bg-primary/50 rounded-xl text-sm font-bold text-white/60 flex items-center justify-center gap-2 cursor-not-allowed">
              <Cpu className="w-4 h-4" /> Belge Seçilmedi
            </button>
          </Card>}
        </div>
        <div className="h-4" />
      </div>
    </div>
  );

  return null;
}

// ─── PROFILE TAB ──────────────────────────────────────────────────────────────
function ProfileTab({
  user,
  onLogout,
  onProfilePhotoChange,
}: {
  user: AuthUser;
  onLogout: () => void;
  onProfilePhotoChange: () => void;
}) {
  const [darkToggle, setDarkToggle] = useState(true);
  const [notificationPrefs, setNotificationPrefs] = useState<ERPNotificationPreference | null>(null);
  const [prefSavingKey, setPrefSavingKey] = useState<NotificationPreferenceToggleKey | null>(null);
  const [prefError, setPrefError] = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [showAccountDeletionConfirm, setShowAccountDeletionConfirm] = useState(false);
  const [accountDeletionBusy, setAccountDeletionBusy] = useState(false);
  const [accountDeletionMessage, setAccountDeletionMessage] = useState("");
  const [accountDeletionError, setAccountDeletionError] = useState("");
  const [profilePhoto, setProfilePhoto] = useState(() => readProfilePhoto(user.id || user.email));

  useEffect(() => {
    let cancelled = false;
    setPrefError("");
    void getERPNotificationPreferences()
      .then(preferences => {
        if (!cancelled) setNotificationPrefs(preferences);
      })
      .catch(exception => {
        if (!cancelled) {
          setPrefError(exception instanceof Error ? exception.message : "Bildirim tercihleri yüklenemedi.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const handleProfilePhoto = async (file: File | undefined) => {
    if (!file) return;
    const dataUrl = await blobToDataUrl(file);
    writeProfilePhoto(user.id || user.email, dataUrl);
    setProfilePhoto(dataUrl);
    onProfilePhotoChange();
  };

  const toggleProfileNotificationPreference = async (key: NotificationPreferenceToggleKey) => {
    if (!notificationPrefs) return;
    setPrefSavingKey(key);
    setPrefError("");
    try {
      const nextValue = !notificationPrefs[key];
      // The single "Bildirimler" switch covers both push channels, so the
      // browser and mobile preferences must move together.
      const payload = key === "browser_push_enabled"
        ? { browser_push_enabled: nextValue, mobile_push_enabled: nextValue }
        : { [key]: nextValue };
      const next = await updateERPNotificationPreferences(payload);
      setNotificationPrefs(next);
    } catch (exception) {
      setPrefError(exception instanceof Error ? exception.message : "Bildirim tercihi güncellenemedi.");
    } finally {
      setPrefSavingKey(null);
    }
  };

  const handleAccountDeletionRequest = async () => {
    setAccountDeletionBusy(true);
    setAccountDeletionError("");
    setAccountDeletionMessage("");
    try {
      await requestERPAccountDeletion();
      setAccountDeletionMessage("Hesap silme talebiniz yöneticilere iletildi.");
      setShowAccountDeletionConfirm(false);
    } catch (exception) {
      setAccountDeletionError(exception instanceof Error ? exception.message : "Hesap silme talebi iletilemedi.");
    } finally {
      setAccountDeletionBusy(false);
    }
  };

  return (
    <div className="flex flex-col min-h-full">
      <TopBar title="Profil" />
      <div className="flex-1 px-4 py-4 space-y-5">
        <Card className="p-5 flex flex-col items-center text-center">
          <Avatar name={user.name} size="lg" src={profilePhoto} />
          <label className="mt-3 px-4 py-2 rounded-xl bg-muted text-xs font-semibold text-foreground flex items-center gap-2 active:opacity-80">
            <ImageIcon className="w-4 h-4 text-primary" /> Profil Fotoğrafı Ekle
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                event.target.value = "";
                void handleProfilePhoto(file);
              }}
            />
          </label>
          <h2 className="text-lg font-bold text-foreground mt-3">{user.name}</h2>
          <p className="text-sm text-muted-foreground mt-0.5">{user.role === "admin" ? "Sistem Yöneticisi" : "Çalışan"}</p>
          <div className="flex items-center gap-2 mt-2">
            <Building2 className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Mobit · {user.dept}</span>
          </div>
          <div className="mt-3">
            <Badge label={user.role === "admin" ? "Admin" : "Kullanıcı"} />
          </div>
        </Card>

        <div>
          <SectionHeader title="Hesap Bilgileri" />
          <Card className="divide-y divide-border">
            {[
              { label: "Ad Soyad", value: user.name,  icon: User },
              { label: "E-posta",  value: user.email, icon: Mail },
              { label: "Şube",     value: "Mobit",    icon: Building2 },
              { label: "Rol",      value: user.role === "admin" ? "Sistem Yöneticisi" : "Çalışan", icon: Shield },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5">
                  <Icon className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-sm font-medium text-foreground">{item.value}</p>
                  </div>
                </div>
              );
            })}
          </Card>
        </div>

        <div>
          <SectionHeader title="Ayarlar" />
          <Card className="divide-y divide-border">
            {[
              { label: "Karanlık Tema", desc: "Göz yorgunluğunu azalt", val: darkToggle, disabled: false, saving: false, toggle: () => setDarkToggle(v => !v) },
              {
                label: "Bildirimler",
                desc: "Mobil ve web bildirimlerini al",
                val: Boolean(notificationPrefs?.browser_push_enabled),
                disabled: !notificationPrefs,
                saving: prefSavingKey === "browser_push_enabled",
                toggle: () => void toggleProfileNotificationPreference("browser_push_enabled"),
              },
              {
                label: "E-posta Yedeği",
                desc: "Kritik bildirimleri e-postaya da gönder",
                val: Boolean(notificationPrefs?.email_enabled),
                disabled: !notificationPrefs,
                saving: prefSavingKey === "email_enabled",
                toggle: () => void toggleProfileNotificationPreference("email_enabled"),
              },
            ].map((s, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{s.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                </div>
                <button
                  onClick={s.toggle}
                  disabled={s.disabled || s.saving}
                  className={`w-11 h-6 rounded-full transition-colors relative disabled:opacity-50 ${s.val ? "bg-primary" : "bg-muted"}`}
                >
                  <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${s.val ? "translate-x-5" : "translate-x-0.5"}`}
                    style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
                </button>
              </div>
            ))}
          </Card>
          {prefError && (
            <p className="mt-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              {prefError}
            </p>
          )}
        </div>

        <div>
          <SectionHeader title="Hesap Silme" />
          <Card className="p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
                <Shield className="w-4 h-4 text-red-300" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">Hesabımı silme talebi</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Talebiniz yöneticilere iletilir. Hesap ve verileriniz admin onayı olmadan silinmez.
                </p>
              </div>
            </div>
            {accountDeletionMessage && (
              <p className="text-xs text-primary bg-primary/10 border border-primary/20 rounded-xl px-3 py-2">
                {accountDeletionMessage}
              </p>
            )}
            {accountDeletionError && (
              <p className="text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                {accountDeletionError}
              </p>
            )}
            <button
              type="button"
              onClick={() => setShowAccountDeletionConfirm(true)}
              disabled={accountDeletionBusy || user.role === "admin"}
              className="w-full py-3 rounded-xl text-sm font-semibold text-red-300 bg-red-500/10 border border-red-500/20 disabled:opacity-50"
            >
              {user.role === "admin" ? "Admin hesabı için sistem sahibiyle iletişime geçin" : "Hesap Silme Talebi Gönder"}
            </button>
          </Card>
        </div>

        <div className="flex justify-center py-2">
          <ImageWithFallback src={mobitLogo} alt="Mobit" className="h-9 object-contain opacity-25" />
        </div>

        <button onClick={() => setShowConfirm(true)}
          className="w-full py-3.5 rounded-xl text-sm font-semibold text-red-400 flex items-center justify-center gap-2 border"
          style={{ background: "rgba(239,68,68,0.08)", borderColor: "rgba(239,68,68,0.2)" }}>
          <LogOut className="w-4 h-4" /> Çıkış Yap
        </button>
        <div className="h-6" />
      </div>

      {/* Logout confirm */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-6">
          <div className="w-full bg-card rounded-2xl border border-border p-5">
            <h3 className="text-base font-bold text-foreground mb-2">Çıkış Yap</h3>
            <p className="text-sm text-muted-foreground mb-5">Oturumunuzu kapatmak istediğinize emin misiniz?</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => setShowConfirm(false)}
                className="py-3 bg-muted rounded-xl text-sm font-semibold text-foreground">
                İptal
              </button>
              <button onClick={onLogout}
                className="py-3 bg-red-600 rounded-xl text-sm font-semibold text-white">
                Çıkış Yap
              </button>
            </div>
          </div>
        </div>
      )}

      {showAccountDeletionConfirm && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center px-6">
          <div className="w-full bg-card rounded-2xl border border-border p-5">
            <h3 className="text-base font-bold text-foreground mb-2">Hesap Silme Talebi</h3>
            <p className="text-sm text-muted-foreground mb-5">
              Talebiniz tüm yöneticilere bildirilecek. Devam etmek istiyor musunuz?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowAccountDeletionConfirm(false)}
                disabled={accountDeletionBusy}
                className="py-3 bg-muted rounded-xl text-sm font-semibold text-foreground disabled:opacity-50"
              >
                Vazgeç
              </button>
              <button
                onClick={() => void handleAccountDeletionRequest()}
                disabled={accountDeletionBusy}
                className="py-3 bg-red-600 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
              >
                {accountDeletionBusy ? "İletiliyor..." : "Talep Gönder"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── BOTTOM NAV ───────────────────────────────────────────────────────────────
function BottomNav({ tab, setTab, role }: { tab: Tab; setTab: (t: Tab) => void; role: Role }) {
  const allTabs: { id: Tab; label: string; icon: any }[] = [
    { id: "home",     label: "Ana Sayfa", icon: Home },
    { id: "erp",      label: "ERP",       icon: ClipboardList },
    { id: "tender",   label: "Dokümanlar", icon: FileText },
    { id: "messages", label: "Mesajlar",  icon: MessageSquare },
    { id: "profile",  label: "Profil",    icon: User },
  ];
  const tabs = role === "admin" ? allTabs : allTabs.filter(t => t.id !== "tender");

  return (
    <div className="shrink-0 border-t border-border bg-card" style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}>
      <div className="flex">
        {tabs.map(t => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className="flex-1 flex flex-col items-center justify-center gap-1 pt-3 pb-2 relative min-w-0">
              {active && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />}
              <Icon className={`w-5 h-5 transition-colors ${active ? "text-primary" : "text-muted-foreground"}`} />
              <span className={`text-[10px] font-medium leading-tight transition-colors truncate max-w-full px-1 ${active ? "text-primary" : "text-muted-foreground"}`}>{t.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── ROOT APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authHydrated, setAuthHydrated] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [sessionNotice, setSessionNotice] = useState("");
  const [erpOpenRequest, setErpOpenRequest] = useState<ERPOpenRequest | null>(null);
  const [directMessageOpenRequest, setDirectMessageOpenRequest] = useState<DirectMessageOpenRequest | null>(null);
  const [roomOpenRequest, setRoomOpenRequest] = useState<RoomOpenRequest | null>(null);
  const [profilePhotoVersion, setProfilePhotoVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void loadStoredUserAsync()
      .then(stored => {
        if (cancelled) return;
        if (stored) {
          setAuthUser({
            id: stored.id,
            name: stored.name,
            email: stored.email,
            role: stored.role,
            dept: stored.dept,
          });
        }
      })
      .finally(() => {
        if (!cancelled) setAuthHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!authUser) return;
    void registerNativePushNotifications(openFromNotificationTarget).catch(error => {
      console.warn("Native push setup failed.", error);
    });
  }, [authUser?.email]);

  useEffect(() => {
    const handleExpired = () => {
      setSessionNotice("Oturum süreniz doldu. Güvenliğiniz için lütfen tekrar giriş yapın.");
      setAuthUser(null);
      setTab("home");
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handleExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handleExpired);
  }, []);

  const handleLogin = (u: AuthUser) => {
    setSessionNotice("");
    setAuthUser(u);
    setTab("home");
  };

  const handleLogout = async () => {
    await unregisterNativePushNotifications();
    clearStoredSession();
    setAuthUser(null);
    setTab("home");
  };

  const openDirectMessageFromNotification = (messageId: number) => {
    setDirectMessageOpenRequest({ messageId, nonce: Date.now() });
    setTab("messages");
  };

  const openDocumentRoomFromNotification = (groupId: number, view: "chat" | "documents") => {
    setRoomOpenRequest({ groupId, view, nonce: Date.now() });
    setTab("messages");
  };

  const openFromNotificationTarget = (target: NotificationNavigationTarget) => {
    const nonce = Date.now();
    if (target.kind === "direct") {
      setDirectMessageOpenRequest({ messageId: target.messageId, nonce });
      setTab("messages");
    } else if (target.kind === "room") {
      setRoomOpenRequest({ groupId: target.groupId, view: target.view, nonce });
      setTab("messages");
    } else if (target.kind === "task") {
      setErpOpenRequest({ kind: "task", taskId: target.taskId, nonce });
      setTab("erp");
    } else if (target.kind === "account-requests") {
      setErpOpenRequest({ kind: "account-requests", nonce });
      setTab("erp");
    }
  };

  return (
    <div
      className="docsbot-mobile-shell flex flex-col bg-background text-foreground overflow-hidden"
      style={{ fontFamily: "'Inter', sans-serif", height: "100dvh", width: "100%", maxWidth: 480, margin: "0 auto" }}
    >
      {!authHydrated ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
          <ImageWithFallback src={mobitLogo} alt="Mobit" className="w-16 h-16 object-contain mb-4" />
          <p className="text-sm font-semibold text-foreground">Mobit hazırlanıyor...</p>
          <p className="text-xs text-muted-foreground mt-1">Güvenli oturum kontrol ediliyor.</p>
        </div>
      ) : !authUser ? (
        <LoginScreen onLogin={handleLogin} notice={sessionNotice} />
      ) : (
        <>
          <div className="flex-1 min-h-0 overflow-hidden relative">
            {(["home", "erp", "tender", "messages", "profile"] as Tab[]).map(t => {
              // Kullanıcılar tender göremiyor
              if (t === "tender" && authUser.role !== "admin") return null;
              return (
                <div key={t} className={`absolute inset-0 ${tab === t ? "flex flex-col min-h-0" : "hidden"}`}>
                  <div className={`tab-enter flex-1 min-h-0 ${t === "messages" ? "overflow-hidden" : "overflow-y-auto"}`}>
                    <TabErrorBoundary tabKey={tab}>
                      {t === "home"     && <HomeTab     user={authUser} setTab={setTab} />}
                      {t === "erp"      && <ERPTab      user={authUser} onOpenDirectMessage={openDirectMessageFromNotification} onOpenDocumentRoom={openDocumentRoomFromNotification} openRequest={erpOpenRequest} />}
                      {t === "tender"   && <TenderTab   user={authUser} />}
                      {t === "messages" && <MessagesTab user={authUser} openRequest={directMessageOpenRequest} roomOpenRequest={roomOpenRequest} profilePhotoVersion={profilePhotoVersion} />}
                      {t === "profile"  && <ProfileTab  user={authUser} onLogout={handleLogout} onProfilePhotoChange={() => setProfilePhotoVersion(value => value + 1)} />}
                    </TabErrorBoundary>
                  </div>
                </div>
              );
            })}
          </div>
          <BottomNav tab={tab} setTab={setTab} role={authUser.role} />
        </>
      )}
    </div>
  );
}
