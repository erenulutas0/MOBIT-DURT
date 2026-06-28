import { Capacitor } from "@capacitor/core";

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

export type ERPTask = {
  id: number;
  title: string;
  description: string | null;
  assigned_by_user_id: number | null;
  status: "todo" | "in_progress" | "blocked" | "pending_approval" | "done" | "overdue" | "cancelled" | string;
  priority: "low" | "normal" | "high" | "urgent" | string;
  deadline_at: string | null;
  completed_at: string | null;
  created_at: string;
  version?: number;
};

export type ERPTaskAssignment = {
  id: number;
  task_id: number;
  assignee_user_id: number | null;
  assignee_team_id: number | null;
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
  email_enabled: boolean;
}>;

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
  media_duration_ms?: number | null;
  read_at: string | null;
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

export type DocumentGroupMessage = {
  id: number;
  group_id: number;
  author_user_id: number | null;
  author_name: string;
  body: string;
  message_kind?: "text" | "voice" | string;
  media_mime_type?: string | null;
  media_data?: string | null;
  media_duration_ms?: number | null;
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

function apiBaseUrl() {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured) return configured.replace(/\/$/, "");
  return "http://127.0.0.1:8080";
}

export async function loginToBackend(identifier: string, password: string): Promise<BackendAuthUser> {
  const employee = await tryLogin("/erp/auth/login", { email: identifier, password });
  if (employee.ok) return toUser(employee.session);

  const username = adminUsername(identifier);
  const admin = await tryLogin("/erp/auth/admin-login", { username, password });
  if (admin.ok) return toUser(admin.session);

  throw new Error(employee.detail || admin.detail || "E-posta veya şifre hatalı.");
}

export function saveSession(user: BackendAuthUser) {
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function loadStoredUser(): BackendAuthUser | null {
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) as BackendAuthUser : null;
  } catch {
    return null;
  }
}

export function clearStoredSession() {
  window.localStorage.removeItem(SESSION_KEY);
}

export async function getERPOverview(): Promise<ERPOverview> {
  const response = await apiFetch("/erp/overview");
  if (!response.ok) throw new Error(await errorText(response, "ERP verisi yüklenemedi."));
  return response.json();
}

export async function getERPUsers(): Promise<ERPUser[]> {
  const response = await apiFetch("/erp/users");
  if (!response.ok) throw new Error(await errorText(response, "Kullanıcı listesi yüklenemedi."));
  return response.json();
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

export async function markERPNotificationRead(notificationId: number): Promise<ERPNotification> {
  const response = await apiFetch(`/erp/notifications/${notificationId}/read`, { method: "PATCH" });
  if (!response.ok) throw new Error(await errorText(response, "Bildirim okundu yapılamadı."));
  return response.json();
}

export async function markAllERPNotificationsRead(): Promise<void> {
  const response = await apiFetch("/erp/notifications/read-all", { method: "PATCH" });
  if (!response.ok) throw new Error(await errorText(response, "Bildirimler okundu yapılamadı."));
}

export async function getERPDirectMessages(limit = 100): Promise<ERPDirectMessage[]> {
  const response = await apiFetch(`/erp/messages?limit=${encodeURIComponent(String(limit))}`);
  if (!response.ok) throw new Error(await errorText(response, "Mesajlar yüklenemedi."));
  return response.json();
}

export async function sendERPDirectMessage(payload: {
  body: string;
  recipientUserId?: number | null;
  messageKind?: "text" | "voice" | "image" | "file";
  mediaMimeType?: string | null;
  mediaData?: string | null;
  mediaDurationMs?: number | null;
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
    }),
  });
  if (!response.ok) throw new Error(await errorText(response, "Mesaj gönderilemedi."));
  return response.json();
}

export async function getTenderDocumentsPage(offset = 0, limit = 25): Promise<TenderDocumentPage> {
  const response = await apiFetch(
    `/documents/page?offset=${encodeURIComponent(String(offset))}&limit=${encodeURIComponent(String(limit))}`
  );
  if (!response.ok) throw new Error(await errorText(response, "Belgeler yüklenemedi."));
  return response.json();
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

export async function getDocumentGroupMessages(groupId: number): Promise<DocumentGroupMessage[]> {
  const response = await apiFetch(`/document-groups/${groupId}/messages`);
  if (!response.ok) throw new Error(await errorText(response, "Alan mesajları yüklenemedi."));
  return response.json();
}

export async function sendDocumentGroupMessage(groupId: number, payload: string | {
  body: string;
  messageKind?: "text" | "voice";
  mediaMimeType?: string | null;
  mediaData?: string | null;
  mediaDurationMs?: number | null;
}): Promise<DocumentGroupMessage> {
  const body = typeof payload === "string"
    ? { body: payload }
    : {
        body: payload.body,
        message_kind: payload.messageKind || "text",
        media_mime_type: payload.mediaMimeType || null,
        media_data: payload.mediaData || null,
        media_duration_ms: payload.mediaDurationMs || null,
      };
  const response = await apiFetch(`/document-groups/${groupId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await errorText(response, "Alan mesajı gönderilemedi."));
  return response.json();
}

export async function deleteDocumentGroupMessage(groupId: number, messageId: number): Promise<void> {
  const response = await apiFetch(`/document-groups/${groupId}/messages/${messageId}`, { method: "DELETE" });
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
  const session = loadStoredUser();
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

async function apiFetch(path: string, init: RequestInit = {}, retryOnUnauthorized = true): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = loadStoredUser()?.accessToken;
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetchWithTimeout(`${apiBaseUrl()}${path}`, { ...init, headers });
  if (response.status === 401 && token && retryOnUnauthorized) {
    const refreshed = await refreshSession();
    if (refreshed?.accessToken) {
      const retryHeaders = new Headers(init.headers);
      retryHeaders.set("Authorization", `Bearer ${refreshed.accessToken}`);
      return fetchWithTimeout(`${apiBaseUrl()}${path}`, { ...init, headers: retryHeaders });
    }
    clearStoredSession();
  }
  return response;
}

async function errorText(response: Response, fallback: string): Promise<string> {
  const payload = await response.json().catch(() => null);
  if (payload && typeof payload.detail === "string") return payload.detail;
  if (payload && typeof payload.message === "string") return payload.message;
  return fallback;
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), API_TIMEOUT_MS);
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
