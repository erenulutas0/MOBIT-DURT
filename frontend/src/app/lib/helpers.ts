import {
  ApiDocument,
  ERPNotification,
  ERPOverview,
  ERPSession,
  ERPTask,
  ERPUser,
  deleteERPWebPushSubscription,
  getERPWebPushConfig,
  registerERPWebPushSubscription,
} from "../api";
import type { FilePreview, OverdueEmployeeRow, NotificationUrgency } from "./types";
import { SESSION_STORAGE_KEYS, BROWSER_NOTIFICATION_KEY } from "./constants";

export function readStoredSession(): ERPSession | null {
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

export function persistSession(session: ERPSession | null) {
  SESSION_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
  if (!session) {
    return;
  }
  window.localStorage.setItem(SESSION_STORAGE_KEYS[0], JSON.stringify(session));
}

export function isAdmin(session: ERPSession | null): boolean {
  return session?.role === "admin";
}

export function userTaskIds(overview: ERPOverview | null, userId: number | null | undefined): Set<number> {
  if (!overview || userId === null || userId === undefined) return new Set();
  return new Set(
    overview.assignments
      .filter((assignment) => assignment.assignee_user_id === userId)
      .map((assignment) => assignment.task_id)
  );
}

export function browserNotificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function browserNotificationsEnabled(): boolean {
  return window.localStorage.getItem(BROWSER_NOTIFICATION_KEY) === "true";
}

export function setBrowserNotificationsEnabled(enabled: boolean): void {
  window.localStorage.setItem(BROWSER_NOTIFICATION_KEY, String(enabled));
}

export function browserNotificationPermission(): NotificationPermission | "unsupported" {
  return browserNotificationsSupported() ? Notification.permission : "unsupported";
}

export function serviceWorkerPushSupported(): boolean {
  return browserNotificationsSupported()
    && "serviceWorker" in navigator
    && "PushManager" in window;
}

export function base64UrlToUint8Array(value: string): Uint8Array {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) {
    output[index] = raw.charCodeAt(index);
  }
  return output;
}

export async function enableClosedDashboardWebPush(): Promise<void> {
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

export async function disableClosedDashboardWebPush(): Promise<void> {
  if (!("serviceWorker" in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration("/docsbot-sw.js");
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;
  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await deleteERPWebPushSubscription(endpoint);
}

export function showBrowserNotification(notification: ERPNotification): void {
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

export function notificationUrgency(priority?: string | null): NotificationUrgency {
  const value = (priority || "").toUpperCase();
  if (value === "CRITICAL" || value === "URGENT") return "critical";
  if (value === "HIGH") return "high";
  return "normal";
}

export function mergeNotification(items: ERPNotification[], next: ERPNotification): ERPNotification[] {
  const existing = items.find((item) => item.id === next.id);
  const merged = existing
    ? items.map((item) => item.id === next.id ? { ...item, ...next } : item)
    : [next, ...items];
  return merged
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 50);
}

export function shortName(name: string): string {
  return name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export function formatDateShort(value: string | null | undefined): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return "-";
  const diffMs = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(diffMs / 60000));
  if (minutes < 1) return "şimdi";
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${Math.round(hours / 24)} gün önce`;
}

export function taskLabel(status: string): string {
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

export function userStatusLabel(status: string): string {
  if (status === "online") return "Online";
  if (status === "away") return "Away";
  return "Offline";
}

export function getAssignee(task: ERPTask, overview: ERPOverview | null): ERPUser | null {
  if (!overview) return null;
  const assignment = overview.assignments.find((item) => item.task_id === task.id && item.assignee_user_id);
  if (!assignment?.assignee_user_id) return null;
  return overview.users.find((user) => user.id === assignment.assignee_user_id) || null;
}

export function documentsForTask(task: ERPTask, overview: ERPOverview | null): number {
  return overview?.documents.filter((document) => document.task_id === task.id).length || 0;
}

export function overdueEmployeeRows(overview: ERPOverview | null): OverdueEmployeeRow[] {
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

export function documentsForTender(tenderId: string, documents: ApiDocument[]): ApiDocument[] {
  return documents.filter((document) => document.tender_id === tenderId);
}

export function createFilePreview(blob: Blob, filename: string, title?: string): FilePreview {
  return {
    title: title || filename,
    filename,
    url: URL.createObjectURL(blob),
    mimeType: blob.type || "",
    blob,
  };
}
