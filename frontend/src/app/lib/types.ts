import type {
  ApiDocument,
  ApiTender,
  ApiTree,
  ApiVaultNote,
  ERPAccountRequest,
  ERPNotification,
  ERPOverview,
  ERPTask,
  ERPUser,
} from "../api";

export type Page =
  | "home"
  | "erp-overview"
  | "employees"
  | "tasks"
  | "approvals"
  | "messages"
  | "company-chat"
  | "notifications"
  | "account-requests"
  | "tender-dashboard"
  | "telegram-groups"
  | "documents"
  | "folder-tree"
  | "upload"
  | "obsidian"
  | "tender-detail"
  | "ai-extraction"
  | "feedback";

export type LiveData = {
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

export type FilePreview = {
  title: string;
  filename: string;
  url: string;
  mimeType: string;
  blob: Blob;
};

export type EmployeeFocus = "overdue" | null;

export type OverdueEmployeeRow = {
  user: ERPUser;
  tasks: ERPTask[];
  nearestDeadline: string | null;
};

export type NotificationUrgency = "critical" | "high" | "normal";
