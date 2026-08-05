import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

export type BackendRole = "admin" | "user";

export type BackendAuthUser = {
  id: number | null;
  name: string;
  email: string;
  role: BackendRole;
  dept: string;
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
};

export type ERPUser = {
  id: number;
  name: string;
  role: string;
  status: "online" | "offline" | "away" | string;
  email: string | null;
  phone: string | null;
  // Optional so local placeholder literals (admin pseudo-user etc.) stay valid.
  title?: string | null;
  document_network_visible: boolean;
  last_seen_at: string | null;
  approved_at: string | null;
  created_at: string;
};

export type ERPTeam = {
  id: number;
  name: string;
  created_at: string;
};

/**
 * How a task's dates should be read. Tender work is rarely "due at this exact instant" — it is
 * expressed relative to another date. deadline_at always means "must be done by", so the deadline
 * reminders behave the same whichever of these is picked.
 */
export type ERPScheduleKind = "at" | "before" | "until" | "after" | "between";

export const SCHEDULE_KIND_LABELS: Record<ERPScheduleKind, string> = {
  at: "Belirli tarihte",
  before: "…den önce",
  until: "…e kadar",
  after: "…den sonra",
  between: "…arasında",
};

/** Kinds that need a start anchor as well as (or instead of) a due date. */
export const SCHEDULE_KINDS_WITH_START: ERPScheduleKind[] = ["after", "between"];

export type ERPTask = {
  id: number;
  title: string;
  description: string | null;
  assigned_by_user_id: number | null;
  status: "todo" | "in_progress" | "blocked" | "pending_approval" | "done" | "overdue" | "cancelled" | string;
  priority: "low" | "normal" | "high" | "urgent" | string;
  deadline_at: string | null;
  // How the two dates read: "at" (plain due date), "before"/"until", "after", "between".
  schedule_kind?: ERPScheduleKind;
  starts_at?: string | null;
  completed_at: string | null;
  parent_task_id?: number | null;
  document_group_id?: number | null;
  created_at: string;
  version?: number;
};

export type ERPTaskDependency = {
  id: number;
  predecessor_task_id: number;
  successor_task_id: number;
  created_at: string;
};

export type ERPTaskAssignment = {
  id: number;
  task_id: number;
  assignee_user_id: number | null;
  assignee_team_id: number | null;
  role?: "responsible" | "participant" | string;
  title?: string | null;
  created_at: string;
};

export type ERPTaskDocument = {
  id: number;
  task_id: number;
  document_id: number | null;
  original_filename: string | null;
  file_path: string | null;
  visibility: string;
  created_at: string;
};

export type ERPTaskComment = {
  id: number;
  task_id: number;
  author_user_id: number | null;
  body: string;
  kind: string;
  created_at: string;
};

export type ERPNotification = {
  id: number;
  user_id: number;
  type: string;
  title: string;
  body: string | null;
  task_id?: number | null;
  priority?: string | null;
  event_key?: string | null;
  read_at: string | null;
  created_at: string;
};

export type ERPNotificationPreference = {
  user_id: number;
  task_assigned_enabled: boolean;
  manager_message_enabled: boolean;
  employee_help_message_enabled: boolean;
  completion_updates_enabled: boolean;
  deadline_alerts_enabled: boolean;
  browser_push_enabled: boolean;
  mobile_push_enabled: boolean;
  email_enabled: boolean;
  updated_at: string;
};

export type ERPNotificationPreferenceUpdate = Partial<{
  task_assigned_enabled: boolean;
  manager_message_enabled: boolean;
  employee_help_message_enabled: boolean;
  completion_updates_enabled: boolean;
  deadline_alerts_enabled: boolean;
  browser_push_enabled: boolean;
  mobile_push_enabled: boolean;
  email_enabled: boolean;
}>;

export type MobileAppUpdateInfo = {
  current_version: string;
  latest_version: string;
  minimum_version: string;
  update_available: boolean;
  required: boolean;
  title: string;
  message: string;
  play_store_url: string;
};

export type ChatStreamEvent = {
  eventName: string;
  data: unknown;
};

export type ERPDirectMessage = {
  id: number;
  sender_type: "admin" | "user" | string;
  sender_user_id: number | null;
  sender_name: string;
  recipient_type: "admin" | "user" | string;
  recipient_user_id: number | null;
  recipient_name: string;
  body: string;
  message_kind?: "text" | "voice" | string;
  media_mime_type?: string | null;
  media_data?: string | null;
  media_url?: string | null;
  media_ref?: string | null;
  media_duration_ms?: number | null;
  client_message_id?: string | null;
  reply_to_message_id?: number | null;
  delivered_at?: string | null;
  read_at: string | null;
  delivery_status?: "sent" | "delivered" | "read" | string | null;
  created_at: string;
};

export type ERPOverview = {
  users: ERPUser[];
  teams: ERPTeam[];
  tasks: ERPTask[];
  assignments: ERPTaskAssignment[];
  documents: ERPTaskDocument[];
  help_messages: ERPTaskComment[];
  notifications: ERPNotification[];
  task_dependencies?: ERPTaskDependency[];
};

export type ERPAccountRequest = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  status: "pending" | "approved" | "rejected" | string;
  requested_role: string;
  verification_required?: boolean;
  decided_by: string | null;
  decided_at: string | null;
  created_user_id: number | null;
  created_at: string;
};

export type ApiPageMeta = {
  total: number;
  offset: number;
  limit: number;
  has_next: boolean;
};

export type TenderDocument = {
  id: number;
  source: string;
  timestamp: string;
  mime_type: string | null;
  original_filename: string | null;
  stored_filename: string | null;
  file_size: number | null;
  internal_unit: string | null;
  organization: string | null;
  year: number | null;
  tender_id: string;
  document_type: string;
  status: string;
  file_path: string | null;
  text_extraction_status?: string | null;
  fact_extraction_status?: string | null;
  ai_summary_status?: string | null;
  ai_risk_status?: string | null;
};

export type Tender = {
  id: number;
  tender_id: string;
  organization: string;
  year: number;
  sequence: number;
  internal_unit: string | null;
  title: string | null;
  status: string;
  created_at: string;
  submission_deadline_at?: string | null;
};

export type TenderDocumentPage = {
  page: ApiPageMeta;
  items: TenderDocument[];
};

export type TenderPage = {
  page: ApiPageMeta;
  items: Tender[];
};

export type VaultNote = {
  name: string;
  path: string;
  updated: string;
  linked_files: number;
  tags: string[];
};

export type VaultNotes = {
  vault_root: string;
  notes: VaultNote[];
};

export type TreeNode = {
  name: string;
  path: string;
  type: "folder" | "file" | "missing";
  size?: number | null;
  download_url?: string | null;
  view_url?: string | null;
  children: TreeNode[];
};

export type FolderTree = {
  data_originals: TreeNode;
  obsidian_vault: TreeNode;
};

export type DocumentGroupSummary = {
  id: number;
  name: string;
  description: string | null;
  tender_id: string | null;
  year: number | null;
  created_by: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  member_count: number;
  document_count: number;
  unread_message_count?: number;
};

export type DocumentGroupMember = {
  id: number;
  user_id: number;
  role: string;
  added_by: string;
  created_at: string;
  name: string | null;
  email: string | null;
};

export type DocumentGroupDocument = {
  id: number;
  group_id: number;
  document_id: number;
  uploaded_by_user_id: number | null;
  uploaded_by: string;
  note: string | null;
  tender_id: string | null;
  year: number | null;
  created_at: string;
  document: TenderDocument;
};

export type DocumentGroupDocumentVersion = {
  id: number | null;
  group_document_id: number;
  document_id: number;
  version_number: number;
  uploaded_by_user_id: number | null;
  uploaded_by: string;
  note: string | null;
  created_at: string;
  document: TenderDocument;
};

export type DocumentGroupMessage = {
  id: number;
  group_id: number;
  author_user_id: number | null;
  author_name: string;
  body: string;
  message_kind?: "text" | "voice" | string;
  media_mime_type?: string | null;
  media_data?: string | null;
  media_url?: string | null;
  media_ref?: string | null;
  media_duration_ms?: number | null;
  client_message_id?: string | null;
  reply_to_message_id?: number | null;
  delivered_at?: string | null;
  sequence_no?: number | null;
  delivery_status?: "sent" | "delivered" | string | null;
  created_at: string;
};

export type DocumentGroupDetail = {
  group: DocumentGroupSummary;
  members: DocumentGroupMember[];
  documents: DocumentGroupDocument[];
};

type AuthSessionResponse = {
  role: string;
  name: string;
  user_id: number | null;
  email: string | null;
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  refresh_expires_in: number;
};

const SESSION_KEY = "docsbot.mobile.auth";
const API_TIMEOUT_MS = 15_000;
let sessionCache: BackendAuthUser | null | undefined;

const TENANT_KEY = "docsbot.tenant.server";
/** Hydrated once at startup; `undefined` means "not read yet", `null` means "no choice stored". */
let tenantServerCache: string | null | undefined;

function defaultBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  return "http://127.0.0.1:8080";
}

/**
 * Which server this install talks to.
 *
 * <p>Each customer runs their own backend and their own database — the isolation story that sells
 * this to a company whose tender documents are its competitive position. The one app on the Play
 * Store therefore cannot have a server baked into it, or every customer would need a listing of
 * their own.
 *
 * <p>Falls back to the build-time default when nothing is stored, so existing installs and the
 * default company keep working across the update without anyone typing anything.
 */
function apiBaseUrl() {
  return tenantServerCache || defaultBaseUrl();
}

/**
 * Turns what someone types on the sign-in screen into a server address.
 *
 * <p>A short company code is what a customer can be told over the phone and retype without error,
 * so codes map to a subdomain by convention. A full URL is accepted as-is for the customer who
 * hosts the backend themselves, which is a thing tender companies ask for.
 */
export function resolveTenantServer(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const suffix = (import.meta.env.VITE_TENANT_DOMAIN_SUFFIX
    || defaultBaseUrl().replace(/^https?:\/\//i, "")).replace(/\/.*$/, "");
  return `https://${trimmed.toLowerCase()}.${suffix}`;
}

export function currentTenantServer(): string {
  return apiBaseUrl();
}

/** True when this install is pinned to a specific server rather than the built-in default. */
export function hasCustomTenantServer(): boolean {
  return Boolean(tenantServerCache);
}

export async function loadStoredTenantServerAsync(): Promise<string | null> {
  if (tenantServerCache !== undefined) return tenantServerCache;
  try {
    const [{ value }, legacy] = await Promise.all([
      Preferences.get({ key: TENANT_KEY }),
      Promise.resolve(window.localStorage.getItem(TENANT_KEY)),
    ]);
    tenantServerCache = value || legacy || null;
    return tenantServerCache;
  } catch {
    tenantServerCache = null;
    return null;
  }
}

/**
 * Points this install at a different server. Any stored session belongs to the old one, so it is
 * dropped: a token issued by one customer's backend is meaningless to another's, and keeping it
 * would show a signed-in shell that fails on its first request.
 */
export async function setTenantServer(input: string): Promise<string> {
  const resolved = resolveTenantServer(input);
  if (!resolved) throw new Error("Şirket kodu boş olamaz.");
  clearStoredSession();
  tenantServerCache = resolved;
  window.localStorage.setItem(TENANT_KEY, resolved);
  try {
    await Preferences.set({ key: TENANT_KEY, value: resolved });
  } catch {
    // Web build without the native plugin: localStorage above is the store.
  }
  return resolved;
}

export async function clearTenantServer(): Promise<void> {
  clearStoredSession();
  tenantServerCache = null;
  window.localStorage.removeItem(TENANT_KEY);
  try {
    await Preferences.remove({ key: TENANT_KEY });
  } catch {
    // Nothing to remove without the native plugin.
  }
}

/** Confirms a server is actually a DocsBot backend before an install is pinned to it. */
export async function probeTenantServer(baseUrl: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`${baseUrl.replace(/\/+$/, "")}/health`, {}, 8000);
    return response.ok;
  } catch {
    return false;
  }
}

// A real approved employee account always takes priority; the shared admin
// identity (env-configured, not a database row) is only a fallback. This
// matters if an employee is ever approved with an "admin@..."-looking email:
// that real account must still be reachable, not silently shadowed by the
// admin fallback.
export async function loginToBackend(identifier: string, password: string): Promise<BackendAuthUser> {
  const employee = await tryLogin("/erp/auth/login", { email: identifier, password });
  if (employee.ok) return toUser(employee.session);

  const username = adminUsername(identifier);
  const admin = await tryLogin("/erp/auth/admin-login", {
    username,
    password,
  });
  if (admin.ok) return toUser(admin.session);

  throw new Error(employee.detail || admin.detail || "E-posta veya şifre hatalı.");
}

export async function createERPAccountRequest(payload: {
  name: string;
  email: string;
  phone?: string;
  password: string;
}): Promise<ERPAccountRequest> {
  const response = await fetchWithTimeout(`${apiBaseUrl()}/erp/account-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: payload.name,
      email: payload.email,
      phone: payload.phone || null,
      password: payload.password,
    }),
  });
  if (!response.ok) throw new Error(await accountRequestErrorText(response));
  return response.json();
}

// Self-service registration: creates an auto-approved account and returns a session, so the user is
// logged in immediately (no admin approval, no email verification step).
export async function registerToBackend(payload: {
  name: string;
  username: string;
  email?: string;
  phone?: string;
  password: string;
}): Promise<BackendAuthUser> {
  const response = await fetchWithTimeout(`${apiBaseUrl()}/erp/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: payload.name,
      username: payload.username,
      email: payload.email || null,
      phone: payload.phone || null,
      password: payload.password,
    }),
  });
  if (!response.ok) throw new Error(await accountRequestErrorText(response));
  return toUser(await response.json());
}

export async function verifyERPAccountEmail(email: string, code: string): Promise<void> {
  const response = await fetchWithTimeout(`${apiBaseUrl()}/erp/account-requests/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Doğrulama başarısız."));
}

export async function resendERPAccountCode(email: string): Promise<void> {
  const response = await fetchWithTimeout(`${apiBaseUrl()}/erp/account-requests/resend`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Kod gönderilemedi."));
}

export async function getERPAccountRequests(status = "pending"): Promise<ERPAccountRequest[]> {
  const response = await apiFetch(`/erp/account-requests?status=${encodeURIComponent(status)}`);
  if (!response.ok) throw new Error(await errorText(response, "Hesap talepleri yüklenemedi."));
  return response.json();
}

export async function approveERPAccountRequest(requestId: number, title?: string): Promise<ERPUser> {
  const response = await apiFetch(`/erp/account-requests/${requestId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title?.trim() || null }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Hesap talebi onaylanamadı."));
  return response.json();
}

// Admin-only ünvan management; empty string clears the title.
export async function updateERPUserTitle(userId: number, title: string): Promise<ERPUser> {
  const response = await apiFetch(`/erp/users/${userId}/title`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: title.trim() || null }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Ünvan güncellenemedi."));
  return response.json();
}

/**
 * Admin hands a locked-out employee a temporary password. Nothing is returned and the password is
 * never stored client-side — the admin reads it out to its owner, who then replaces it.
 */
export async function resetERPUserPassword(userId: number, password: string): Promise<void> {
  const response = await apiFetch(`/erp/users/${userId}/password`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Şifre sıfırlanamadı."));
}

export async function changeOwnERPPassword(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const response = await apiFetch("/erp/me/password", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Şifre değiştirilemedi."));
}

export async function rejectERPAccountRequest(requestId: number): Promise<ERPAccountRequest> {
  const response = await apiFetch(`/erp/account-requests/${requestId}/reject`, { method: "POST" });
  if (!response.ok) throw new Error(await errorText(response, "Hesap talebi reddedilemedi."));
  return response.json();
}

export function saveSession(user: BackendAuthUser) {
  const value = JSON.stringify(user);
  sessionCache = user;
  if (usesNativeSessionStore()) {
    window.localStorage.removeItem(SESSION_KEY);
    void Preferences.set({ key: SESSION_KEY, value });
    return;
  }
  window.localStorage.setItem(SESSION_KEY, value);
}

export function loadStoredUser(): BackendAuthUser | null {
  if (sessionCache !== undefined) return sessionCache;
  if (usesNativeSessionStore()) return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    sessionCache = parseSession(raw);
    return sessionCache;
  } catch {
    sessionCache = null;
    return null;
  }
}

export async function loadStoredUserAsync(): Promise<BackendAuthUser | null> {
  if (!usesNativeSessionStore()) return loadStoredUser();
  if (sessionCache !== undefined) return sessionCache;
  try {
    const [{ value }, legacyRaw] = await Promise.all([
      Preferences.get({ key: SESSION_KEY }),
      Promise.resolve(window.localStorage.getItem(SESSION_KEY)),
    ]);
    const raw = value || legacyRaw;
    sessionCache = parseSession(raw);
    if (sessionCache && !value) {
      await Preferences.set({ key: SESSION_KEY, value: JSON.stringify(sessionCache) });
    }
    if (legacyRaw) {
      window.localStorage.removeItem(SESSION_KEY);
    }
    return sessionCache;
  } catch {
    sessionCache = null;
    return null;
  }
}

export function clearStoredSession() {
  sessionCache = null;
  window.localStorage.removeItem(SESSION_KEY);
  if (usesNativeSessionStore()) {
    void Preferences.remove({ key: SESSION_KEY });
  }
}

export async function requestERPAccountDeletion(): Promise<void> {
  const response = await apiFetch("/erp/me/account-deletion-request", { method: "POST" });
  if (!response.ok) throw new Error(await errorText(response, "Hesap silme talebi iletilemedi."));
}

export async function getERPOverview(): Promise<ERPOverview> {
  const response = await apiFetch("/erp/overview");
  if (!response.ok) throw new Error(await errorText(response, "ERP verisi yüklenemedi."));
  return response.json();
}

export async function createERPTask(payload: {
  title: string;
  description?: string | null;
  assigneeUserIds: number[];
  responsibleUserId?: number | null;
  assigneeTitles?: Record<number, string>;
  priority?: "low" | "normal" | "high" | "urgent" | string;
  deadlineAt?: string | null;
  scheduleKind?: ERPScheduleKind;
  startsAt?: string | null;
  parentTaskId?: number | null;
}): Promise<ERPTask> {
  const response = await apiFetch("/erp/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: payload.title,
      description: payload.description || null,
      assignee_user_ids: payload.assigneeUserIds,
      assignee_team_ids: [],
      responsible_user_id: payload.responsibleUserId || null,
      assignee_titles: payload.assigneeTitles || {},
      priority: payload.priority || "normal",
      deadline_at: payload.deadlineAt || null,
      schedule_kind: payload.scheduleKind || "at",
      starts_at: payload.startsAt || null,
      parent_task_id: payload.parentTaskId || null,
    }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Görev oluşturulamadı."));
  return response.json();
}

export async function addERPTaskDependency(taskId: number, predecessorTaskId: number): Promise<ERPTaskDependency> {
  const response = await apiFetch(`/erp/tasks/${taskId}/dependencies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ predecessor_task_id: predecessorTaskId }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Görev bağımlılığı eklenemedi."));
  return response.json();
}

export async function removeERPTaskDependency(taskId: number, predecessorTaskId: number): Promise<void> {
  const response = await apiFetch(`/erp/tasks/${taskId}/dependencies/${predecessorTaskId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(await errorText(response, "Görev bağımlılığı kaldırılamadı."));
}

export async function linkERPTaskDocumentGroup(taskId: number, documentGroupId: number): Promise<ERPTask> {
  const response = await apiFetch(`/erp/tasks/${taskId}/document-group`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_group_id: documentGroupId }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Görev odaya bağlanamadı."));
  return response.json();
}

export interface ERPTaskEditPayload {
  title?: string;
  description?: string;
  priority?: string;
  deadline_at?: string;
  schedule_kind?: ERPScheduleKind;
  starts_at?: string | null;
  clear_deadline?: boolean;
  status?: string;
}

// Admin-only full edit; omitted fields stay unchanged. Changing the deadline
// re-arms the backend due-soon/overdue alert ladder for the task.
export async function updateERPTaskDetails(taskId: number, payload: ERPTaskEditPayload): Promise<ERPTask> {
  const response = await apiFetch(`/erp/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await errorText(response, "Görev güncellenemedi."));
  return response.json();
}

// Completion loop + standard reports. The final report rides the completion request's note; interim
// reports are task comments with kind "interim_report" (they render in the task's notes section).
export async function requestERPTaskCompletion(taskId: number, note: string): Promise<ERPTask> {
  const response = await apiFetch(`/erp/tasks/${taskId}/completion-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Tamamlama talebi gönderilemedi."));
  return response.json();
}

export async function approveERPTaskCompletion(taskId: number): Promise<ERPTask> {
  const response = await apiFetch(`/erp/tasks/${taskId}/approve-completion`, { method: "POST" });
  if (!response.ok) throw new Error(await errorText(response, "Tamamlama onaylanamadı."));
  return response.json();
}

export async function rejectERPTaskCompletion(taskId: number, note: string): Promise<ERPTask> {
  const response = await apiFetch(`/erp/tasks/${taskId}/reject-completion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Tamamlama reddedilemedi."));
  return response.json();
}

export async function addERPTaskComment(taskId: number, body: string, kind: string): Promise<void> {
  const response = await apiFetch(`/erp/tasks/${taskId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body, kind }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Rapor eklenemedi."));
}

export async function getERPUsers(): Promise<ERPUser[]> {
  const response = await apiFetch("/erp/users");
  if (!response.ok) throw new Error(await errorText(response, "Kullanıcı listesi yüklenemedi."));
  return response.json();
}

// Presence heartbeat: employees may only update their own status (backend-enforced).
export async function updateERPUserPresence(userId: number, status: "online" | "offline" | "away"): Promise<void> {
  const response = await apiFetch(`/erp/users/${userId}/presence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Durum güncellenemedi."));
}

/**
 * Turkish TTS (self-hosted Piper). Returns a playable WAV blob; throws with the backend's message
 * when the synthesizer is off (503) so callers can quietly skip speech. Synthesis of a long text on
 * the VPS CPU can take well beyond the default 15s API timeout — allow up to 60s here.
 */
export async function getAssistantSpeech(text: string): Promise<Blob> {
  const response = await apiFetch("/erp/assistant/speech", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }, true, 60_000);
  if (!response.ok) throw new Error(await errorText(response, "Ses oluşturulamadı."));
  return response.blob();
}

export type ERPPerformanceRow = {
  user_id: number;
  name: string;
  on_time: number;
  late: number;
  overdue_open: number;
  open_active: number;
  score: number | null;
};

// Admin-only: per-user task performance for the given period ("week" | "month").
export async function getERPPerformance(period: "week" | "month"): Promise<ERPPerformanceRow[]> {
  const response = await apiFetch(`/erp/performance?period=${period}`);
  if (!response.ok) throw new Error(await errorText(response, "Performans verisi yüklenemedi."));
  return response.json();
}

export async function deleteERPUser(userId: number): Promise<void> {
  const response = await apiFetch(`/erp/users/${userId}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await errorText(response, "Hesap silinemedi."));
}

export async function getERPNotificationPreferences(): Promise<ERPNotificationPreference> {
  const response = await apiFetch("/erp/notification-preferences");
  if (!response.ok) throw new Error(await errorText(response, "Bildirim tercihleri yüklenemedi."));
  return response.json();
}

export async function updateERPNotificationPreferences(
  payload: ERPNotificationPreferenceUpdate
): Promise<ERPNotificationPreference> {
  const response = await apiFetch("/erp/notification-preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await errorText(response, "Bildirim tercihleri güncellenemedi."));
  return response.json();
}

export async function getMobileAppUpdateInfo(currentVersion: string): Promise<MobileAppUpdateInfo> {
  const response = await apiFetch(`/erp/app-update?current_version=${encodeURIComponent(currentVersion)}`);
  if (!response.ok) throw new Error(await errorText(response, "Uygulama güncelleme bilgisi alınamadı."));
  return response.json();
}

export async function markERPNotificationRead(notificationId: number): Promise<ERPNotification> {
  const response = await apiFetch(`/erp/notifications/${notificationId}/read`, { method: "PATCH" });
  if (!response.ok) throw new Error(await errorText(response, "Bildirim okundu yapılamadı."));
  return response.json();
}

export async function markAllERPNotificationsRead(): Promise<void> {
  const response = await apiFetch("/erp/notifications/read-all", { method: "PATCH" });
  if (!response.ok) throw new Error(await errorText(response, "Bildirimler okundu yapılamadı."));
}

export type ERPAnnouncement = {
  id: number;
  title: string;
  body: string;
  updated_at: string;
};

export async function getERPAnnouncement(): Promise<ERPAnnouncement | null> {
  const response = await apiFetch("/erp/announcement");
  if (!response.ok) throw new Error(await errorText(response, "Duyuru alınamadı."));
  const data = await response.json();
  return data?.announcement ?? null;
}

export async function sendERPFeedback(payload: {
  category: "bug" | "suggestion" | "question" | "other";
  message: string;
  appVersion?: string;
}): Promise<void> {
  const response = await apiFetch("/erp/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      category: payload.category,
      message: payload.message,
      app_version: payload.appVersion || null,
    }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Dönüt gönderilemedi."));
}

export async function getERPNotificationUnreadCount(): Promise<number> {
  const response = await apiFetch("/erp/notifications/unread-count");
  if (!response.ok) throw new Error(await errorText(response, "Okunmamış bildirim sayısı alınamadı."));
  const data = await response.json();
  return typeof data?.unread_count === "number" ? data.unread_count : 0;
}

function messagePageQuery(limit: number, beforeId?: number | null) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (beforeId && beforeId > 0) {
    params.set("before_id", String(beforeId));
  }
  return params.toString();
}

export async function getERPDirectMessages(limit = 100, beforeId?: number | null): Promise<ERPDirectMessage[]> {
  const response = await apiFetch(`/erp/messages?${messagePageQuery(limit, beforeId)}`);
  if (!response.ok) throw new Error(await errorText(response, "Mesajlar yüklenemedi."));
  return response.json();
}

export type CommunicationSearchResult = {
  type: "direct_message" | "room_message" | "room_document";
  id: number;
  group_id: number | null;
  group_name: string | null;
  other_user_id: number | null;
  title: string;
  snippet: string | null;
  created_at: string;
};

/** Searches direct-message bodies, document-room message bodies, and room document filenames the caller can see. */
export async function searchCommunication(query: string): Promise<CommunicationSearchResult[]> {
  const response = await apiFetch(`/erp/search?q=${encodeURIComponent(query)}`);
  if (!response.ok) throw new Error(await errorText(response, "Arama yapılamadı."));
  return response.json();
}

export type CompanyChatMessage = {
  id: number;
  author_user_id: number | null;
  author_name: string;
  author_role: "admin" | "employee" | string;
  body: string;
  created_at: string;
};

/** The shared "Şirket Geneli" channel — everyone posts to and reads the same feed; it is hard-reset once a day server-side. */
export async function getCompanyChatMessages(): Promise<CompanyChatMessage[]> {
  const response = await apiFetch("/erp/company-chat/messages");
  if (!response.ok) throw new Error(await errorText(response, "Şirket geneli mesajlar yüklenemedi."));
  return response.json();
}

export async function sendCompanyChatMessage(body: string): Promise<CompanyChatMessage> {
  const response = await apiFetch("/erp/company-chat/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Mesaj gönderilemedi."));
  return response.json();
}

export type AssistantTaskItem = {
  id: number;
  title: string;
  status: string;
  deadline_at: string | null;
};

export type AssistantBriefing = {
  assistant_name: string;
  display_name: string;
  generated_at: string;
  overdue: AssistantTaskItem[];
  due_today: AssistantTaskItem[];
  due_this_week: AssistantTaskItem[];
  ready_to_start: AssistantTaskItem[];
  blocked: AssistantTaskItem[];
  unread_messages: number;
  unread_notifications: number;
};

/** Mobit-Asistan: the caller's personal workload briefing (admin sees the whole board). */
export async function getAssistantBriefing(): Promise<AssistantBriefing> {
  const response = await apiFetch("/erp/assistant/briefing");
  if (!response.ok) throw new Error(await errorText(response, "Asistan özeti yüklenemedi."));
  return response.json();
}

export type AssistantChatReply = {
  assistant_name: string;
  provider: string;
  reply: string;
};

/** Ask Mobit-Asistan a question. Answered from the user's own data; provider-agnostic. */
export async function sendAssistantMessage(message: string): Promise<AssistantChatReply> {
  const response = await apiFetch("/erp/assistant/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Asistan yanıt veremedi."));
  return response.json();
}

export type DocumentPassage = {
  document_id: number;
  document_name: string | null;
  chunk_index: number;
  content: string;
  similarity: number;
};

export type DocumentAnswer = {
  ready: boolean;
  message: string;
  passages: DocumentPassage[];
};

/**
 * Ask the company's own documents a question.
 *
 * <p>The answer is the clauses themselves with the file each came from, and deliberately not a
 * generated summary: for a şartname that is the product rather than a shortcoming, because a quoted
 * clause can be opened and checked while a paraphrase cannot, and an answer with legal weight has to
 * be checkable.
 */
export async function askDocuments(question: string): Promise<DocumentAnswer> {
  const response = await apiFetch("/erp/assistant/documents/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, limit: 5 }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Belgelerde arama yapılamadı."));
  return response.json();
}

export type TenderBriefEntry = {
  key: string;
  label: string;
  question: string;
  found: boolean;
  document_id: number | null;
  document_name: string | null;
  content: string | null;
  similarity: number | null;
  /** Key of an earlier entry answered by this very same clause, when there is one. */
  same_as: string | null;
};

export type TenderBrief = {
  ready: boolean;
  message: string;
  tender_id: string;
  entries: TenderBriefEntry[];
};

/**
 * "İhale künyesi": the facts a company decides on before bidding, each answered by the clause that
 * states it — instead of reading forty pages of four documents to fill in a form.
 *
 * <p>Scoped to one tender: penalties and thresholds differ per contract, so an answer taken from a
 * neighbouring şartname reads perfectly and is wrong.
 */
export async function getTenderBrief(tenderId: string): Promise<TenderBrief> {
  const response = await apiFetch(`/erp/assistant/tenders/${encodeURIComponent(tenderId)}/brief`);
  if (!response.ok) throw new Error(await errorText(response, "İhale künyesi çıkarılamadı."));
  return response.json();
}

export async function sendERPDirectMessage(payload: {
  body: string;
  recipientUserId?: number | null;
  messageKind?: "text" | "voice" | "image" | "file";
  mediaMimeType?: string | null;
  mediaData?: string | null;
  mediaDurationMs?: number | null;
  clientMessageId?: string | null;
  replyToMessageId?: number | null;
}): Promise<ERPDirectMessage> {
  const response = await apiFetch("/erp/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      body: payload.body,
      recipient_user_id: payload.recipientUserId ?? null,
      message_kind: payload.messageKind ?? "text",
      media_mime_type: payload.mediaMimeType ?? null,
      media_data: payload.mediaData ?? null,
      media_duration_ms: payload.mediaDurationMs ?? null,
      client_message_id: payload.clientMessageId ?? null,
      reply_to_message_id: payload.replyToMessageId ?? null,
    }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Mesaj gönderilemedi."));
  return response.json();
}

export async function markERPDirectMessageRead(messageId: number): Promise<ERPDirectMessage> {
  const response = await apiFetch(`/erp/messages/${messageId}/read`, { method: "PATCH" });
  if (!response.ok) throw new Error(await errorText(response, "Mesaj okundu yapılamadı."));
  return response.json();
}

export type MessageDeleteScope = "me" | "everyone";

function deleteScopeQuery(scope?: MessageDeleteScope) {
  return scope ? `?scope=${encodeURIComponent(scope)}` : "";
}

export async function deleteERPDirectMessage(
  messageId: number,
  scope: MessageDeleteScope = "everyone"
): Promise<void> {
  const response = await apiFetch(`/erp/messages/${messageId}${deleteScopeQuery(scope)}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await errorText(response, "Mesaj silinemedi."));
}

export async function getTenderDocumentsPage(offset = 0, limit = 25): Promise<TenderDocumentPage> {
  const response = await apiFetch(
    `/documents/page?offset=${encodeURIComponent(String(offset))}&limit=${encodeURIComponent(String(limit))}`
  );
  if (!response.ok) throw new Error(await errorText(response, "Belgeler yüklenemedi."));
  return response.json();
}

export async function getTenderDocumentBlob(documentId: number, download = false): Promise<Blob> {
  const response = await apiFetch(
    download ? `/dashboard/files/${documentId}` : `/dashboard/files/${documentId}/view`
  );
  if (!response.ok) throw new Error(await errorText(response, "Belge içeriği alınamadı."));
  return response.blob();
}

export async function getTendersPage(offset = 0, limit = 25): Promise<TenderPage> {
  const response = await apiFetch(
    `/tenders/page?offset=${encodeURIComponent(String(offset))}&limit=${encodeURIComponent(String(limit))}`
  );
  if (!response.ok) throw new Error(await errorText(response, "Şirket kayıtları yüklenemedi."));
  return response.json();
}

export async function createCompanyWorkflow(payload: {
  organization: string;
  year?: number | null;
  internalUnit?: string | null;
}): Promise<Tender> {
  const response = await apiFetch("/tenders/company", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      organization: payload.organization,
      year: payload.year || null,
      internal_unit: payload.internalUnit || null,
    }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Şirket oluşturulamadı."));
  return response.json();
}

// Admin sets/clears a tender's submission deadline (son teklif tarihi); null clears.
export async function setTenderSubmissionDeadline(tenderId: string, isoDeadline: string | null): Promise<Tender> {
  const response = await apiFetch(`/tenders/${encodeURIComponent(tenderId)}/deadline`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ submission_deadline_at: isoDeadline }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Teslim tarihi kaydedilemedi."));
  return response.json();
}

export async function getVaultNotes(): Promise<VaultNotes> {
  const response = await apiFetch("/dashboard/vault/notes");
  if (!response.ok) throw new Error(await errorText(response, "Bilgi notları yüklenemedi."));
  return response.json();
}

export async function getFolderTree(): Promise<FolderTree> {
  const response = await apiFetch("/dashboard/tree");
  if (!response.ok) throw new Error(await errorText(response, "Klasör ağacı yüklenemedi."));
  return response.json();
}

export async function getDocumentGroups(): Promise<DocumentGroupSummary[]> {
  const response = await apiFetch("/document-groups");
  if (!response.ok) throw new Error(await errorText(response, "Doküman odaları yüklenemedi."));
  return response.json();
}

export async function getDocumentGroup(groupId: number): Promise<DocumentGroupDetail> {
  const response = await apiFetch(`/document-groups/${groupId}`);
  if (!response.ok) throw new Error(await errorText(response, "Doküman odası yüklenemedi."));
  return response.json();
}

export async function createDocumentGroup(payload: {
  name: string;
  description?: string;
  tenderId?: string;
  year?: number | null;
  memberUserIds?: number[];
}): Promise<DocumentGroupDetail> {
  const response = await apiFetch("/document-groups", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: payload.name,
      description: payload.description,
      tender_id: payload.tenderId || null,
      year: payload.year || null,
      member_user_ids: payload.memberUserIds || [],
    }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Doküman odası oluşturulamadı."));
  return response.json();
}

export async function updateDocumentGroup(payload: {
  groupId: number;
  name: string;
  description?: string | null;
  tenderId?: string | null;
  year?: number | null;
  transferExistingDocuments?: boolean;
}): Promise<DocumentGroupDetail> {
  const response = await apiFetch(`/document-groups/${payload.groupId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: payload.name,
      description: payload.description || null,
      tender_id: payload.tenderId || null,
      year: payload.year || null,
      transfer_existing_documents: Boolean(payload.transferExistingDocuments),
    }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Çalışma alanı güncellenemedi."));
  return response.json();
}

// Archiving closes the room (chat input disabled, content preserved). Used when an admin
// terminates the task a workspace belongs to.
export async function archiveDocumentGroup(groupId: number, archived = true): Promise<DocumentGroupDetail> {
  const response = await apiFetch(`/document-groups/${groupId}/archive`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ archived }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Alan arşivlenemedi."));
  return response.json();
}

export async function addDocumentGroupMember(
  groupId: number,
  userId: number,
  role = "member"
): Promise<DocumentGroupDetail> {
  const response = await apiFetch(`/document-groups/${groupId}/members`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      user_id: userId,
      role,
    }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Alan üyesi eklenemedi."));
  return response.json();
}

export async function removeDocumentGroupMember(
  groupId: number,
  userId: number
): Promise<DocumentGroupDetail> {
  const response = await apiFetch(`/document-groups/${groupId}/members/${userId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(await errorText(response, "Alan üyesi çıkarılamadı."));
  return response.json();
}

export async function uploadDocumentGroupFile(payload: {
  groupId: number;
  file: File;
  note?: string;
  tenderId?: string;
  year?: number | null;
}): Promise<DocumentGroupDocument> {
  const form = new FormData();
  form.append("file", payload.file);
  if (payload.note?.trim()) form.append("note", payload.note.trim());
  if (payload.tenderId?.trim()) form.append("tender_id", payload.tenderId.trim());
  if (payload.year) form.append("year", String(payload.year));
  const response = await apiFetch(`/document-groups/${payload.groupId}/documents`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) throw new Error(await errorText(response, "Doküman yüklenemedi."));
  return response.json();
}

/** Same as uploadDocumentGroupFile but reports upload percentage via XHR (fetch has no upload progress event). */
export async function uploadDocumentGroupFileWithProgress(
  payload: {
    groupId: number;
    file: File;
    note?: string;
    tenderId?: string;
    year?: number | null;
  },
  onProgress: (percent: number) => void
): Promise<DocumentGroupDocument> {
  const form = new FormData();
  form.append("file", payload.file);
  if (payload.note?.trim()) form.append("note", payload.note.trim());
  if (payload.tenderId?.trim()) form.append("tender_id", payload.tenderId.trim());
  if (payload.year) form.append("year", String(payload.year));
  const token = (await loadStoredUserAsync())?.accessToken;

  return new Promise<DocumentGroupDocument>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${apiBaseUrl()}/document-groups/${payload.groupId}/documents`);
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error("Doküman yüklenemedi."));
        }
      } else {
        const message = (() => {
          try {
            const payload = JSON.parse(xhr.responseText);
            return payload?.detail || payload?.message;
          } catch {
            return null;
          }
        })();
        reject(new Error(message || "Doküman yüklenemedi."));
      }
    };
    xhr.onerror = () => reject(new Error("Doküman yüklenemedi."));
    xhr.send(form);
  });
}

export async function replaceDocumentGroupFile(payload: {
  groupId: number;
  groupDocumentId: number;
  file: File;
  note?: string;
}): Promise<DocumentGroupDocument> {
  const form = new FormData();
  form.append("file", payload.file);
  if (payload.note?.trim()) form.append("note", payload.note.trim());
  const response = await apiFetch(`/document-groups/${payload.groupId}/documents/${payload.groupDocumentId}/versions`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) throw new Error(await errorText(response, "Doküman revizyonu yüklenemedi."));
  return response.json();
}

export async function updateERPUserDocumentNetworkVisibility(
  userId: number,
  visible: boolean
): Promise<ERPUser> {
  const response = await apiFetch(`/erp/users/${userId}/document-network-visibility`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ visible }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Doküman ağı yetkisi güncellenemedi."));
  return response.json();
}

export async function getDocumentGroupMessages(
  groupId: number,
  limit?: number,
  beforeId?: number | null
): Promise<DocumentGroupMessage[]> {
  const query = limit ? `?${messagePageQuery(limit, beforeId)}` : "";
  const response = await apiFetch(`/document-groups/${groupId}/messages${query}`);
  if (!response.ok) throw new Error(await errorText(response, "Alan mesajları yüklenemedi."));
  return response.json();
}

export async function getAuthenticatedMediaBlob(path: string): Promise<Blob> {
  const response = await apiFetch(path);
  if (!response.ok) throw new Error(await errorText(response, "Medya dosyası alınamadı."));
  return response.blob();
}

export async function sendDocumentGroupMessage(groupId: number, payload: string | {
  body: string;
  messageKind?: "text" | "voice" | "image" | "file";
  mediaMimeType?: string | null;
  mediaData?: string | null;
  mediaDurationMs?: number | null;
  clientMessageId?: string | null;
  replyToMessageId?: number | null;
}): Promise<DocumentGroupMessage> {
  const body = typeof payload === "string"
    ? { body: payload, client_message_id: null }
    : {
        body: payload.body,
        message_kind: payload.messageKind || "text",
        media_mime_type: payload.mediaMimeType || null,
        media_data: payload.mediaData || null,
        media_duration_ms: payload.mediaDurationMs || null,
        client_message_id: payload.clientMessageId || null,
        reply_to_message_id: payload.replyToMessageId || null,
      };
  const response = await apiFetch(`/document-groups/${groupId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await errorText(response, "Alan mesajı gönderilemedi."));
  return response.json();
}

export async function markDocumentGroupMessagesRead(
  groupId: number,
  throughMessageId: number
): Promise<{ updated_count: number }> {
  const response = await apiFetch(`/document-groups/${groupId}/messages/read-through`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ through_message_id: throughMessageId }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Oda mesajları okundu yapılamadı."));
  return response.json();
}

export async function openChatEventStream(
  onEvent: (event: ChatStreamEvent) => void,
  onError?: (error: unknown) => void
): Promise<() => void> {
  const session = await loadStoredUserAsync();
  if (!session?.accessToken) {
    throw new Error("Oturum bulunamadı.");
  }
  const controller = new AbortController();
  const connect = (accessToken: string) =>
    fetch(`${apiBaseUrl()}/erp/messages/stream`, {
      headers: {
        Accept: "text/event-stream",
        Authorization: `Bearer ${accessToken}`,
      },
      signal: controller.signal,
    });
  let response = await connect(session.accessToken);
  // A long-lived SSE connection outlives the short access-token TTL: on a stale token the
  // stream 401s, so refresh once and reconnect before giving up (mirrors apiFetch).
  if (response.status === 401) {
    const refreshed = await refreshSession();
    if (refreshed?.accessToken) {
      response = await connect(refreshed.accessToken);
    } else {
      clearStoredSession();
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    }
  }
  if (!response.ok) {
    throw new Error(await errorText(response, "Canlı mesaj bağlantısı kurulamadı."));
  }
  if (!response.body) {
    throw new Error("Bu cihaz canlı mesaj bağlantısını desteklemiyor.");
  }
  void readSseStream(response.body, onEvent, controller.signal)
    .then(() => {
      if (!controller.signal.aborted) {
        onError?.(new Error("Canlı mesaj bağlantısı kapandı."));
      }
    })
    .catch(error => {
      if (!controller.signal.aborted) {
        onError?.(error);
      }
    });
  return () => controller.abort();
}

export async function deleteDocumentGroupMessage(
  groupId: number,
  messageId: number,
  scope: MessageDeleteScope = "everyone"
): Promise<void> {
  const response = await apiFetch(
    `/document-groups/${groupId}/messages/${messageId}${deleteScopeQuery(scope)}`,
    { method: "DELETE" }
  );
  if (!response.ok) throw new Error(await errorText(response, "Mesaj silinemedi."));
}

export async function deleteDocumentGroupDocument(groupId: number, groupDocumentId: number): Promise<void> {
  const response = await apiFetch(`/document-groups/${groupId}/documents/${groupDocumentId}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await errorText(response, "Doküman silinemedi."));
}

export async function getDocumentGroupFileBlob(
  groupId: number,
  groupDocumentId: number,
  download = true
): Promise<Blob> {
  const response = await apiFetch(
    `/document-groups/${groupId}/documents/${groupDocumentId}/content?download=${download ? "true" : "false"}`
  );
  if (!response.ok) throw new Error(await errorText(response, "Doküman indirilemedi."));
  return response.blob();
}

export async function getDocumentGroupFileVersions(
  groupId: number,
  groupDocumentId: number
): Promise<DocumentGroupDocumentVersion[]> {
  const response = await apiFetch(`/document-groups/${groupId}/documents/${groupDocumentId}/versions`);
  if (!response.ok) throw new Error(await errorText(response, "Doküman geçmişi yüklenemedi."));
  return response.json();
}

export async function getDocumentGroupFileVersionBlob(
  groupId: number,
  groupDocumentId: number,
  versionId: number,
  download = true
): Promise<Blob> {
  const response = await apiFetch(
    `/document-groups/${groupId}/documents/${groupDocumentId}/versions/${versionId}/content?download=${download ? "true" : "false"}`
  );
  if (!response.ok) throw new Error(await errorText(response, "Doküman versiyonu indirilemedi."));
  return response.blob();
}

export async function registerMobilePushToken(payload: {
  platform: "android" | "ios";
  deviceId: string;
  token: string;
  appVersion?: string;
}): Promise<void> {
  const response = await apiFetch("/erp/mobile-push/tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      platform: payload.platform,
      device_id: payload.deviceId,
      token: payload.token,
      app_version: payload.appVersion,
    }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Mobil push token kaydedilemedi."));
}

export async function unregisterMobilePushToken(payload: {
  platform: "android" | "ios";
  deviceId: string;
}): Promise<void> {
  const response = await apiFetch("/erp/mobile-push/tokens", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      platform: payload.platform,
      device_id: payload.deviceId,
    }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Mobil push token silinemedi."));
}

async function tryLogin(
  path: string,
  body: Record<string, string>
): Promise<{ ok: true; session: AuthSessionResponse } | { ok: false; detail: string }> {
  try {
    const response = await fetchWithTimeout(`${apiBaseUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, detail: payload.detail || payload.message || "Giriş yapılamadı." };
    }
    return { ok: true, session: payload as AuthSessionResponse };
  } catch (exception) {
    return {
      ok: false,
      detail: exception instanceof DOMException && exception.name === "AbortError"
        ? "Backend yanıt vermedi. Sunucu bağlantısını kontrol edin."
        : "Backend'e ulaşılamadı. Sunucu adresini kontrol edin.",
    };
  }
}

async function refreshSession(): Promise<BackendAuthUser | null> {
  const session = await loadStoredUserAsync();
  if (!session?.refreshToken) return null;

  const response = await fetchWithTimeout(`${apiBaseUrl()}/erp/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refreshToken }),
  });
  if (!response.ok) return null;

  const next = toUser(await response.json() as AuthSessionResponse);
  saveSession(next);
  return next;
}

/** Fired when the access token is rejected and the refresh token cannot revive the session. */
export const SESSION_EXPIRED_EVENT = "docsbot:session-expired";

async function apiFetch(
  path: string,
  init: RequestInit = {},
  retryOnUnauthorized = true,
  timeoutMs?: number,
): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = (await loadStoredUserAsync())?.accessToken;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetchWithTimeout(`${apiBaseUrl()}${path}`, { ...init, headers }, timeoutMs);
  if (response.status === 401 && token && retryOnUnauthorized) {
    const refreshed = await refreshSession();
    if (refreshed?.accessToken) {
      const retryHeaders = new Headers(init.headers);
      retryHeaders.set("Authorization", `Bearer ${refreshed.accessToken}`);
      return fetchWithTimeout(`${apiBaseUrl()}${path}`, { ...init, headers: retryHeaders }, timeoutMs);
    }
    clearStoredSession();
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
  }
  return response;
}

/** Unauthenticated backend reachability probe for the home-screen status card. */
export async function getBackendHealth(): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(`${apiBaseUrl()}/health`);
    return response.ok;
  } catch {
    return false;
  }
}

async function errorText(response: Response, fallback: string): Promise<string> {
  if (response.status === 401) {
    return "Oturumunuz doğrulanamadı. Lütfen tekrar giriş yapın.";
  }
  const payload = await response.json().catch(() => null);
  if (payload && typeof payload.detail === "string") return payload.detail;
  if (payload && typeof payload.message === "string") return payload.message;
  return fallback;
}

async function accountRequestErrorText(response: Response): Promise<string> {
  const payload = await response.json().catch(() => null);
  const message = typeof payload?.message === "string"
    ? payload.message
    : typeof payload?.detail === "string"
      ? payload.detail
      : "";
  const fieldErrors = payload?.fieldErrors && typeof payload.fieldErrors === "object"
    ? payload.fieldErrors
    : {};
  if (fieldErrors.password) return "Şifre en az 10 karakter olmalıdır.";
  if (fieldErrors.email) return "Geçerli bir e-posta adresi yazın.";
  if (fieldErrors.name) return "Ad soyad zorunludur.";
  if (message.includes("already exists")) return "Bu e-posta adresiyle kayıt veya bekleyen talep zaten var.";
  if (message.includes("pending request")) return "Bu e-posta adresi için bekleyen bir talep zaten var.";
  return message || "Hesap talebi oluşturulamadı.";
}

async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void,
  signal: AbortSignal
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let eventName = "message";
  let dataLines: string[] = [];

  const dispatch = () => {
    if (dataLines.length === 0) {
      eventName = "message";
      return;
    }
    const raw = dataLines.join("\n");
    let data: unknown = raw;
    try {
      data = JSON.parse(raw);
    } catch {
      // SSE can legally carry plain text; keep it as-is.
    }
    onEvent({ eventName, data });
    eventName = "message";
    dataLines = [];
  };

  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() || "";
    for (const line of lines) {
      if (line === "") {
        dispatch();
      } else if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trimStart());
      }
    }
  }
  if (buffer.trim() || dataLines.length > 0) {
    dispatch();
  }
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs: number = API_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function toUser(session: AuthSessionResponse): BackendAuthUser {
  const role = session.role?.toLowerCase() === "admin" ? "admin" : "user";
  return {
    id: session.user_id,
    name: session.name,
    email: session.email || (role === "admin" ? "admin@mobit.com.tr" : ""),
    role,
    dept: role === "admin" ? "Yönetim" : "Operasyon",
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresIn: session.expires_in,
    refreshExpiresIn: session.refresh_expires_in,
  };
}

function adminUsername(identifier: string) {
  const trimmed = identifier.trim();
  if (trimmed.toLowerCase() === "admin@mobit.com.tr") return "admin";
  return trimmed.includes("@") ? trimmed.split("@")[0] : trimmed;
}

function usesNativeSessionStore() {
  return typeof window !== "undefined" && Capacitor.isNativePlatform();
}

function parseSession(raw: string | null): BackendAuthUser | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BackendAuthUser;
  } catch {
    return null;
  }
}
