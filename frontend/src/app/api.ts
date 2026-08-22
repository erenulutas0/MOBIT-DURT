export type ApiDocument = {
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
  text_extracted_at?: string | null;
  text_extraction_error?: string | null;
  extracted_text_length?: number | null;
  fact_extraction_status?: string | null;
  fact_extracted_at?: string | null;
  fact_extraction_error?: string | null;
  ai_summary_status?: string | null;
  ai_summary_generated_at?: string | null;
  ai_summary_error?: string | null;
  ai_risk_status?: string | null;
  ai_risk_generated_at?: string | null;
  ai_risk_error?: string | null;
};

export type ApiTender = {
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

export type ApiTreeNode = {
  name: string;
  path: string;
  type: "folder" | "file" | "missing";
  size?: number | null;
  download_url?: string | null;
  view_url?: string | null;
  children: ApiTreeNode[];
};

export type ApiTree = {
  data_originals: ApiTreeNode;
  obsidian_vault: ApiTreeNode;
};

export type ApiVaultNote = {
  name: string;
  path: string;
  updated: string;
  linked_files: number;
  tags: string[];
};

export type ApiVaultNotes = {
  vault_root: string;
  notes: ApiVaultNote[];
};

export type ERPUser = {
  id: number;
  name: string;
  role: string;
  status: "online" | "offline" | "away" | string;
  email: string | null;
  phone: string | null;
  last_seen_at: string | null;
  approved_at: string | null;
  created_at: string;
};

export type ApiPageMeta = {
  total: number;
  offset: number;
  limit: number;
  has_next: boolean;
};

export type ApiDocumentPage = {
  page: ApiPageMeta;
  items: ApiDocument[];
};

export type ApiTenderPage = {
  page: ApiPageMeta;
  items: ApiTender[];
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

export type ERPWebPushConfig = {
  enabled: boolean;
  public_key: string;
};

export type ERPWebPushSubscriptionPayload = {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  user_agent?: string | null;
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

export type ERPUserPage = {
  page: ApiPageMeta;
  items: ERPUser[];
};

export type ERPTaskPage = {
  page: ApiPageMeta;
  items: ERPTask[];
};

export type ERPActivityEvent = {
  id: number;
  actor_type: string;
  actor_user_id: number | null;
  actor_name: string | null;
  event_type: string;
  subject_type: string;
  subject_id: string;
  task_id: number | null;
  details: string | null;
  created_at: string;
};

export type ERPActivityEventPage = {
  page: ApiPageMeta;
  items: ERPActivityEvent[];
};

export type ERPMetricCount = {
  key: string;
  count: number;
};

export type ERPAnalyticsSummary = {
  generated_at: string;
  users_total: number;
  active_users: number;
  teams_total: number;
  tasks_total: number;
  tasks_by_status: ERPMetricCount[];
  tasks_by_priority: ERPMetricCount[];
  overdue_tasks: number;
  due_soon_7d_tasks: number;
  blocked_tasks: number;
  pending_approval_tasks: number;
  unassigned_tasks: number;
  task_documents_total: number;
  unread_notifications_total: number;
  completion_rate: number;
};

export type ERPSession = {
  role: "admin" | "user" | string;
  name: string;
  user_id: number | null;
  email: string | null;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_expires_in?: number;
};

const SESSION_STORAGE_KEYS = ["docsbot.erp.session", "docsbot_session", "erpSession"];

function accessToken(): string | null {
  for (const key of SESSION_STORAGE_KEYS) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      const session = JSON.parse(raw) as ERPSession;
      if (session.access_token) return session.access_token;
    } catch {
      // Ignore stale legacy session values.
    }
  }
  return null;
}

function storedSession(): ERPSession | null {
  for (const key of SESSION_STORAGE_KEYS) {
    const raw = window.localStorage.getItem(key);
    if (!raw) continue;
    try {
      return JSON.parse(raw) as ERPSession;
    } catch {
      // Ignore stale legacy session values.
    }
  }
  return null;
}

function persistSession(session: ERPSession): void {
  SESSION_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
  window.localStorage.setItem(SESSION_STORAGE_KEYS[0], JSON.stringify(session));
}

/**
 * The refresh in flight, shared by everyone who asks while it is running.
 *
 * <p>A page fires several requests at once; with an expired access token they all come back 401 and
 * all call refresh with the same stored token. The first rotates it and the rest arrive holding one
 * the server has just revoked — indistinguishable from a stolen token, so the server revokes every
 * session for the account and the user is thrown back to the login screen having done nothing wrong.
 */
let refreshInFlight: Promise<ERPSession | null> | null = null;

async function refreshSession(): Promise<ERPSession | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = rotateSession().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

async function rotateSession(): Promise<ERPSession | null> {
  const session = storedSession();
  if (!session?.refresh_token) return null;
  const response = await fetch("/api/erp/auth/refresh", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!response.ok) return null;
  const next = await response.json() as ERPSession;
  persistSession(next);
  return next;
}

async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}, retryOnUnauthorized = true): Promise<Response> {
  const headers = new Headers(init.headers);
  const token = accessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(input, { ...init, headers });
  if (response.status === 401 && token) {
    if (retryOnUnauthorized) {
      const refreshed = await refreshSession();
      if (refreshed?.access_token) {
        const retryHeaders = new Headers(init.headers);
        retryHeaders.set("Authorization", `Bearer ${refreshed.access_token}`);
        return fetch(input, { ...init, headers: retryHeaders });
      }
    }
    SESSION_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    window.dispatchEvent(new CustomEvent("docsbot:session-expired"));
  }
  return response;
}

export type ERPNotificationStreamEvent =
  | { event: "ready"; recipient_id: number; connected_at: string }
  | { event: "notification"; notification: ERPNotification; unread_count: number }
  | { event: "unread_count"; recipient_id: number; unread_count: number };

type RawNotificationStreamPayload = {
  recipientId?: number;
  recipient_id?: number;
  connectedAt?: string;
  connected_at?: string;
  unreadCount?: number;
  unread_count?: number;
  id?: number;
  userId?: number;
  user_id?: number;
  type?: string;
  title?: string;
  body?: string | null;
  taskId?: number | null;
  task_id?: number | null;
  priority?: string | null;
  eventKey?: string | null;
  event_key?: string | null;
  readAt?: string | null;
  read_at?: string | null;
  createdAt?: string;
  created_at?: string;
};

function normalizeNotification(payload: RawNotificationStreamPayload): ERPNotification {
  return {
    id: Number(payload.id),
    user_id: Number(payload.user_id ?? payload.userId),
    type: String(payload.type ?? ""),
    title: String(payload.title ?? ""),
    body: payload.body ?? null,
    task_id: payload.task_id ?? payload.taskId ?? null,
    priority: payload.priority ?? null,
    event_key: payload.event_key ?? payload.eventKey ?? null,
    read_at: payload.read_at ?? payload.readAt ?? null,
    created_at: String(payload.created_at ?? payload.createdAt ?? new Date().toISOString()),
  };
}

function parseSseFrame(frame: string): { event: string; data: string } | null {
  let event = "message";
  const data: string[] = [];
  for (const rawLine of frame.split("\n")) {
    const line = rawLine.trimEnd();
    if (line.startsWith("event:")) {
      event = line.slice("event:".length).trim();
    } else if (line.startsWith("data:")) {
      data.push(line.slice("data:".length).trimStart());
    }
  }
  if (data.length === 0) return null;
  return { event, data: data.join("\n") };
}

function normalizeStreamEvent(event: string, payload: RawNotificationStreamPayload): ERPNotificationStreamEvent | null {
  if (event === "ready") {
    return {
      event: "ready",
      recipient_id: Number(payload.recipient_id ?? payload.recipientId),
      connected_at: String(payload.connected_at ?? payload.connectedAt ?? new Date().toISOString()),
    };
  }
  if (event === "notification") {
    return {
      event: "notification",
      notification: normalizeNotification(payload),
      unread_count: Number(payload.unread_count ?? payload.unreadCount ?? 0),
    };
  }
  if (event === "unread_count") {
    return {
      event: "unread_count",
      recipient_id: Number(payload.recipient_id ?? payload.recipientId),
      unread_count: Number(payload.unread_count ?? payload.unreadCount ?? 0),
    };
  }
  return null;
}

export async function subscribeERPNotificationStream(
  onEvent: (event: ERPNotificationStreamEvent) => void,
  signal: AbortSignal
): Promise<void> {
  const token = accessToken();
  if (!token) throw new Error("Notification stream requires an active session");
  const response = await fetch("/api/erp/notifications/stream", {
    headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
    signal,
  });
  if (response.status === 401) {
    SESSION_STORAGE_KEYS.forEach((key) => window.localStorage.removeItem(key));
    window.dispatchEvent(new CustomEvent("docsbot:session-expired"));
    throw new Error("Session expired");
  }
  if (!response.ok || !response.body) {
    throw new Error("Notification stream could not be opened");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (!signal.aborted) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const frame = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const parsed = parseSseFrame(frame);
      if (parsed) {
        try {
          const payload = JSON.parse(parsed.data) as RawNotificationStreamPayload;
          const normalized = normalizeStreamEvent(parsed.event, payload);
          if (normalized) onEvent(normalized);
        } catch {
          // Ignore malformed frames; the stream can continue.
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}

export type ERPAccountRequest = {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  status: "pending" | "approved" | "rejected" | string;
  requested_role: string;
  decided_by: string | null;
  decided_at: string | null;
  created_user_id: number | null;
  created_at: string;
};

export type ERPUserCreate = {
  name: string;
  role: "admin" | "owner" | "manager" | "employee" | string;
  status?: "online" | "offline" | "away" | string;
  email?: string | null;
  phone?: string | null;
};

export type ERPTaskCreate = {
  title: string;
  description?: string | null;
  assigned_by_user_id?: number | null;
  assignee_user_ids?: number[];
  assignee_team_ids?: number[];
  priority?: "low" | "normal" | "high" | "urgent" | string;
  deadline_at?: string | null;
  parent_task_id?: number | null;
};

export type TenderTaskCreateResponse = {
  task: ERPTask;
  document: ERPTaskDocument;
};

export type TenderMissingDocuments = {
  tender_id: string;
  required_types: string[];
  present_types: string[];
  missing_types: string[];
  document_count: number;
  status: "complete" | "missing" | string;
  recommendations: string[];
};

export type TenderTaskSuggestion = {
  document_id: number;
  tender_id: string;
  title: string;
  description: string;
  priority: "low" | "normal" | "high" | "urgent" | string;
  deadline_at: string | null;
  rationale: string;
};

export type TenderDocumentSearchResult = {
  id: number;
  tender_id: string;
  original_filename: string | null;
  document_type: string;
  organization: string | null;
  internal_unit: string | null;
  year: number | null;
  source: string;
  timestamp: string;
  text_extraction_status: string | null;
  rank: number;
  snippet: string | null;
};

export type TenderDocumentSearchResponse = {
  total: number;
  results: TenderDocumentSearchResult[];
};

export type TenderFacetValue = {
  value: string;
  count: number;
};

export type TenderDocumentFacets = {
  organizations: TenderFacetValue[];
  years: TenderFacetValue[];
  internal_units: TenderFacetValue[];
  document_types: TenderFacetValue[];
  statuses: TenderFacetValue[];
  timestamp_min: string | null;
  timestamp_max: string | null;
};

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
 * Ask the company's own documents a question. The answer is the clauses themselves with the file
 * each came from — for a şartname that is the product rather than a shortcoming, because a quoted
 * clause can be opened and checked while a paraphrase cannot.
 */
export async function askDocuments(question: string): Promise<DocumentAnswer> {
  const response = await apiFetch("/api/erp/assistant/documents/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question, limit: 5 }),
  });
  if (!response.ok) throw new Error("Belgelerde arama yapılamadı.");
  return response.json();
}

export type TenderNotice = {
  id: number;
  ikn: string;
  title: string;
  authority: string;
  province: string | null;
  category: string;
  category_label: string;
  bulletin_type: string;
  tender_at_text: string;
  tender_at: string | null;
  quantity: string;
  delivery_place: string;
  address: string;
  /** The preparation task, once somebody has opened one. */
  task_id: number | null;
};

export type TenderCategoryCount = { code: string; label: string; count: number };
export type TenderProvinceCount = { province: string; count: number };

/**
 * Published tenders from the Kamu İhale Bülteni. Only live announcements come back — cancellations
 * are stored but never offered as something to bid on.
 */
export async function getTenderNotices(filters: {
  province?: string | null;
  category?: string | null;
  type?: string | null;
  mine?: boolean;
  limit?: number;
} = {}): Promise<TenderNotice[]> {
  const query = new URLSearchParams();
  if (filters.province) query.set("province", filters.province);
  if (filters.category) query.set("category", filters.category);
  if (filters.type) query.set("type", filters.type);
  if (filters.mine) query.set("mine", "true");
  query.set("limit", String(filters.limit ?? 200));
  const response = await apiFetch(`/api/erp/bulletin/notices?${query}`);
  if (!response.ok) throw new Error("İhale bülteni alınamadı.");
  return response.json();
}

/** The whole announcement as printed, fetched only when one is opened — several KB each. */
export async function getTenderNoticeDetail(
  id: number,
): Promise<{ notice: TenderNotice; body: string; section: string }> {
  const response = await apiFetch(`/api/erp/bulletin/notices/${id}`);
  if (!response.ok) throw new Error("İlan açılamadı.");
  return response.json();
}

export async function getTenderCategories(): Promise<TenderCategoryCount[]> {
  const response = await apiFetch("/api/erp/bulletin/categories");
  if (!response.ok) throw new Error("Kategoriler alınamadı.");
  return response.json();
}

/** Live announcements per province — the numbers the map is drawn from. */
export async function getTenderProvinces(): Promise<TenderProvinceCount[]> {
  const response = await apiFetch("/api/erp/bulletin/provinces");
  if (!response.ok) throw new Error("İl dağılımı alınamadı.");
  return response.json();
}

export type TenderWatchProfile = {
  categories: string[];
  provinces: string[];
  notify_daily: boolean;
  matching_count: number;
  updated_by: string | null;
  updated_at: string | null;
};

/** Whether the company has narrowed the bulletin at all. Empty on both counts means it has not. */
export function tenderProfileIsSet(profile: TenderWatchProfile): boolean {
  return profile.categories.length > 0 || profile.provinces.length > 0;
}

/** What the company watches for. Empty lists mean the whole bulletin. */
export async function getTenderProfile(): Promise<TenderWatchProfile> {
  const response = await apiFetch("/api/erp/bulletin/profile");
  if (!response.ok) throw new Error("İhale profili alınamadı.");
  return response.json();
}

/** Admin only: this decides what every employee sees and what the morning notification says. */
export async function saveTenderProfile(payload: {
  categories: string[];
  provinces: string[];
  notifyDaily: boolean;
}): Promise<TenderWatchProfile> {
  const response = await apiFetch("/api/erp/bulletin/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      categories: payload.categories,
      provinces: payload.provinces,
      notify_daily: payload.notifyDaily,
    }),
  });
  if (!response.ok) throw new Error("İhale profili kaydedilemedi.");
  return response.json();
}

/** Pulls today's bulletins now instead of waiting for the morning run. Admin only. */
export async function refreshTenderBulletin(): Promise<number> {
  const response = await apiFetch("/api/erp/bulletin/refresh", { method: "POST" });
  if (!response.ok) throw new Error("Bülten çekilemedi.");
  const body = await response.json();
  return Number(body.stored ?? 0);
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
  same_as: string | null;
};

export type TenderBrief = {
  ready: boolean;
  message: string;
  tender_id: string;
  entries: TenderBriefEntry[];
};

/** The dozen facts a company decides on before bidding, each answered by the clause stating it. */
export async function getTenderBrief(tenderId: string): Promise<TenderBrief> {
  const response = await apiFetch(`/api/erp/assistant/tenders/${encodeURIComponent(tenderId)}/brief`);
  if (!response.ok) throw new Error("İhale künyesi çıkarılamadı.");
  return response.json();
}

export async function getDocuments(): Promise<ApiDocument[]> {
  const response = await apiFetch("/api/documents");
  if (!response.ok) throw new Error("Documents could not be loaded");
  return response.json();
}

export async function getDocumentsPage(offset = 0, limit = 50): Promise<ApiDocumentPage> {
  const response = await apiFetch(
    `/api/documents/page?offset=${encodeURIComponent(String(offset))}&limit=${encodeURIComponent(String(limit))}`,
  );
  if (!response.ok) throw new Error("Documents page could not be loaded");
  return response.json();
}

export async function searchTenderDocuments(params: {
  q?: string;
  organization?: string;
  year?: number;
  document_type?: string;
  tender_id?: string;
  limit?: number;
}): Promise<TenderDocumentSearchResponse> {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      query.set(key, String(value));
    }
  });
  const suffix = query.toString() ? `?${query.toString()}` : "";
  const response = await apiFetch(`/api/documents/search${suffix}`);
  if (!response.ok) throw new Error("Document search could not be loaded");
  return response.json();
}

export async function getTenderDocumentFacets(): Promise<TenderDocumentFacets> {
  const response = await apiFetch("/api/documents/facets");
  if (!response.ok) throw new Error("Document facets could not be loaded");
  return response.json();
}

export async function getTenders(): Promise<ApiTender[]> {
  const response = await apiFetch("/api/tenders");
  if (!response.ok) throw new Error("Tenders could not be loaded");
  return response.json();
}

export async function getTendersPage(offset = 0, limit = 50): Promise<ApiTenderPage> {
  const response = await apiFetch(
    `/api/tenders/page?offset=${encodeURIComponent(String(offset))}&limit=${encodeURIComponent(String(limit))}`,
  );
  if (!response.ok) throw new Error("Tenders page could not be loaded");
  return response.json();
}

export async function getTenderMissingDocuments(tenderId: string): Promise<TenderMissingDocuments> {
  const response = await apiFetch(`/api/tenders/${encodeURIComponent(tenderId)}/missing-documents`);
  if (!response.ok) throw new Error("Missing document analysis could not be loaded");
  return response.json();
}

export async function suggestTaskFromTenderDocument(documentId: number): Promise<TenderTaskSuggestion> {
  const response = await apiFetch(`/api/documents/${documentId}/suggest-task`, {
    method: "POST",
  });
  if (!response.ok) throw new Error("Task suggestion could not be generated");
  return response.json();
}

export async function getFolderTree(): Promise<ApiTree> {
  const response = await apiFetch("/api/dashboard/tree");
  if (!response.ok) throw new Error("Folder tree could not be loaded");
  return response.json();
}

export async function getVaultNotes(): Promise<ApiVaultNotes> {
  const response = await apiFetch("/api/dashboard/vault/notes");
  if (!response.ok) throw new Error("Vault notes could not be loaded");
  return response.json();
}

export async function getVaultNote(path: string): Promise<{ path: string; content: string }> {
  const response = await apiFetch(`/api/dashboard/vault/note?path=${encodeURIComponent(path)}`);
  if (!response.ok) throw new Error("Vault note could not be loaded");
  return response.json();
}

export async function getTenderDocumentBlob(
  documentId: number,
  download = false,
): Promise<Blob> {
  const suffix = download ? "" : "/view";
  const response = await apiFetch(`/api/dashboard/files/${documentId}${suffix}`);
  if (!response.ok) throw new Error(await response.text());
  return response.blob();
}

export async function getDashboardTreeFileBlob(url: string): Promise<Blob> {
  const apiUrl = url.startsWith("/api/")
    ? url
    : `/api${url.startsWith("/") ? url : `/${url}`}`;
  const response = await apiFetch(apiUrl);
  if (!response.ok) throw new Error(await response.text());
  return response.blob();
}

export async function createTaskFromTenderDocument(
  documentId: number,
  payload: ERPTaskCreate,
): Promise<TenderTaskCreateResponse> {
  const response = await apiFetch(`/api/erp/tasks/from-document/${documentId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function uploadTenderDocument(
  file: File,
  fields: {
    internal_unit: string;
    organization: string;
    year: number;
    tender_id?: string;
    caption?: string;
  },
): Promise<ApiDocument> {
  const body = new FormData();
  body.append("file", file);
  body.append("internal_unit", fields.internal_unit);
  body.append("organization", fields.organization);
  body.append("year", String(fields.year));
  if (fields.tender_id) body.append("tender_id", fields.tender_id);
  if (fields.caption) body.append("caption", fields.caption);
  const response = await apiFetch("/api/dashboard/upload", {
    method: "POST",
    body,
  });
  if (!response.ok) {
    const raw = await response.text();
    let message = "";
    try {
      const parsed = JSON.parse(raw) as { message?: string };
      message = parsed.message || "";
    } catch {
      // Fall back to the plain response body.
    }
    throw new Error(message || raw || "Belge yüklenemedi.");
  }
  return response.json();
}

export function openBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener,noreferrer");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function getERPOverview(): Promise<ERPOverview> {
  const response = await apiFetch("/api/erp/overview");
  if (!response.ok) throw new Error("ERP overview could not be loaded");
  return response.json();
}

export async function getERPUsersPage(offset = 0, limit = 50): Promise<ERPUserPage> {
  const response = await apiFetch(
    `/api/erp/users/page?offset=${encodeURIComponent(String(offset))}&limit=${encodeURIComponent(String(limit))}`,
  );
  if (!response.ok) throw new Error("ERP users page could not be loaded");
  return response.json();
}

export async function getERPTasksPage(offset = 0, limit = 50): Promise<ERPTaskPage> {
  const response = await apiFetch(
    `/api/erp/tasks/page?offset=${encodeURIComponent(String(offset))}&limit=${encodeURIComponent(String(limit))}`,
  );
  if (!response.ok) throw new Error("ERP tasks page could not be loaded");
  return response.json();
}

export async function getERPAnalyticsSummary(): Promise<ERPAnalyticsSummary> {
  const response = await apiFetch("/api/erp/analytics/summary");
  if (!response.ok) throw new Error("ERP analytics summary could not be loaded");
  return response.json();
}

export type ERPFeedback = {
  id: number;
  user_id: number | null;
  user_name: string;
  category: "bug" | "suggestion" | "question" | "other" | string;
  message: string;
  app_version: string | null;
  status: "new" | "read" | "resolved" | string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
};

export type ERPAnnouncement = {
  id: number;
  title: string;
  body: string;
  updated_at: string;
};

export async function getERPFeedback(status = "all"): Promise<ERPFeedback[]> {
  const response = await apiFetch(`/api/erp/feedback?status=${encodeURIComponent(status)}`);
  if (!response.ok) throw new Error("Dönütler yüklenemedi");
  return response.json();
}

export async function updateERPFeedbackStatus(feedbackId: number, status: string): Promise<ERPFeedback> {
  const response = await apiFetch(`/api/erp/feedback/${feedbackId}/status`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) throw new Error("Dönüt durumu güncellenemedi");
  return response.json();
}

export async function getERPAnnouncement(): Promise<ERPAnnouncement | null> {
  const response = await apiFetch("/api/erp/announcement");
  if (!response.ok) throw new Error("Duyuru yüklenemedi");
  const data = await response.json();
  return data?.announcement ?? null;
}

export async function publishERPAnnouncement(title: string, body: string): Promise<ERPAnnouncement | null> {
  const response = await apiFetch("/api/erp/announcement", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, body }),
  });
  if (!response.ok) throw new Error("Duyuru yayınlanamadı");
  const data = await response.json();
  return data?.announcement ?? null;
}

export async function getERPActivity(offset = 0, limit = 50): Promise<ERPActivityEventPage> {
  const params = new URLSearchParams({
    offset: String(offset),
    limit: String(limit),
  });
  const response = await apiFetch(`/api/erp/activity?${params.toString()}`);
  if (!response.ok) throw new Error("ERP activity could not be loaded");
  return response.json();
}

export async function createERPUser(payload: ERPUserCreate): Promise<ERPUser> {
  const response = await apiFetch("/api/erp/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function deleteERPUser(userId: number): Promise<void> {
  const response = await apiFetch(`/api/erp/users/${userId}`, { method: "DELETE" });
  if (!response.ok) throw new Error(await response.text());
}

export async function updateERPPresence(userId: number, status: "online" | "offline" | "away"): Promise<ERPUser> {
  const response = await apiFetch(`/api/erp/users/${userId}/presence`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function createERPTask(payload: ERPTaskCreate): Promise<ERPTask> {
  const response = await apiFetch("/api/erp/tasks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function addERPTaskDependency(taskId: number, predecessorTaskId: number): Promise<ERPTaskDependency> {
  const response = await apiFetch(`/api/erp/tasks/${taskId}/dependencies`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ predecessor_task_id: predecessorTaskId }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function removeERPTaskDependency(taskId: number, predecessorTaskId: number): Promise<void> {
  const response = await apiFetch(`/api/erp/tasks/${taskId}/dependencies/${predecessorTaskId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(await response.text());
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
  const response = await apiFetch("/api/erp/company-chat/messages");
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function sendCompanyChatMessage(body: string): Promise<CompanyChatMessage> {
  const response = await apiFetch("/api/erp/company-chat/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function updateERPTaskStatus(taskId: number, status: string): Promise<ERPTask> {
  const response = await apiFetch(`/api/erp/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export interface ERPTaskEditPayload {
  title?: string;
  description?: string;
  priority?: string;
  deadline_at?: string;
  clear_deadline?: boolean;
  status?: string;
}

// Admin-only full edit; omitted fields stay unchanged. Changing the deadline
// re-arms the backend due-soon/overdue alert ladder for the task.
export async function updateERPTaskDetails(taskId: number, payload: ERPTaskEditPayload): Promise<ERPTask> {
  const response = await apiFetch(`/api/erp/tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function uploadERPTaskDocument(taskId: number, file: File): Promise<ERPTaskDocument> {
  const body = new FormData();
  body.append("file", file);
  const response = await apiFetch(`/api/erp/tasks/${taskId}/documents`, {
    method: "POST",
    body,
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function getERPTaskDocumentBlob(
  documentId: number,
  download = false,
): Promise<Blob> {
  const response = await apiFetch(
    `/api/erp/task-documents/${documentId}/content?download=${download}`,
  );
  if (!response.ok) throw new Error(await response.text());
  return response.blob();
}

export async function deleteERPTaskDocument(documentId: number): Promise<void> {
  const response = await apiFetch(`/api/erp/task-documents/${documentId}`, {
    method: "DELETE",
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function requestERPTaskCompletion(taskId: number, userId: number | null, note?: string): Promise<ERPTask> {
  const response = await apiFetch(`/api/erp/tasks/${taskId}/completion-request`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: userId, note: note || null }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function approveERPTaskCompletion(taskId: number, adminName = "admin"): Promise<ERPTask> {
  const response = await apiFetch(`/api/erp/tasks/${taskId}/approve-completion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ admin_name: adminName }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function rejectERPTaskCompletion(taskId: number, adminName = "admin", note?: string): Promise<ERPTask> {
  const response = await apiFetch(`/api/erp/tasks/${taskId}/reject-completion`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ admin_name: adminName, note: note || null }),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function createERPTaskComment(taskId: number, payload: { author_user_id?: number | null; body: string; kind?: string }): Promise<ERPTaskComment> {
  const response = await apiFetch(`/api/erp/tasks/${taskId}/comments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function getERPNotifications(userId?: number | null): Promise<ERPNotification[]> {
  const query = userId === undefined || userId === null ? "" : `?user_id=${encodeURIComponent(String(userId))}`;
  const response = await apiFetch(`/api/erp/notifications${query}`);
  if (!response.ok) throw new Error("Notifications could not be loaded");
  return response.json();
}

export async function markERPNotificationRead(notificationId: number): Promise<ERPNotification> {
  const response = await apiFetch(`/api/erp/notifications/${notificationId}/read`, { method: "PATCH" });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function markAllERPNotificationsRead(): Promise<{ updated_count: number }> {
  const response = await apiFetch("/api/erp/notifications/read-all", { method: "PATCH" });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function getERPNotificationPreferences(): Promise<ERPNotificationPreference> {
  const response = await apiFetch("/api/erp/notification-preferences");
  if (!response.ok) throw new Error("Notification preferences could not be loaded");
  return response.json();
}

export async function updateERPNotificationPreferences(
  payload: ERPNotificationPreferenceUpdate
): Promise<ERPNotificationPreference> {
  const response = await apiFetch("/api/erp/notification-preferences", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function getERPWebPushConfig(): Promise<ERPWebPushConfig> {
  const response = await apiFetch("/api/erp/web-push/vapid-public-key");
  if (!response.ok) throw new Error("Web Push configuration could not be loaded");
  return response.json();
}

export async function registerERPWebPushSubscription(
  payload: ERPWebPushSubscriptionPayload
): Promise<{ id: number; user_id: number; endpoint: string; active: boolean }> {
  const response = await apiFetch("/api/erp/web-push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function deleteERPWebPushSubscription(endpoint: string): Promise<void> {
  const response = await apiFetch("/api/erp/web-push/subscriptions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint }),
  });
  if (!response.ok) throw new Error(await response.text());
}

export async function loginERPAdmin(username: string, password: string): Promise<ERPSession> {
  const response = await apiFetch("/api/erp/auth/admin-login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!response.ok) throw new Error("Admin bilgileri hatali");
  return response.json();
}

export async function loginERPUser(email: string, password: string): Promise<ERPSession> {
  const response = await apiFetch("/api/erp/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) throw new Error("Calisan girisi basarisiz");
  return response.json();
}

export async function logoutERP(refreshToken?: string | null): Promise<void> {
  if (!refreshToken) return;
  await fetch("/api/erp/auth/logout", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
}

export async function createERPAccountRequest(payload: { name: string; email: string; password: string; phone?: string | null }): Promise<ERPAccountRequest> {
  const response = await apiFetch("/api/erp/account-requests", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function getERPAccountRequests(status = "pending"): Promise<ERPAccountRequest[]> {
  const response = await apiFetch(`/api/erp/account-requests?status=${encodeURIComponent(status)}`);
  if (!response.ok) throw new Error("Hesap istekleri yuklenemedi");
  return response.json();
}

export async function approveERPAccountRequest(requestId: number): Promise<ERPUser> {
  const response = await apiFetch(`/api/erp/account-requests/${requestId}/approve`, { method: "POST" });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export async function rejectERPAccountRequest(requestId: number): Promise<ERPAccountRequest> {
  const response = await apiFetch(`/api/erp/account-requests/${requestId}/reject`, { method: "POST" });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

export function formatBytes(value: number | null | undefined): string {
  if (!value) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function fileType(document: ApiDocument): string {
  const name = document.stored_filename || document.original_filename || "";
  const extension = name.includes(".") ? name.split(".").pop() : "";
  return (extension || document.mime_type || "FILE").toUpperCase();
}

export function displayStatus(status: string): "classified" | "processing" | "unclassified" {
  if (status === "stored" || status === "duplicate") return "classified";
  if (status === "received") return "processing";
  return "unclassified";
}

// ── İhale sonuçları, teklif hafızası ve rakipler ─────────────────────────────
// The half of the bulletin the web panel never had. An owner sits in front of this screen rather
// than a phone, and these are the three things they open it for: what work went for, what we
// offered, and who keeps taking it.

export type TenderResult = {
  id: number;
  ikn: string;
  title: string | null;
  authority: string | null;
  province: string | null;
  category: string;
  category_label: string;
  bulletin_type: string;
  work_place: string | null;
  procedure: string | null;
  tender_date: string | null;
  contract_date: string | null;
  estimated_cost: string | null;
  contract_amount: string | null;
  currency: string | null;
  bid_count: number | null;
  valid_bid_count: number | null;
  winner: string | null;
  winner_province: string | null;
  /**
   * How far under the estimate the work was let. Null means the server refused to say — a lot
   * award, a missing figure — and null is not zero: a tender let at the estimate is a real 0%.
   */
  discount_percent: string | null;
  partial_award: boolean;
};

export async function getTenderResults(filters: {
  province?: string | null;
  category?: string | null;
  type?: string | null;
  mine?: boolean;
  limit?: number;
} = {}): Promise<TenderResult[]> {
  const query = new URLSearchParams();
  if (filters.province) query.set("province", filters.province);
  if (filters.category) query.set("category", filters.category);
  if (filters.type) query.set("type", filters.type);
  if (filters.mine) query.set("mine", "true");
  query.set("limit", String(filters.limit ?? 100));
  const response = await apiFetch(`/api/erp/bulletin/results?${query}`);
  if (!response.ok) throw new Error("İhale sonuçları alınamadı.");
  return response.json();
}

export type AuthorityProfile = {
  authority: string;
  total_awards: number;
  sample_size: number;
  /** Null below three usable awards: two contracts have a middle, but not a habit. */
  median_discount: string | null;
  lowest_discount: string | null;
  highest_discount: string | null;
  average_bidders: string | null;
  top_winners: Array<{ winner: string; awards: number }>;
};

export async function getAuthorityProfile(authority: string): Promise<AuthorityProfile> {
  const response = await apiFetch(
    `/api/erp/bulletin/authorities/profile?authority=${encodeURIComponent(authority)}`
  );
  if (!response.ok) throw new Error("İdare geçmişi alınamadı.");
  return response.json();
}

export type BidOutcomeRow = {
  id: number;
  ikn: string;
  title: string | null;
  authority: string | null;
  province: string | null;
  bid_amount: string;
  bid_at: string;
  status: "PENDING" | "WON" | "LOST" | "UNCLEAR";
  winning_amount: string | null;
  winner: string | null;
  gap_percent: string | null;
  note: string | null;
};

/**
 * The company's own bid on one tender. Never leaves the company, and is the one number no bulletin
 * service has — which is why the loss margin can only be worked out here.
 */
export type TenderBid = {
  id: number | null;
  ikn: string | null;
  amount: string | null;
  bid_at: string | null;
  note: string | null;
  outcome: string | null;
  recorded_by: string | null;
};

export async function getBidForNotice(noticeId: number): Promise<TenderBid> {
  const response = await apiFetch(`/api/erp/bulletin/notices/${noticeId}/bid`);
  if (!response.ok) throw new Error("Teklif kaydı alınamadı.");
  return response.json();
}

export async function recordBid(noticeId: number, payload: {
  amount: number;
  bid_at?: string | null;
  note?: string | null;
  outcome?: string | null;
}): Promise<TenderBid> {
  const response = await apiFetch(`/api/erp/bulletin/notices/${noticeId}/bid`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Teklif kaydedilemedi.");
  return response.json();
}

export type CompanyCredential = {
  id: number;
  name: string;
  kind: string | null;
  issued_at: string | null;
  valid_until: string | null;
  document_id: number | null;
  note: string | null;
  /** Negative once lapsed; null when the document has no expiry, which is not urgency. */
  days_remaining: number | null;
};

export type CompanyCredentialInput = {
  name: string;
  kind?: string | null;
  issued_at?: string | null;
  valid_until?: string | null;
  note?: string | null;
};

/** İmza sirküleri, oda kaydı, borcu yoktur — the paperwork an idare asks for at the door. */
export async function getCompanyCredentials(): Promise<CompanyCredential[]> {
  const response = await apiFetch("/api/erp/company-credentials");
  if (!response.ok) throw new Error("Belgeler yüklenemedi.");
  return response.json();
}

export async function createCompanyCredential(
  input: CompanyCredentialInput
): Promise<CompanyCredential> {
  const response = await apiFetch("/api/erp/company-credentials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw new Error("Belge kaydedilemedi.");
  return response.json();
}

export async function deleteCompanyCredential(id: number): Promise<void> {
  const response = await apiFetch(`/api/erp/company-credentials/${id}`, { method: "DELETE" });
  if (!response.ok) throw new Error("Belge silinemedi.");
}

/**
 * What the company can prove about itself when an idare asks.
 *
 * <p>Every figure is nullable and a missing one means "not entered" rather than zero. The yeterlik
 * checklist has to be able to say "bilinmiyor" instead of "you do not qualify", because the second
 * is a claim and a wrong one sends a company away from a tender it could have won.
 */
export type CompanyQualification = {
  experience_amount: string | null;
  experience_date: string | null;
  experience_subject: string | null;
  turnover_last_year: string | null;
  turnover_previous_year: string | null;
  sector_turnover: string | null;
  current_ratio: string | null;
  equity_ratio: string | null;
  bank_debt_ratio: string | null;
  bank_reference_limit: string | null;
  updated_by: string | null;
  updated_at: string | null;
};

/**
 * Whether the company has told us anything at all about what it can prove.
 *
 * <p>Any one figure counts. A company that has entered its turnover and nothing else still gets a
 * real answer on every tender whose only bar is turnover, and calling that "not set up" would send
 * it back to a form it has already filled in as far as it can. The record itself always exists —
 * it is a single row created empty — so its presence says nothing and the figures have to be read.
 */
export function companyQualificationIsSet(value: CompanyQualification): boolean {
  return [
    value.experience_amount, value.turnover_last_year, value.turnover_previous_year,
    value.sector_turnover, value.current_ratio, value.equity_ratio,
    value.bank_debt_ratio, value.bank_reference_limit,
  ].some(figure => figure !== null && figure !== "");
}

export async function getCompanyQualification(): Promise<CompanyQualification> {
  const response = await apiFetch("/api/erp/bulletin/company-qualification");
  if (!response.ok) throw new Error("Yeterlik bilgileri alınamadı.");
  return response.json();
}

export async function saveCompanyQualification(
  payload: Partial<CompanyQualification>
): Promise<CompanyQualification> {
  const response = await apiFetch("/api/erp/bulletin/company-qualification", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("Yeterlik bilgileri kaydedilemedi.");
  return response.json();
}

export type BidMemory = {
  total_bids: number;
  won: number;
  lost: number;
  pending: number;
  unclear: number;
  median_gap_percent: string | null;
  smallest_gap_percent: string | null;
  rivals: Array<{ rival: string; beat_us: number; median_gap_percent: string | null }>;
  authorities: Array<{
    authority: string; bids: number; won: number; median_gap_percent: string | null;
  }>;
  outcomes: BidOutcomeRow[];
};

export async function getBidMemory(): Promise<BidMemory> {
  const response = await apiFetch("/api/erp/bulletin/bids");
  if (!response.ok) throw new Error("Teklif geçmişi alınamadı.");
  return response.json();
}

export type BossBriefing = {
  period_start: string | null;
  bids_this_month: number;
  won_this_month: number;
  won_amount_this_month: string;
  won_amount_from_our_own_figure: number;
  awaiting_result: number;
  awaiting_amount: string;
  pending_approval: number;
  overdue_tasks: number;
  due_this_week: number;
  lapsed_credentials: number;
  expiring_credentials: number;
  upcoming: Array<{
    notice_id: number; ikn: string; title: string | null; authority: string | null;
    tender_at_text: string | null; tender_at: string | null; task_id: number | null;
  }>;
};

export async function getBossBriefing(): Promise<BossBriefing> {
  const response = await apiFetch("/api/erp/bulletin/briefing");
  if (!response.ok) throw new Error("Şirket özeti alınamadı.");
  return response.json();
}

export type RivalMatch = { winner: string; contracts: number };

export type RivalProfile = {
  winner: string;
  contracts: number;
  total_amount: string;
  /** The currency the total is in: whichever this firm has the most contracts in. */
  currency: string;
  /** Contracts in another currency, left out of the total rather than added to it. */
  contracts_in_other_currencies: number;
  distinct_authorities: number;
  median_discount: string | null;
  /** How many of our own bids this firm has taken — the line no public record can produce. */
  beat_us: number;
  authorities: Array<{ name: string; contracts: number }>;
  provinces: Array<{ name: string; contracts: number }>;
  recent: Array<{
    id: number | null; ikn: string; title: string | null; authority: string | null;
    province: string | null; amount: string | null; currency: string | null;
    contract_date: string | null; discount_percent: string | null;
  }>;
};

export async function searchRivals(term: string): Promise<RivalMatch[]> {
  const response = await apiFetch(`/api/erp/bulletin/rivals?q=${encodeURIComponent(term)}`);
  if (!response.ok) throw new Error("Firma araması yapılamadı.");
  return response.json();
}

export async function getRivalProfile(winner: string): Promise<RivalProfile> {
  const response = await apiFetch(
    `/api/erp/bulletin/rivals/profile?winner=${encodeURIComponent(winner)}`
  );
  if (!response.ok) throw new Error("Firma bilgisi alınamadı.");
  return response.json();
}

