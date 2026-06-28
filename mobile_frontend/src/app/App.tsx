import { useEffect, useMemo, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { ImageWithFallback } from "@/app/components/figma/ImageWithFallback";
import mobitLogo from "@/imports/image.png";
import {
  addDocumentGroupMember,
  clearStoredSession,
  createCompanyWorkflow,
  createDocumentGroup,
  deleteDocumentGroupDocument,
  deleteDocumentGroupMessage,
  registerMobilePushToken,
  getDocumentGroup,
  getDocumentGroupFileBlob,
  getDocumentGroupMessages,
  getDocumentGroups,
  getERPDirectMessages,
  getERPNotificationPreferences,
  getERPOverview,
  getERPUsers,
  getFolderTree,
  getTenderDocumentsPage,
  getTendersPage,
  getVaultNotes,
  loadStoredUser,
  loginToBackend,
  markAllERPNotificationsRead,
  markERPNotificationRead,
  removeDocumentGroupMember,
  saveSession,
  sendERPDirectMessage,
  unregisterMobilePushToken,
  updateERPNotificationPreferences,
  updateERPUserDocumentNetworkVisibility,
  updateDocumentGroup,
  sendDocumentGroupMessage,
  uploadDocumentGroupFile,
} from "./api";
import type { DocumentGroupDetail, DocumentGroupDocument, DocumentGroupMember, DocumentGroupMessage, DocumentGroupSummary, ERPDirectMessage, ERPNotificationPreference, ERPOverview, ERPTask, ERPUser, FolderTree, Tender, TenderDocument, TreeNode, VaultNote } from "./api";
import {
  Users, ClipboardList, CheckSquare, MessageSquare,
  Bell, UserPlus, FileText, Send, FolderOpen, Upload, BookOpen,
  Cpu, ChevronRight, Search, Building2, Bot,
  AlertTriangle, CheckCircle2, XCircle, MoreHorizontal,
  Download, Eye, Link, Tag, Paperclip,
  Wifi, CalendarDays, GitBranch,
  Settings, ChevronLeft, X, Plus,
  Filter, Clock, Shield,
  HelpCircle, Home, User, LogOut, Lock, Mail,
  Flag, Menu, Command, ZoomIn, ZoomOut, LocateFixed, Share2,
  Mic, Square, Image as ImageIcon, Trash2,
} from "lucide-react";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

// ─── TYPES ────────────────────────────────────────────────────────────────────
type Role = "admin" | "user";
type AuthUser = { id: number | null; name: string; email: string; role: Role; dept: string };

type Tab = "home" | "erp" | "tender" | "messages" | "profile";
type ERPScreen =
  | "overview" | "employees" | "employee-detail"
  | "tasks" | "task-detail" | "approvals" | "approval-detail"
  | "account-requests" | "notifications";
type TenderScreen =
  | "dashboard" | "documents" | "document-detail"
  | "document-groups" | "folder-tree" | "upload"
  | "obsidian" | "tender-detail" | "ai-extraction";
type MsgScreen = "inbox" | "thread" | "room-thread";
type DirectMessageOpenRequest = { messageId: number; nonce: number };
type RecordingTarget = "direct" | "room";
type RoomDeleteTarget =
  | { kind: "message"; id: number; title: string }
  | { kind: "document"; id: number; title: string };
type RoomActionTarget = RoomDeleteTarget & { action: "options" | "delete" | "forward" };
type NotificationPreferenceToggleKey =
  | "task_assigned_enabled"
  | "manager_message_enabled"
  | "employee_help_message_enabled"
  | "completion_updates_enabled"
  | "deadline_alerts_enabled"
  | "browser_push_enabled"
  | "email_enabled";

// ─── STATUS MAP ───────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { bg: string; text: string; dot: string }> = {
  "Online":             { bg: "bg-emerald-500/15", text: "text-emerald-400", dot: "bg-emerald-500" },
  "Away":               { bg: "bg-amber-500/15",   text: "text-amber-400",   dot: "bg-amber-400" },
  "Offline":            { bg: "bg-slate-700/60",   text: "text-slate-400",   dot: "bg-slate-500" },
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

const TASK_STATUS_LABELS: Record<string, string> = {
  todo: "Yapılacak",
  in_progress: "Devam Ediyor",
  blocked: "Engelli",
  pending_approval: "Tamamlama Talep",
  done: "Tamamlandı",
  overdue: "Gecikmiş",
  cancelled: "İptal",
};

const TASK_PRIORITY_LABELS: Record<string, string> = {
  low: "Düşük",
  normal: "Normal",
  high: "Yüksek",
  urgent: "Acil",
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
const APP_VERSION = "0.0.1";
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

async function registerNativePushNotifications() {
  const platform = nativeMobilePlatform();
  if (!platform || !NATIVE_PUSH_ENABLED) return;

  let permissions = await PushNotifications.checkPermissions();
  if (permissions.receive === "prompt") {
    permissions = await PushNotifications.requestPermissions();
  }
  if (permissions.receive !== "granted") return;

  await PushNotifications.removeAllListeners();
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
  await PushNotifications.addListener("pushNotificationActionPerformed", () => undefined);
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

function taskStatusLabel(status: string) {
  return TASK_STATUS_LABELS[status] || status;
}

function taskPriorityLabel(priority: string) {
  return TASK_PRIORITY_LABELS[priority] || priority;
}

function formatDate(value: string | null) {
  if (!value) return "Tarih yok";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tarih yok";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatFileSize(value: number | null) {
  if (!value) return "Boyut yok";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function tenderStatusLabel(status: string) {
  if (status === "classified") return "Sınıflandırıldı";
  if (status === "unclassified") return "Sınıflandırılmamış";
  if (status === "active") return "Aktif";
  return status;
}

function taskAssigneeName(task: ERPTask, overview: ERPOverview | null) {
  const assignment = overview?.assignments.find(item => item.task_id === task.id && item.assignee_user_id);
  if (!assignment?.assignee_user_id) return "Atanmamış";
  return overview?.users.find(item => item.id === assignment.assignee_user_id)?.name || "Atanmamış";
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

function Avatar({ name, size = "sm", color, src }: { name: string; size?: "sm" | "md" | "lg"; color?: string; src?: string | null }) {
  const sz = size === "sm" ? "w-8 h-8 text-xs" : size === "md" ? "w-10 h-10 text-sm" : "w-16 h-16 text-lg";
  const bg = color || "bg-teal-600";
  if (src) {
    return <img src={src} alt={name} className={`${sz} rounded-full object-cover shrink-0`} />;
  }
  return (
    <div className={`${sz} rounded-full ${bg} flex items-center justify-center font-bold text-white shrink-0`}>
      {name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
    </div>
  );
}

function Card({ children, className = "", onPress }: {
  children: React.ReactNode; className?: string; onPress?: () => void;
}) {
  return (
    <div onClick={onPress}
      className={`bg-card rounded-xl border border-border ${onPress ? "cursor-pointer active:scale-[0.98] transition-transform" : ""} ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {action && <button onClick={onAction} className="text-xs text-primary font-medium">{action}</button>}
    </div>
  );
}

function KPIRow({ items }: { items: { label: string; value: string | number; color?: string; icon?: any }[] }) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${items.length}, 1fr)` }}>
      {items.map((item, i) => {
        const Icon = item.icon;
        return (
          <Card key={i} className="p-3">
            {Icon && <Icon className={`w-4 h-4 mb-2 ${item.color || "text-primary"}`} />}
            <p className={`text-xl font-bold font-mono ${item.color || "text-foreground"}`}>{item.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{item.label}</p>
          </Card>
        );
      })}
    </div>
  );
}

function TopBar({ title, onBack, actions }: {
  title: string | React.ReactNode; onBack?: () => void; actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center h-14 px-4 gap-3 border-b border-border bg-background sticky top-0 z-10 shrink-0">
      {onBack && (
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-muted text-foreground -ml-1 shrink-0">
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        {typeof title === "string"
          ? <h1 className="text-base font-semibold text-foreground truncate">{title}</h1>
          : title}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

function EmptyState({ icon: Icon, title, desc, action, onAction }: {
  icon: any; title: string; desc: string; action?: string; onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold text-foreground mb-1">{title}</p>
      <p className="text-xs text-muted-foreground mb-4">{desc}</p>
      {action && onAction && (
        <button onClick={onAction} className="px-4 py-2 bg-primary rounded-xl text-xs font-semibold text-white">
          {action}
        </button>
      )}
    </div>
  );
}

function isImageDocument(document: DocumentGroupDocument) {
  const name = `${document.document.original_filename || document.document.stored_filename || ""}`.toLowerCase();
  const mime = `${document.document.mime_type || ""}`.toLowerCase();
  return mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);
}

function isPdfFile(file: { name: string; type: string }) {
  return file.type.toLowerCase().includes("pdf") || file.name.toLowerCase().endsWith(".pdf");
}

function groupDocumentsByYearTender(documents: DocumentGroupDocument[]) {
  const grouped = new Map<string, Map<string, DocumentGroupDocument[]>>();
  for (const item of documents) {
    const year = String(item.year || item.document.year || new Date(item.created_at).getFullYear());
    const tenderId = item.tender_id || item.document.tender_id || "Genel";
    if (!grouped.has(year)) grouped.set(year, new Map());
    const tenders = grouped.get(year)!;
    if (!tenders.has(tenderId)) tenders.set(tenderId, []);
    tenders.get(tenderId)!.push(item);
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([year, tenders]) => ({
      year,
      tenders: [...tenders.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([tenderId, items]) => ({ tenderId, items })),
    }));
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Dosya okunamadı."));
    reader.readAsDataURL(blob);
  });
}

function formatVoiceDuration(milliseconds?: number | null) {
  const totalSeconds = Math.max(0, Math.round((milliseconds || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function microphoneErrorMessage(exception?: unknown) {
  if (exception instanceof DOMException && (exception.name === "NotAllowedError" || exception.name === "SecurityError")) {
    return "Mikrofon izni kapalı. Telefon ayarlarından Mobit uygulaması için mikrofon iznini açın ve tekrar deneyin.";
  }
  if (exception instanceof Error && /permission|denied|notallowed/i.test(exception.message)) {
    return "Mikrofon izni alınamadı. Telefon ayarlarından Mobit uygulamasına mikrofon izni verin.";
  }
  return "Ses kaydı başlatılamadı. Mikrofon iznini ve cihaz ayarlarını kontrol edin.";
}

function companySlug(value: string) {
  return value
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/[^A-ZÇĞİÖŞÜ0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "SIRKET";
}

function readNumberSet(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    const values = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(values) ? values.filter(value => Number.isFinite(value)) : []);
  } catch {
    return new Set<number>();
  }
}

function writeNumberSet(key: string, values: Set<number>) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...values]));
  } catch {
    // Local hiding is a convenience feature; failing storage must not block chat.
  }
}

function profilePhotoKey(userIdOrEmail: number | string | null | undefined) {
  return `docsbot.profile.photo.${userIdOrEmail || "anon"}`;
}

function readProfilePhoto(userIdOrEmail: number | string | null | undefined) {
  try {
    return window.localStorage.getItem(profilePhotoKey(userIdOrEmail)) || "";
  } catch {
    return "";
  }
}

function writeProfilePhoto(userIdOrEmail: number | string | null | undefined, value: string) {
  try {
    window.localStorage.setItem(profilePhotoKey(userIdOrEmail), value);
  } catch {
    // The selected image is kept local; storage pressure should not break profile rendering.
  }
}

function flattenFolders(node: TreeNode | null | undefined, depth = 0): { path: string; name: string; depth: number }[] {
  if (!node || node.type !== "folder") return [];
  const self = node.path ? [{ path: node.path, name: node.name, depth }] : [];
  return [
    ...self,
    ...node.children.flatMap(child => flattenFolders(child, depth + 1)),
  ];
}

function CompanyWorkflowPicker({
  tenders,
  value,
  onSelect,
  onCreateCompany,
}: {
  tenders: Tender[];
  value: string;
  onSelect: (next: { tenderId: string; companyName: string; year?: number }) => void;
  onCreateCompany?: (companyName: string) => Promise<Tender>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const companyOptions = useMemo(() => {
    const companies = new Map<string, Tender>();
    for (const tender of tenders) {
      const key = tender.organization.trim().toLocaleLowerCase("tr-TR");
      const current = companies.get(key);
      if (!current || tender.year > current.year || tender.created_at > current.created_at) {
        companies.set(key, tender);
      }
    }
    return [...companies.values()].sort((left, right) =>
      left.organization.localeCompare(right.organization, "tr", { sensitivity: "base" })
    );
  }, [tenders]);
  const filteredCompanies = companyOptions.filter(item =>
    item.organization.toLocaleLowerCase("tr-TR").includes(query.toLocaleLowerCase("tr-TR"))
  );
  const trimmedQuery = query.trim();
  const canCreateCompany = Boolean(onCreateCompany && trimmedQuery.length >= 2 && !companyOptions.some(item =>
    item.organization.localeCompare(trimmedQuery, "tr", { sensitivity: "base" }) === 0
  ));

  const selectCompany = (tender: Tender) => {
    onSelect({ tenderId: tender.tender_id, companyName: tender.organization, year: tender.year });
    setOpen(false);
    setQuery("");
  };

  const createAndSelectCompany = async () => {
    if (!onCreateCompany || !canCreateCompany) return;
    setCreating(true);
    try {
      const tender = await onCreateCompany(trimmedQuery);
      selectCompany(tender);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        onClick={() => setOpen(value ? !open : true)}
        className="w-full flex items-center gap-3 bg-muted rounded-xl px-3 py-3 text-left"
      >
        <Search className="w-4 h-4 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold truncate ${value ? "text-foreground" : "text-muted-foreground"}`}>
            {value || "Şirket ara ve seç"}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Kayıtlı şirket listesi</p>
        </div>
        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <Card className="p-3 space-y-3">
          <div className="flex items-center gap-2 bg-background rounded-xl px-3 py-2.5 border border-border">
            <Search className="w-4 h-4 text-primary shrink-0" />
            <input
              autoFocus
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Şirket adı ara..."
              className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground px-1">Şirketler</p>
            <div className="max-h-72 overflow-y-auto pr-1 space-y-2">
              {canCreateCompany && (
                <button
                  onClick={() => void createAndSelectCompany()}
                  disabled={creating}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-3 bg-primary/10 border border-primary/30 active:bg-primary/15 text-left disabled:opacity-60"
                >
                  <Plus className="w-4 h-4 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">Yeni şirket ekle</p>
                    <p className="text-xs text-primary truncate">{trimmedQuery}</p>
                  </div>
                </button>
              )}
              {filteredCompanies.length === 0 ? (
                <p className="text-xs text-muted-foreground px-1 py-2">Eşleşen şirket yok.</p>
              ) : filteredCompanies.map(tender => (
                <button
                  key={tender.id}
                  onClick={() => selectCompany(tender)}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-3 bg-background/60 active:bg-muted text-left"
                >
                  <Building2 className="w-4 h-4 text-primary shrink-0" />
                  <p className="min-w-0 flex-1 text-sm font-semibold text-foreground truncate">{tender.organization}</p>
                </button>
              ))}
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

function DeleteActionSheet({
  title,
  onClose,
  onDeleteForMe,
  onDeleteForEveryone,
}: {
  title: string;
  onClose: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end px-4 pb-4">
      <Card className="w-full p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">Silme seçeneği</p>
            <p className="text-xs text-muted-foreground truncate">{title}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <button
          onClick={onDeleteForEveryone}
          className="w-full py-3 rounded-xl bg-red-500/15 text-sm font-semibold text-red-300 flex items-center justify-center gap-2"
        >
          <Trash2 className="w-4 h-4" /> Herkesten Sil
        </button>
        <button
          onClick={onDeleteForMe}
          className="w-full py-3 rounded-xl bg-muted text-sm font-semibold text-foreground"
        >
          Benden Sil
        </button>
      </Card>
    </div>
  );
}

function MessageOptionsSheet({
  title,
  onClose,
  onDelete,
  onForward,
}: {
  title: string;
  onClose: () => void;
  onDelete: () => void;
  onForward: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end px-4 pb-4">
      <Card className="w-full p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">Mesaj seçenekleri</p>
            <p className="text-xs text-muted-foreground truncate">{title}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <button
          onClick={onForward}
          className="w-full py-3 rounded-xl bg-muted text-sm font-semibold text-foreground flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" /> İlet
        </button>
        <button
          onClick={onDelete}
          className="w-full py-3 rounded-xl bg-red-500/15 text-sm font-semibold text-red-300 flex items-center justify-center gap-2"
        >
          <Trash2 className="w-4 h-4" /> Sil
        </button>
      </Card>
    </div>
  );
}

function ForwardActionSheet({
  title,
  people,
  rooms,
  onClose,
  onForwardToPerson,
  onForwardToRoom,
}: {
  title: string;
  people: ERPUser[];
  rooms: DocumentGroupSummary[];
  onClose: () => void;
  onForwardToPerson: (person: ERPUser) => void;
  onForwardToRoom: (room: DocumentGroupSummary) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end px-4 pb-4">
      <Card className="w-full max-h-[78dvh] p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">İlet</p>
            <p className="text-xs text-muted-foreground truncate">{title}</p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="overflow-y-auto space-y-4 pr-1">
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground px-1">Kişi Seç</p>
            {people.length === 0 ? (
              <p className="text-xs text-muted-foreground px-1">Uygun kişi yok.</p>
            ) : people.map(person => (
              <button
                key={person.id}
                onClick={() => onForwardToPerson(person)}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-3 bg-muted text-left"
              >
                <Avatar name={person.name} src={readProfilePhoto(person.id || person.email)} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{person.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{person.role === "admin" ? "Yönetici" : "Kullanıcı"}</p>
                </div>
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground px-1">Oda Seç</p>
            {rooms.length === 0 ? (
              <p className="text-xs text-muted-foreground px-1">Uygun oda yok.</p>
            ) : rooms.map(room => (
              <button
                key={room.id}
                onClick={() => onForwardToRoom(room)}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-3 bg-muted text-left"
              >
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{room.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{room.member_count} üye</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

function GroupImagePreview({
  groupId,
  document,
  onOpen,
}: {
  groupId: number;
  document: DocumentGroupDocument;
  onOpen: () => void;
}) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    getDocumentGroupFileBlob(groupId, document.id, false)
      .then(blob => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(""));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [groupId, document.id]);

  if (!url) return null;

  return (
    <button onClick={onOpen} className="mt-3 overflow-hidden rounded-xl border border-border bg-muted block">
      <img src={url} alt={document.document.original_filename || "Görsel"} className="max-h-64 w-full object-cover" />
    </button>
  );
}

function PdfCanvasPreview({ url }: { url: string }) {
  const [pages, setPages] = useState<string[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      setError("");
      setPages([]);
      try {
        const pdf = await pdfjsLib.getDocument(url).promise;
        const nextPages: string[] = [];
        const count = Math.min(pdf.numPages, 5);
        for (let pageNumber = 1; pageNumber <= count; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.35 });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) continue;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: context, viewport }).promise;
          nextPages.push(canvas.toDataURL("image/png"));
        }
        if (!cancelled) setPages(nextPages);
      } catch {
        if (!cancelled) setError("PDF görüntülenemedi. İndirerek açabilirsiniz.");
      }
    };
    void render();
    return () => { cancelled = true; };
  }, [url]);

  if (error) return <EmptyState icon={FileText} title="PDF açılamadı" desc={error} />;
  if (pages.length === 0) return <EmptyState icon={Clock} title="PDF hazırlanıyor" desc="Sayfalar oluşturuluyor." />;

  return (
    <div className="h-full overflow-y-auto bg-slate-950 px-3 py-4 space-y-3">
      {pages.map((page, index) => (
        <img key={index} src={page} alt={`PDF sayfa ${index + 1}`} className="w-full rounded-lg bg-white" />
      ))}
    </div>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────────────────────────
const DEMO_ACCOUNTS = [
  { email: "admin@mobit.com.tr", password: "admin123", name: "Ahmet Yılmaz", role: "admin" as Role, dept: "Yönetim" },
  { email: "user@mobit.com.tr",  password: "user123456",  name: "Emre Çelik",   role: "user" as Role,  dept: "Teknik" },
];

function LoginScreen({ onLogin }: { onLogin: (u: AuthUser) => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);

  const handleLogin = async () => {
    setError("");
    if (!email || !password) { setError("E-posta ve şifre zorunludur."); return; }
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

  const fillDemo = (role: Role) => {
    const acc = DEMO_ACCOUNTS.find(a => a.role === role)!;
    setEmail(acc.email);
    setPassword(acc.password);
    setError("");
  };

  return (
    <div className="flex flex-col min-h-full bg-background px-6" style={{ justifyContent: "center" }}>
      {/* Logo */}
      <div className="flex flex-col items-center mb-10">
        <ImageWithFallback src={mobitLogo} alt="Mobit" className="h-14 object-contain mb-5" />
        <h1 className="text-xl font-bold text-foreground">DocsBot Ops</h1>
        <p className="text-sm text-muted-foreground mt-1">Operasyonel Yönetim Platformu</p>
      </div>

      {/* Form */}
      <div className="space-y-3">
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

        {error && (
          <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-400">{error}</p>
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full py-3.5 bg-primary rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-60 transition-opacity mt-2"
        >
          {loading
            ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Giriş yapılıyor...</>
            : "Giriş Yap"}
        </button>
      </div>

      {/* Demo accounts */}
      <div className="mt-8">
        <p className="text-[10px] text-muted-foreground text-center uppercase tracking-wider mb-3">Demo Hesaplar</p>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => fillDemo("admin")}
            className="bg-card border border-border rounded-xl p-3 text-left active:scale-[0.97] transition-transform">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-teal-600/20 flex items-center justify-center">
                <Shield className="w-3.5 h-3.5 text-teal-400" />
              </div>
              <span className="text-xs font-bold text-foreground">Admin</span>
            </div>
            <p className="text-[10px] text-muted-foreground font-mono">admin@mobit.com.tr</p>
            <p className="text-[10px] text-muted-foreground font-mono">admin123</p>
          </button>
          <button onClick={() => fillDemo("user")}
            className="bg-card border border-border rounded-xl p-3 text-left active:scale-[0.97] transition-transform">
            <div className="flex items-center gap-2 mb-2">
              <div className="w-7 h-7 rounded-full bg-blue-600/20 flex items-center justify-center">
                <User className="w-3.5 h-3.5 text-blue-400" />
              </div>
              <span className="text-xs font-bold text-foreground">Kullanıcı</span>
            </div>
            <p className="text-[10px] text-muted-foreground font-mono">user@mobit.com.tr</p>
            <p className="text-[10px] text-muted-foreground font-mono">user123</p>
          </button>
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground text-center mt-8">
        v1.0.0 · Mobit © 2026
      </p>
    </div>
  );
}

// ─── HOME TAB ─────────────────────────────────────────────────────────────────
function HomeTab({ user, setTab }: { user: AuthUser; setTab: (t: Tab) => void }) {
  const isAdmin = user.role === "admin";
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
        <div className="space-y-3">
          <button onClick={() => setTab("erp")}
            className="w-full bg-gradient-to-br from-blue-600/20 to-blue-600/5 border border-blue-500/20 rounded-2xl p-4 text-left active:scale-[0.98] transition-transform">
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
              <p className="text-sm text-blue-300 font-mono">
                {isAdmin ? "Tüm çalışan & görev yönetimi" : "Kendi görevleriniz ve mesajlarınız"}
              </p>
            </div>
          </button>

          {isAdmin && (
            <button onClick={() => setTab("tender")}
              className="w-full bg-gradient-to-br from-teal-600/20 to-teal-600/5 border border-teal-500/20 rounded-2xl p-4 text-left active:scale-[0.98] transition-transform">
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
                <p className="text-sm text-teal-300 font-mono">Belgeler, çalışma alanları ve bilgi ağı</p>
              </div>
            </button>
          )}
        </div>

        {/* System status — admin only */}
        {isAdmin && (
          <div>
            <SectionHeader title="Sistem Durumu" />
            <Card className="divide-y divide-border">
              {[
                { label: "Doküman Ağı", ok: true,  detail: "Aktif" },
                { label: "Veritabanı",    ok: true,  detail: "Aktif" },
                { label: "Bilgi Ağı",     ok: true,  detail: "Bağlı" },
                { label: "AI Servisi",    ok: false, detail: "Bağlantı yok" },
              ].map((s, i) => (
                <div key={i} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-2 h-2 rounded-full ${s.ok ? "bg-emerald-500" : "bg-red-500"}`} />
                    <span className="text-sm text-foreground">{s.label}</span>
                  </div>
                  <span className={`text-xs ${s.ok ? "text-muted-foreground" : "text-red-400"}`}>{s.detail}</span>
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
    </div>
  );
}

// ─── ERP TAB ──────────────────────────────────────────────────────────────────
function ERPTab({
  user,
  onOpenDirectMessage,
}: {
  user: AuthUser;
  onOpenDirectMessage: (messageId: number) => void;
}) {
  const isAdmin = user.role === "admin";
  const [screen, setScreen] = useState<ERPScreen>("overview");
  const [taskFilter, setTaskFilter] = useState("Tümü");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [overview, setOverview] = useState<ERPOverview | null>(null);
  const [notificationPrefs, setNotificationPrefs] = useState<ERPNotificationPreference | null>(null);
  const [prefSaving, setPrefSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const navTo = (s: ERPScreen) => setScreen(s);
  const back = () => navTo("overview");
  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const [nextOverview, nextPrefs] = await Promise.all([
        getERPOverview(),
        getERPNotificationPreferences().catch(() => null),
      ]);
      setOverview(nextOverview);
      if (nextPrefs) setNotificationPrefs(nextPrefs);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "ERP verisi yüklenemedi.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
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

  const openTask = (taskId: number) => {
    setSelectedTaskId(taskId);
    navTo("task-detail");
  };

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
    const directMessageId = notification.event_key?.startsWith("direct-message:")
      ? Number(notification.event_key.split(":")[1])
      : NaN;
    if (Number.isFinite(directMessageId)) {
      onOpenDirectMessage(directMessageId);
      return;
    }
    if (notification.task_id) {
      openTask(notification.task_id);
    }
  };

  const markAllNotificationsRead = async () => {
    await markAllERPNotificationsRead();
    const readAt = new Date().toISOString();
    setOverview(current => current
      ? { ...current, notifications: current.notifications.map(item => ({ ...item, read_at: item.read_at || readAt })) }
      : current);
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
      {loading && !overview && (
        <EmptyState icon={Clock} title="Veriler yükleniyor" desc="ERP kayıtları Java backend üzerinden alınıyor." />
      )}
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
        {isAdmin && (
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
        {!isAdmin && (
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
          <input placeholder="İsim ara..." className="bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none flex-1" />
        </div>
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
        ) : (
          <div className="space-y-3">
            {(overview?.users || []).map(employee => (
              <Card key={employee.id} className="p-4 flex items-center gap-3">
                <Avatar name={employee.name} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{employee.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{employee.email || "E-posta yok"}</p>
                </div>
                <Badge label={employee.status === "online" ? "Online" : employee.status === "away" ? "Away" : "Offline"} />
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // TASKS
  if (screen === "tasks") {
    const statuses = ["Tümü", "Yapılacak", "Devam Ediyor", "Tamamlama Talep", "Gecikmiş", "Tamamlandı"];
    return (
      <div className="flex flex-col min-h-full">
        <TopBar title={isAdmin ? "Görevler" : "Görevlerim"} onBack={back} actions={
          isAdmin ? (
            <button className="w-9 h-9 flex items-center justify-center rounded-full bg-primary">
              <Plus className="w-4 h-4 text-white" />
            </button>
          ) : undefined
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

  // TASK DETAIL
  if (screen === "task-detail") {
    const task = visibleTasks.find(item => item.id === selectedTaskId) || null;
    const comments = (overview?.help_messages || [])
      .filter(item => item.task_id === selectedTaskId)
      .sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());

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
                  <Badge label={taskStatusLabel(task.status)} />
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
      <TopBar title="Hesap Talepleri" onBack={back} />
      <div className="flex-1 px-4 py-4">
        <EmptyState
          icon={UserPlus}
          title="Bekleyen talep yok"
          desc="Yeni hesap talepleri burada görünecek."
        />
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
              {notifications.map(notification => (
                <Card
                  key={notification.id}
                  className={`p-4 ${notification.read_at ? "" : "border-primary/40 bg-primary/5"}`}
                  onPress={() => void openNotification(notification)}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${notification.read_at ? "bg-muted" : "bg-primary/15"}`}>
                      <Bell className={`w-4 h-4 ${notification.read_at ? "text-muted-foreground" : "text-primary"}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-foreground leading-snug">{notification.title}</p>
                        {!notification.read_at && <span className="mt-1 w-2 h-2 rounded-full bg-primary shrink-0" />}
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
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return null;
}

type KGNode = {
  id: string;
  label: string;
  shortLabel: string;
  x: number;
  y: number;
  cat: string;
  status: "Onaylandı" | "İncelemede" | "Taslak" | "Reddedildi" | "Arşiv";
  r: number;
  owner: string;
  dept: string;
  version: string;
  date: string;
  desc: string;
};

type KGEdge = { s: string; t: string; str: "strong" | "med" | "weak" };

const KG_CAT_COLORS: Record<string, string> = {
  system: "#14B8A6",
  finance: "#F59E0B",
  hr: "#8B5CF6",
  tender: "#A78BFA",
  contracts: "#F97316",
  inventory: "#06B6D4",
  reports: "#EC4899",
  sales: "#3B82F6",
  approvals: "#10B981",
};

const KG_CAT_LABELS: Record<string, string> = {
  system: "Sistem",
  finance: "Finans",
  hr: "İK",
  tender: "Şirket",
  contracts: "Sözleşme",
  inventory: "Stok",
  reports: "Rapor",
  sales: "Satış",
  approvals: "Onay",
};

const KG_NODES: KGNode[] = [
  { id: "ERP_CORE", label: "Operasyon Ana Kayıt", shortLabel: "OPS", x: 180, y: 145, cat: "system", status: "Onaylandı", r: 16, owner: "Admin", dept: "Operasyon", version: "v2.1", date: "28 Haz", desc: "Görev, kullanıcı ve doküman ağının merkez kaydı." },
  { id: "VAULT", label: "Bilgi Ağı", shortLabel: "AĞ", x: 180, y: 82, cat: "system", status: "Onaylandı", r: 13, owner: "Mobit", dept: "Bilgi", version: "v1.8", date: "28 Haz", desc: "Şirket ve operasyon belgelerinin klasörlenmiş bilgi kasası." },
  { id: "FIN_FATURA", label: "Fatura Arşivi", shortLabel: "FATURA", x: 80, y: 55, cat: "finance", status: "İncelemede", r: 9, owner: "Finans", dept: "Muhasebe", version: "v1.2", date: "27 Haz", desc: "Şirket ve operasyon faturalarının takip dokümanları." },
  { id: "FIN_BUTCE", label: "Bütçe Planı", shortLabel: "BÜTÇE", x: 50, y: 88, cat: "finance", status: "Taslak", r: 8, owner: "Finans", dept: "Muhasebe", version: "v0.9", date: "25 Haz", desc: "Yıllık proje maliyet ve bütçe planı." },
  { id: "FIN_ODEME", label: "Ödeme Planı", shortLabel: "ÖDEME", x: 108, y: 78, cat: "finance", status: "Onaylandı", r: 7, owner: "Finans", dept: "Muhasebe", version: "v1.0", date: "22 Haz", desc: "Tedarikçi ödeme takvimleri." },
  { id: "FIN_VERGI", label: "Vergi Evrakları", shortLabel: "VERGİ", x: 58, y: 118, cat: "finance", status: "Arşiv", r: 6, owner: "Finans", dept: "Muhasebe", version: "v1.0", date: "18 Haz", desc: "Vergi ve resmi beyan dokümanları." },
  { id: "HR_CALISAN", label: "Çalışan Dosyaları", shortLabel: "ÇALIŞAN", x: 282, y: 58, cat: "hr", status: "Onaylandı", r: 9, owner: "İK", dept: "İnsan Kaynakları", version: "v1.4", date: "26 Haz", desc: "Personel yetki ve görev kayıtları." },
  { id: "HR_BORDRO", label: "Bordro Belgeleri", shortLabel: "BORDRO", x: 310, y: 82, cat: "hr", status: "İncelemede", r: 8, owner: "İK", dept: "İnsan Kaynakları", version: "v1.1", date: "24 Haz", desc: "Bordro ve ücret bordroları." },
  { id: "HR_IZIN", label: "İzin Talepleri", shortLabel: "İZİN", x: 282, y: 108, cat: "hr", status: "Taslak", r: 7, owner: "İK", dept: "İnsan Kaynakları", version: "v0.7", date: "21 Haz", desc: "İzin ve devamsızlık süreçleri." },
  { id: "HR_PERF", label: "Performans Formları", shortLabel: "PERF", x: 312, y: 115, cat: "hr", status: "Arşiv", r: 6, owner: "İK", dept: "İnsan Kaynakları", version: "v1.0", date: "15 Haz", desc: "Çalışan performans değerlendirmeleri." },
  { id: "TND_BEDAS", label: "BEDAŞ Çalışma Dosyası", shortLabel: "BEDAŞ", x: 128, y: 48, cat: "tender", status: "İncelemede", r: 9, owner: "Doküman Ağı", dept: "Şirket", version: "v2.3", date: "28 Haz", desc: "BEDAŞ belgeleri, şartnameler ve yazışmalar." },
  { id: "TND_CEAS", label: "ÇEAŞ Çalışma Dosyası", shortLabel: "ÇEAŞ", x: 232, y: 48, cat: "tender", status: "Onaylandı", r: 9, owner: "Doküman Ağı", dept: "Şirket", version: "v1.9", date: "27 Haz", desc: "ÇEAŞ evrakları ve analiz çıktıları." },
  { id: "TND_MOBIT", label: "Mobit Teklif Hazırlığı", shortLabel: "MOBIT", x: 180, y: 38, cat: "tender", status: "Taslak", r: 6, owner: "Mobit", dept: "Şirket", version: "v0.6", date: "26 Haz", desc: "Mobit teklif çalışma dokümanları." },
  { id: "CNT_BEDAS", label: "BEDAŞ Sözleşme", shortLabel: "CNT-BED", x: 88, y: 158, cat: "contracts", status: "İncelemede", r: 11, owner: "Hukuk", dept: "Sözleşme", version: "v1.5", date: "27 Haz", desc: "BEDAŞ sözleşme revizyonları." },
  { id: "CNT_CEAS", label: "ÇEAŞ Sözleşme", shortLabel: "CNT-ÇEA", x: 72, y: 186, cat: "contracts", status: "Onaylandı", r: 10, owner: "Hukuk", dept: "Sözleşme", version: "v1.3", date: "24 Haz", desc: "ÇEAŞ sözleşme ve ek protokolleri." },
  { id: "CNT_TOROSLAR", label: "Toroslar Sözleşme", shortLabel: "TOROS", x: 100, y: 208, cat: "contracts", status: "Taslak", r: 7, owner: "Hukuk", dept: "Sözleşme", version: "v0.8", date: "23 Haz", desc: "Toroslar sözleşme hazırlığı." },
  { id: "CNT_ENERJISA", label: "Enerjisa Sözleşme", shortLabel: "ENJ", x: 62, y: 165, cat: "contracts", status: "Arşiv", r: 6, owner: "Hukuk", dept: "Sözleşme", version: "v1.0", date: "20 Haz", desc: "Enerjisa geçmiş sözleşme kayıtları." },
  { id: "INV_STOK", label: "Stok Listesi", shortLabel: "STOK", x: 76, y: 232, cat: "inventory", status: "Onaylandı", r: 9, owner: "Depo", dept: "Stok", version: "v1.6", date: "28 Haz", desc: "Saha ekipmanı ve ürün stokları." },
  { id: "INV_SATIN", label: "Satın Alma Talepleri", shortLabel: "SATIN", x: 50, y: 212, cat: "inventory", status: "İncelemede", r: 8, owner: "Satın Alma", dept: "Stok", version: "v1.1", date: "25 Haz", desc: "Proje için satın alma talepleri." },
  { id: "INV_DEPO", label: "Depo Hareketleri", shortLabel: "DEPO", x: 105, y: 250, cat: "inventory", status: "Arşiv", r: 7, owner: "Depo", dept: "Stok", version: "v1.0", date: "19 Haz", desc: "Depo giriş çıkış kayıtları." },
  { id: "RPT_AYLIK", label: "Aylık Operasyon Raporu", shortLabel: "AYLIK", x: 155, y: 212, cat: "reports", status: "Onaylandı", r: 10, owner: "Operasyon", dept: "Rapor", version: "v2.0", date: "28 Haz", desc: "Aylık operasyon ve proje performansı." },
  { id: "RPT_YILLIK", label: "Yıllık Yönetim Raporu", shortLabel: "YILLIK", x: 185, y: 240, cat: "reports", status: "Taslak", r: 9, owner: "Yönetim", dept: "Rapor", version: "v0.8", date: "22 Haz", desc: "Yıllık yönetim raporu çalışma dosyası." },
  { id: "RPT_KPI", label: "KPI Panosu", shortLabel: "KPI", x: 210, y: 218, cat: "reports", status: "İncelemede", r: 7, owner: "Yönetim", dept: "Rapor", version: "v1.2", date: "27 Haz", desc: "İş yükü, risk ve tamamlanma KPI kayıtları." },
  { id: "RPT_HAFTALIK", label: "Haftalık Özet", shortLabel: "HAFTA", x: 162, y: 258, cat: "reports", status: "Arşiv", r: 6, owner: "Operasyon", dept: "Rapor", version: "v1.0", date: "16 Haz", desc: "Haftalık durum raporları." },
  { id: "SLS_HEDEF", label: "Satış Hedefleri", shortLabel: "HEDEF", x: 288, y: 212, cat: "sales", status: "Onaylandı", r: 9, owner: "Satış", dept: "Satış", version: "v1.4", date: "26 Haz", desc: "Satış hedef ve gerçekleşme dokümanları." },
  { id: "SLS_MUSTERI", label: "Müşteri Kayıtları", shortLabel: "MÜŞTERİ", x: 312, y: 185, cat: "sales", status: "İncelemede", r: 8, owner: "Satış", dept: "Satış", version: "v1.1", date: "25 Haz", desc: "Müşteri iletişim ve teklif geçmişi." },
  { id: "SLS_TEKLIF", label: "Teklif Dosyaları", shortLabel: "TEKLİF", x: 280, y: 242, cat: "sales", status: "Taslak", r: 7, owner: "Satış", dept: "Satış", version: "v0.9", date: "24 Haz", desc: "Aktif teklif hazırlıkları." },
  { id: "APR_BEDAS", label: "BEDAŞ Onay Akışı", shortLabel: "ONAY-B", x: 285, y: 148, cat: "approvals", status: "İncelemede", r: 9, owner: "Admin", dept: "Onay", version: "v1.7", date: "28 Haz", desc: "BEDAŞ doküman onay ve revizyon süreci." },
  { id: "APR_CEAS", label: "ÇEAŞ Onay Akışı", shortLabel: "ONAY-Ç", x: 305, y: 165, cat: "approvals", status: "Onaylandı", r: 8, owner: "Admin", dept: "Onay", version: "v1.3", date: "26 Haz", desc: "ÇEAŞ onay süreci kayıtları." },
  { id: "APR_RED", label: "Reddedilen Evraklar", shortLabel: "RED", x: 272, y: 182, cat: "approvals", status: "Reddedildi", r: 7, owner: "Admin", dept: "Onay", version: "v1.0", date: "20 Haz", desc: "Revizyon isteyen reddedilmiş dokümanlar." },
];

const KG_EDGES: KGEdge[] = [
  { s: "ERP_CORE", t: "VAULT", str: "strong" }, { s: "VAULT", t: "TND_BEDAS", str: "strong" }, { s: "VAULT", t: "TND_CEAS", str: "strong" },
  { s: "TND_BEDAS", t: "CNT_BEDAS", str: "strong" }, { s: "TND_CEAS", t: "CNT_CEAS", str: "strong" }, { s: "CNT_BEDAS", t: "APR_BEDAS", str: "med" },
  { s: "CNT_CEAS", t: "APR_CEAS", str: "med" }, { s: "ERP_CORE", t: "HR_CALISAN", str: "med" }, { s: "ERP_CORE", t: "FIN_FATURA", str: "med" },
  { s: "ERP_CORE", t: "RPT_AYLIK", str: "strong" }, { s: "RPT_AYLIK", t: "RPT_KPI", str: "strong" }, { s: "RPT_YILLIK", t: "RPT_KPI", str: "med" },
  { s: "FIN_FATURA", t: "FIN_ODEME", str: "strong" }, { s: "FIN_FATURA", t: "FIN_BUTCE", str: "med" }, { s: "FIN_BUTCE", t: "FIN_VERGI", str: "weak" },
  { s: "HR_CALISAN", t: "HR_BORDRO", str: "med" }, { s: "HR_CALISAN", t: "HR_IZIN", str: "weak" }, { s: "HR_CALISAN", t: "HR_PERF", str: "weak" },
  { s: "INV_STOK", t: "INV_SATIN", str: "strong" }, { s: "INV_STOK", t: "INV_DEPO", str: "med" }, { s: "CNT_TOROSLAR", t: "INV_STOK", str: "weak" },
  { s: "SLS_HEDEF", t: "SLS_MUSTERI", str: "med" }, { s: "SLS_MUSTERI", t: "SLS_TEKLIF", str: "strong" }, { s: "SLS_TEKLIF", t: "TND_MOBIT", str: "weak" },
  { s: "APR_BEDAS", t: "APR_RED", str: "weak" }, { s: "APR_CEAS", t: "APR_RED", str: "weak" }, { s: "TND_BEDAS", t: "FIN_FATURA", str: "med" },
  { s: "TND_CEAS", t: "FIN_FATURA", str: "weak" }, { s: "ERP_CORE", t: "SLS_HEDEF", str: "weak" }, { s: "ERP_CORE", t: "INV_STOK", str: "med" },
];

function KnowledgeGraph({ user, onBack }: { user: AuthUser; onBack: () => void }) {
  const [selectedNode, setSelectedNode] = useState<KGNode | null>(null);
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
  const nodeMap = useMemo(() => new Map(KG_NODES.map(node => [node.id, node])), []);
  const filteredSearch = useMemo(() => {
    const normalized = query.toLocaleLowerCase("tr-TR").trim();
    return normalized
      ? KG_NODES.filter(node => `${node.label} ${node.shortLabel} ${node.dept} ${node.owner}`.toLocaleLowerCase("tr-TR").includes(normalized))
      : KG_NODES.slice(0, 12);
  }, [query]);
  const groups = useMemo(() => ([
    { title: "Şirket Dosyaları", cats: ["tender", "contracts", "approvals"] },
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
  const selectNode = (node: KGNode) => {
    if (!wasDragging.current) {
      setSelectedNode(node);
      setDrawerOpen(false);
      setSearchOpen(false);
    }
  };
  const edgeStyle = (strength: KGEdge["str"]) =>
    strength === "strong" ? { opacity: 0.5, width: 1.2 } : strength === "med" ? { opacity: 0.28, width: 0.8 } : { opacity: 0.12, width: 0.5 };

  return (
    <div className="relative flex flex-col h-full min-h-0 overflow-hidden" style={{ background: "#0A0A12" }}>
      <style>{`@keyframes graphPulse { 0%, 100% { opacity: 0.6; } 50% { opacity: 0.15; } }`}</style>
      <TopBar
        title="Knowledge Graph"
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
            {KG_EDGES.map(edge => {
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
            {KG_NODES.map(node => {
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
                {KG_NODES.filter(node => group.cats.includes(node.cat)).slice(0, 10).map(node => (
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
                { icon: Eye, label: "Aç" },
                { icon: MessageSquare, label: "Yorum" },
                { icon: CheckCircle2, label: "Onay", disabled: user.role !== "admin" || selectedNode.status !== "İncelemede" },
                { icon: Download, label: "İndir" },
                { icon: Share2, label: "Paylaş" },
              ].map(action => {
                const Icon = action.icon;
                return (
                  <button key={action.label} disabled={action.disabled}
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
      {loading && documents.length === 0 && tenders.length === 0 && (
        <EmptyState icon={Clock} title="Veriler yükleniyor" desc="Doküman ağı kayıtları Java backend üzerinden alınıyor." />
      )}
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

  if (showGraph) return <KnowledgeGraph user={user} onBack={() => setShowGraph(false)} />;

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
              {KG_EDGES.slice(0, 12).map(edge => {
                const source = KG_NODES.find(node => node.id === edge.s);
                const target = KG_NODES.find(node => node.id === edge.t);
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
              {KG_NODES.slice(0, 18).map(node => (
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
          <Search className="w-3.5 h-3.5 text-slate-500" />
          <span className="text-xs text-slate-500 font-mono">⌘K — ara...</span>
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
        ) : (
          <div className="space-y-3">
            {vaultNotes.map(note => (
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

// ─── MESSAGES TAB ─────────────────────────────────────────────────────────────
function MessagesTab({
  user,
  openRequest,
  profilePhotoVersion = 0,
}: {
  user: AuthUser;
  openRequest?: DirectMessageOpenRequest | null;
  profilePhotoVersion?: number;
}) {
  const hiddenStorageSuffix = user.id ?? user.email;
  const hiddenRoomMessageStorageKey = `docsbot.hidden.room.messages.${hiddenStorageSuffix}`;
  const hiddenRoomDocumentStorageKey = `docsbot.hidden.room.documents.${hiddenStorageSuffix}`;
  const [screen, setScreen] = useState<MsgScreen>("inbox");
  const [activeTab, setActiveTab] = useState<"all" | "rooms" | "people">("all");
  const [msgText, setMsgText] = useState("");
  const [directMessages, setDirectMessages] = useState<ERPDirectMessage[]>([]);
  const [selectedDirectUser, setSelectedDirectUser] = useState<ERPUser | null>(null);
  const [groups, setGroups] = useState<DocumentGroupSummary[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<DocumentGroupDetail | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [groupTenderId, setGroupTenderId] = useState("");
  const [groupYear, setGroupYear] = useState(String(new Date().getFullYear()));
  const [uploadNote, setUploadNote] = useState("");
  const [roomMessages, setRoomMessages] = useState<DocumentGroupMessage[]>([]);
  const [roomMessageText, setRoomMessageText] = useState("");
  const [roomView, setRoomView] = useState<"chat" | "documents">("chat");
  const [roomTenders, setRoomTenders] = useState<Tender[]>([]);
  const [selectedRoomTenderId, setSelectedRoomTenderId] = useState("");
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; type: string } | null>(null);
  const [roomUsers, setRoomUsers] = useState<ERPUser[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [roomLoading, setRoomLoading] = useState(false);
  const [memberLoading, setMemberLoading] = useState(false);
  const [visibilityLoadingUserId, setVisibilityLoadingUserId] = useState<number | null>(null);
  const [roomError, setRoomError] = useState("");
  const [roomNotice, setRoomNotice] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [voiceSending, setVoiceSending] = useState(false);
  const [showMissingCompanyPrompt, setShowMissingCompanyPrompt] = useState(false);
  const [missingCompanyPromptShown, setMissingCompanyPromptShown] = useState(false);
  const [hiddenRoomMessageIds, setHiddenRoomMessageIds] = useState<Set<number>>(() => readNumberSet(hiddenRoomMessageStorageKey));
  const [hiddenRoomDocumentIds, setHiddenRoomDocumentIds] = useState<Set<number>>(() => readNumberSet(hiddenRoomDocumentStorageKey));
  const [roomActionTarget, setRoomActionTarget] = useState<RoomActionTarget | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const recordStartedAtRef = useRef(0);
  const recordCancelRef = useRef(false);
  const recordingTargetRef = useRef<RecordingTarget>("direct");
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<number | null>(null);

  useEffect(() => {
    writeNumberSet(hiddenRoomMessageStorageKey, hiddenRoomMessageIds);
  }, [hiddenRoomMessageIds, hiddenRoomMessageStorageKey]);

  useEffect(() => {
    writeNumberSet(hiddenRoomDocumentStorageKey, hiddenRoomDocumentIds);
  }, [hiddenRoomDocumentIds, hiddenRoomDocumentStorageKey]);

  const userPhoto = (target: ERPUser | AuthUser | DocumentGroupMember | null | undefined) => {
    void profilePhotoVersion;
    if (!target) return "";
    if ("user_id" in target) return readProfilePhoto(target.user_id || target.email || target.name);
    return readProfilePhoto(target.id || target.email);
  };

  const availableRoomUsers = useMemo(() => {
    if (!selectedGroup) return roomUsers;
    const memberIds = new Set(selectedGroup.members.map(member => member.user_id));
    return roomUsers.filter(roomUser => roomUser.id !== user.id && !memberIds.has(roomUser.id));
  }, [roomUsers, selectedGroup, user.id]);

  const roomFeed = useMemo(() => {
    const messageItems = roomMessages.filter(message => !hiddenRoomMessageIds.has(message.id)).map(message => ({
      kind: "message" as const,
      id: `message-${message.id}`,
      time: message.created_at,
      message,
      document: null,
    }));
    const documentItems = (selectedGroup?.documents || []).filter(document => !hiddenRoomDocumentIds.has(document.id)).map(document => ({
      kind: "document" as const,
      id: `document-${document.id}`,
      time: document.created_at,
      message: null,
      document,
    }));
    return [...messageItems, ...documentItems].sort((left, right) =>
      new Date(left.time).getTime() - new Date(right.time).getTime()
    );
  }, [hiddenRoomDocumentIds, hiddenRoomMessageIds, roomMessages, selectedGroup]);
  const groupedRoomDocuments = useMemo(() =>
    groupDocumentsByYearTender((selectedGroup?.documents || []).filter(document => !hiddenRoomDocumentIds.has(document.id))),
    [hiddenRoomDocumentIds, selectedGroup]);
  const userDirectorySections = useMemo(() => {
    const byName = (left: ERPUser, right: ERPUser) => left.name.localeCompare(right.name, "tr", { sensitivity: "base" });
    const approvedUsers = roomUsers.filter(roomUser => roomUser.approved_at);
    return [
      {
        title: "Yöneticiler",
        items: approvedUsers.filter(roomUser => roomUser.role === "admin").sort(byName),
      },
      {
        title: "Kullanıcılar",
        items: approvedUsers.filter(roomUser => roomUser.role !== "admin").sort(byName),
      },
    ];
  }, [roomUsers]);

  const sortedDirectMessages = useMemo(() =>
    [...directMessages].sort((left, right) =>
      new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
    ), [directMessages]);

  const visibleDirectMessages = useMemo(() => {
    const currentUserId = user.id;
    return sortedDirectMessages.filter(message => {
      const involvesCurrentUser = user.role === "admin"
        ? message.sender_type === "admin" || message.recipient_type === "admin"
        : message.sender_user_id === currentUserId || message.recipient_user_id === currentUserId;
      if (!involvesCurrentUser) return false;

      if (selectedDirectUser) {
        return message.sender_user_id === selectedDirectUser.id || message.recipient_user_id === selectedDirectUser.id;
      }

      return message.sender_type === "admin" || message.recipient_type === "admin";
    });
  }, [selectedDirectUser, sortedDirectMessages, user.id, user.role]);

  const lastDirectMessage = sortedDirectMessages.at(-1);
  const directThreadTitle = selectedDirectUser?.name || (user.role === "admin" ? "Konuşma" : "Admin ile Konuşma");

  const directMessageOwn = (message: ERPDirectMessage) =>
    user.role === "admin"
      ? message.sender_type === "admin"
      : message.sender_user_id === user.id;

  const isForwardedLabel = (value: string | null | undefined) =>
    Boolean(value && /^İletil(en|di)/i.test(value.trim()));

  const forwardedBodyText = (value: string) =>
    value.replace(/^İletildi\s*\n/i, "").trim();

  const directMediaName = (message: ERPDirectMessage) =>
    message.body
      .replace(/^İletilen doküman:\s*/i, "")
      .replace(/^İletildi\s*·\s*/i, "")
      .trim() || "dokuman";

  const refreshDirectMessages = async () => {
    try {
      setDirectMessages(await getERPDirectMessages(100));
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Mesajlar yüklenemedi.");
    }
  };

  const openDirectThread = (targetUser: ERPUser | null) => {
    setSelectedDirectUser(targetUser);
    setRoomError("");
    setRoomNotice("");
    setScreen("thread");
  };

  const resolveDirectTargetFromMessage = (message: ERPDirectMessage): ERPUser | null => {
    const otherUserId = user.role === "admin"
      ? message.sender_user_id ?? message.recipient_user_id
      : message.sender_user_id === user.id
        ? message.recipient_user_id
        : message.sender_user_id;
    if (!otherUserId) return null;
    const existing = roomUsers.find(roomUser => roomUser.id === otherUserId);
    if (existing) return existing;
    const name = message.sender_user_id === otherUserId ? message.sender_name : message.recipient_name;
    return {
      id: otherUserId,
      name,
      role: "user",
      status: "offline",
      email: null,
      phone: null,
      document_network_visible: false,
      last_seen_at: null,
      approved_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
  };

  const sendMsg = async () => {
    if (!msgText.trim()) return;
    setRoomError("");
    setRoomNotice("");
    if (user.role === "admin" && !selectedDirectUser) {
      setRoomError("Mesaj göndermek için bir kişi seçin.");
      return;
    }
    if (selectedDirectUser && selectedDirectUser.id === user.id) {
      setRoomError("Kendinize mesaj gönderemezsiniz.");
      return;
    }
    try {
      const sent = await sendERPDirectMessage({
        body: msgText.trim(),
        recipientUserId: selectedDirectUser?.id ?? null,
      });
      setDirectMessages(prev => [...prev, sent]);
      setMsgText("");
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Mesaj gönderilemedi.");
    }
  };

  const sendVoiceMessage = async (mediaData: string, mediaMimeType: string, durationMs: number) => {
    setRoomError("");
    setRoomNotice("");
    if (user.role === "admin" && !selectedDirectUser) {
      setRoomError("Ses mesajı göndermek için bir kişi seçin.");
      return;
    }
    if (selectedDirectUser && selectedDirectUser.id === user.id) {
      setRoomError("Kendinize mesaj gönderemezsiniz.");
      return;
    }
    setVoiceSending(true);
    try {
      const sent = await sendERPDirectMessage({
        body: "Ses mesajı",
        recipientUserId: selectedDirectUser?.id ?? null,
        messageKind: "voice",
        mediaMimeType,
        mediaData,
        mediaDurationMs: durationMs,
      });
      setDirectMessages(prev => [...prev, sent]);
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Ses mesajı gönderilemedi.");
    } finally {
      setVoiceSending(false);
    }
  };

  const sendRoomVoiceMessage = async (mediaData: string, mediaMimeType: string, durationMs: number) => {
    if (!selectedGroup) return;
    setRoomError("");
    setRoomNotice("");
    setVoiceSending(true);
    try {
      const message = await sendDocumentGroupMessage(selectedGroup.group.id, {
        body: "Ses mesajı",
        messageKind: "voice",
        mediaMimeType,
        mediaData,
        mediaDurationMs: durationMs,
      });
      setRoomMessages(prev => [...prev, message]);
      setGroups(await getDocumentGroups());
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Ses mesajı gönderilemedi.");
    } finally {
      setVoiceSending(false);
    }
  };

  const stopVoiceRecording = (cancel = false) => {
    recordCancelRef.current = cancel;
    mediaRecorderRef.current?.stop();
  };

  const startVoiceRecording = async (target: RecordingTarget = "direct") => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRoomError("Bu cihazda ses kaydı desteklenmiyor.");
      return;
    }
    setRoomError("");
    try {
      if (navigator.permissions?.query) {
        const microphonePermission = await navigator.permissions.query({ name: "microphone" as PermissionName }).catch(() => null);
        if (microphonePermission?.state === "denied") {
          setRoomError("Mikrofon izni kapalı. Telefon ayarlarından Mobit uygulaması için mikrofon iznini açın ve tekrar deneyin.");
          return;
        }
      }
      recordingTargetRef.current = target;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      voiceChunksRef.current = [];
      recordCancelRef.current = false;
      recordStartedAtRef.current = Date.now();
      setRecordingMs(0);
      recorder.ondataavailable = event => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const duration = Date.now() - recordStartedAtRef.current;
        const chunks = [...voiceChunksRef.current];
        const mimeType = recorder.mimeType || "audio/webm";
        recordStreamRef.current?.getTracks().forEach(track => track.stop());
        recordStreamRef.current = null;
        mediaRecorderRef.current = null;
        voiceChunksRef.current = [];
        setIsRecording(false);
        setRecordingMs(0);
        if (recordTimerRef.current) {
          window.clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        if (recordCancelRef.current || chunks.length === 0) return;
        const blob = new Blob(chunks, { type: mimeType });
        const sendTarget = recordingTargetRef.current;
        void blobToDataUrl(blob).then(dataUrl =>
          sendTarget === "room"
            ? sendRoomVoiceMessage(dataUrl, mimeType, duration)
            : sendVoiceMessage(dataUrl, mimeType, duration)
        );
      };
      recorder.start();
      setIsRecording(true);
      recordTimerRef.current = window.setInterval(() => {
        setRecordingMs(Date.now() - recordStartedAtRef.current);
      }, 250);
    } catch (exception) {
      setRoomError(microphoneErrorMessage(exception));
    }
  };

  const refreshGroups = async () => {
    setRoomError("");
    setRoomLoading(true);
    try {
      const next = await getDocumentGroups();
      setGroups(next);
      if (selectedGroup && next.some(group => group.id === selectedGroup.group.id)) {
        const [detail, messages] = await Promise.all([
          getDocumentGroup(selectedGroup.group.id),
          getDocumentGroupMessages(selectedGroup.group.id),
        ]);
        setSelectedGroup(detail);
        setRoomMessages(messages);
      }
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Doküman odaları yüklenemedi.");
    } finally {
      setRoomLoading(false);
    }
  };

  const refreshRoomUsers = async () => {
    try {
      setRoomUsers(await getERPUsers());
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Kullanıcı listesi yüklenemedi.");
    }
  };

  const refreshRoomTenders = async () => {
    if (user.role !== "admin") return;
    try {
      const page = await getTendersPage(0, 100);
      setRoomTenders(page.items);
    } catch {
      setRoomTenders([]);
    }
  };

  const createRoomCompany = async (companyName: string) => {
    const created = await createCompanyWorkflow({
      organization: companyName,
      year: Number(groupYear) || new Date().getFullYear(),
      internalUnit: "GENEL",
    });
    setRoomTenders(prev => [created, ...prev.filter(item => item.id !== created.id)]);
    return created;
  };

  const openGroup = async (groupId: number) => {
    setRoomError("");
    setRoomNotice("");
    setRoomLoading(true);
    try {
      const [detail, messages] = await Promise.all([
        getDocumentGroup(groupId),
        getDocumentGroupMessages(groupId),
      ]);
      setSelectedGroup(detail);
      setRoomMessages(messages);
      setSelectedRoomTenderId(detail.group.tender_id || "");
      setRoomView("chat");
      setScreen("room-thread");
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Doküman odası açılamadı.");
    } finally {
      setRoomLoading(false);
    }
  };

  const createRoom = async () => {
    if (!groupName.trim() || !groupYear.trim()) return;
    setRoomError("");
    setRoomLoading(true);
    try {
      const detail = await createDocumentGroup({
        name: groupName.trim(),
        description: groupDesc.trim() || undefined,
        tenderId: groupTenderId.trim(),
        year: Number(groupYear),
      });
      setSelectedGroup(detail);
      setRoomMessages([]);
      setGroupName("");
      setGroupDesc("");
      setGroupTenderId("");
      setGroupYear(String(new Date().getFullYear()));
      setSelectedRoomTenderId(detail.group.tender_id || "");
      setGroups(await getDocumentGroups());
      setRoomView("chat");
      setScreen("room-thread");
      if (!detail.group.tender_id && !missingCompanyPromptShown) {
        setMissingCompanyPromptShown(true);
        setShowMissingCompanyPrompt(true);
      }
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Doküman odası oluşturulamadı.");
    } finally {
      setRoomLoading(false);
    }
  };

  const uploadRoomFile = async (file: File | undefined) => {
    if (!file || !selectedGroup) return;
    setRoomError("");
    setRoomLoading(true);
    try {
      const note = [
        selectedRoomTenderId ? `Şirket/workflow: ${selectedRoomTenderId}` : "",
        uploadNote,
      ].filter(Boolean).join("\n");
      const tender = roomTenders.find(item => item.tender_id === selectedRoomTenderId);
      await uploadDocumentGroupFile({
        groupId: selectedGroup.group.id,
        file,
        note,
        tenderId: selectedRoomTenderId || selectedGroup.group.tender_id || undefined,
        year: tender?.year || selectedGroup.group.year || undefined,
      });
      setUploadNote("");
      const [detail, messages] = await Promise.all([
        getDocumentGroup(selectedGroup.group.id),
        getDocumentGroupMessages(selectedGroup.group.id),
      ]);
      setSelectedGroup(detail);
      setRoomMessages(messages);
      setGroups(await getDocumentGroups());
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Doküman yüklenemedi.");
    } finally {
      setRoomLoading(false);
    }
  };

  const downloadRoomFile = async (groupDocumentId: number, filename: string | null) => {
    if (!selectedGroup) return;
    setRoomError("");
    try {
      const blob = await getDocumentGroupFileBlob(selectedGroup.group.id, groupDocumentId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename || "document";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Doküman indirilemedi.");
    }
  };

  const previewRoomFile = async (groupDocument: DocumentGroupDocument) => {
    if (!selectedGroup) return;
    setRoomError("");
    try {
      if (previewFile) URL.revokeObjectURL(previewFile.url);
      const blob = await getDocumentGroupFileBlob(selectedGroup.group.id, groupDocument.id, false);
      const filename = groupDocument.document.original_filename || groupDocument.document.stored_filename || "document";
      setPreviewFile({
        url: URL.createObjectURL(blob),
        name: filename,
        type: blob.type || groupDocument.document.mime_type || "",
      });
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Doküman görüntülenemedi.");
    }
  };

  const previewDirectMedia = (message: ERPDirectMessage) => {
    if (!message.media_data) return;
    if (previewFile?.url.startsWith("blob:")) URL.revokeObjectURL(previewFile.url);
    setPreviewFile({
      url: message.media_data,
      name: directMediaName(message),
      type: message.media_mime_type || (message.message_kind === "image" ? "image/" : "application/octet-stream"),
    });
  };

  const downloadDirectMedia = (message: ERPDirectMessage) => {
    if (!message.media_data) return;
    const link = document.createElement("a");
    link.href = message.media_data;
    link.download = directMediaName(message);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const closePreviewFile = () => {
    if (previewFile?.url.startsWith("blob:")) URL.revokeObjectURL(previewFile.url);
    setPreviewFile(null);
  };

  const sendRoomMessage = async () => {
    if (!selectedGroup || !roomMessageText.trim()) return;
    setRoomError("");
    setRoomNotice("");
    try {
      const message = await sendDocumentGroupMessage(selectedGroup.group.id, roomMessageText.trim());
      setRoomMessages(prev => [...prev, message]);
      setRoomMessageText("");
      setGroups(await getDocumentGroups());
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Alan mesajı gönderilemedi.");
    }
  };

  const deleteRoomItemForMe = () => {
    if (!roomActionTarget) return;
    if (roomActionTarget.kind === "message") {
      setHiddenRoomMessageIds(prev => new Set(prev).add(roomActionTarget.id));
    } else {
      setHiddenRoomDocumentIds(prev => new Set(prev).add(roomActionTarget.id));
    }
    setRoomActionTarget(null);
  };

  const deleteRoomItemForEveryone = async () => {
    if (!selectedGroup || !roomActionTarget) return;
    setRoomError("");
    try {
      if (roomActionTarget.kind === "message") {
        await deleteDocumentGroupMessage(selectedGroup.group.id, roomActionTarget.id);
        setRoomMessages(prev => prev.filter(message => message.id !== roomActionTarget.id));
      } else {
        await deleteDocumentGroupDocument(selectedGroup.group.id, roomActionTarget.id);
        const detail = await getDocumentGroup(selectedGroup.group.id);
        setSelectedGroup(detail);
      }
      setGroups(await getDocumentGroups());
      setRoomActionTarget(null);
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Silme işlemi tamamlanamadı.");
    }
  };

  const forwardRoomItemToPerson = async (person: ERPUser) => {
    if (!selectedGroup || !roomActionTarget) return;
    setRoomError("");
    try {
      if (roomActionTarget.kind === "message") {
        const message = roomMessages.find(item => item.id === roomActionTarget.id);
        if (!message) return;
        const sent = await sendERPDirectMessage({
          body: message.message_kind === "voice" ? "İletilen ses mesajı" : `İletildi\n${message.body}`,
          recipientUserId: person.id,
          messageKind: message.message_kind === "voice" ? "voice" : "text",
          mediaMimeType: message.media_mime_type || null,
          mediaData: message.media_data || null,
          mediaDurationMs: message.media_duration_ms || null,
        });
        setDirectMessages(prev => [...prev, sent]);
      } else {
        const document = selectedGroup.documents.find(item => item.id === roomActionTarget.id);
        const filename = document?.document.original_filename || document?.document.stored_filename || "Doküman";
        if (!document) return;
        const blob = await getDocumentGroupFileBlob(selectedGroup.group.id, document.id, false);
        const mediaData = await blobToDataUrl(blob);
        const mimeType = blob.type || document.document.mime_type || "application/octet-stream";
        const sent = await sendERPDirectMessage({
          body: `İletilen doküman: ${filename}`,
          recipientUserId: person.id,
          messageKind: mimeType.startsWith("image/") ? "image" : "file",
          mediaMimeType: mimeType,
          mediaData,
        });
        setDirectMessages(prev => [...prev, sent]);
      }
      setRoomActionTarget(null);
      setRoomNotice(`${person.name} kişisine başarıyla iletildi.`);
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "İletme işlemi tamamlanamadı.");
    }
  };

  const forwardRoomItemToRoom = async (room: DocumentGroupSummary) => {
    if (!selectedGroup || !roomActionTarget) return;
    setRoomError("");
    try {
      if (roomActionTarget.kind === "message") {
        const message = roomMessages.find(item => item.id === roomActionTarget.id);
        if (!message) return;
        await sendDocumentGroupMessage(room.id, {
          body: message.message_kind === "voice" ? "İletilen ses mesajı" : `İletildi\n${message.body}`,
          messageKind: message.message_kind === "voice" ? "voice" : "text",
          mediaMimeType: message.media_mime_type || null,
          mediaData: message.media_data || null,
          mediaDurationMs: message.media_duration_ms || null,
        });
      } else {
        const document = selectedGroup.documents.find(item => item.id === roomActionTarget.id);
        if (!document) return;
        const blob = await getDocumentGroupFileBlob(selectedGroup.group.id, document.id, false);
        const filename = document.document.original_filename || document.document.stored_filename || "dokuman";
        await uploadDocumentGroupFile({
          groupId: room.id,
          file: new File([blob], filename, { type: blob.type || document.document.mime_type || "application/octet-stream" }),
          note: `İletilen doküman: ${selectedGroup.group.name}`,
          tenderId: room.tender_id || document.tender_id || undefined,
          year: room.year || document.year || undefined,
        });
      }
      setRoomActionTarget(null);
      setGroups(await getDocumentGroups());
      setRoomNotice(`${room.name} odasına başarıyla iletildi.`);
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "İletme işlemi tamamlanamadı.");
    }
  };

  const addRoomMember = async () => {
    if (!selectedGroup || !selectedMemberId) return;
    setRoomError("");
    setMemberLoading(true);
    try {
      const detail = await addDocumentGroupMember(selectedGroup.group.id, Number(selectedMemberId));
      setSelectedGroup(detail);
      setSelectedMemberId("");
      setGroups(await getDocumentGroups());
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Alan üyesi eklenemedi.");
    } finally {
      setMemberLoading(false);
    }
  };

  const removeRoomMember = async (memberUserId: number) => {
    if (!selectedGroup) return;
    setRoomError("");
    setMemberLoading(true);
    try {
      const detail = await removeDocumentGroupMember(selectedGroup.group.id, memberUserId);
      setSelectedGroup(detail);
      setGroups(await getDocumentGroups());
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Alan üyesi çıkarılamadı.");
    } finally {
      setMemberLoading(false);
    }
  };

  const toggleDocumentNetworkVisibility = async (targetUser: ERPUser) => {
    if (user.role !== "admin") return;
    setRoomError("");
    setVisibilityLoadingUserId(targetUser.id);
    try {
      const updated = await updateERPUserDocumentNetworkVisibility(
        targetUser.id,
        !targetUser.document_network_visible
      );
      setRoomUsers(prev => prev.map(item => item.id === updated.id ? updated : item));
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Doküman ağı yetkisi güncellenemedi.");
    } finally {
      setVisibilityLoadingUserId(null);
    }
  };

  const selectedCompanyLabel = (tenderId: string | null | undefined) => {
    if (!tenderId) return "";
    return roomTenders.find(item => item.tender_id === tenderId)?.organization || tenderId;
  };

  const updateSelectedGroupCompany = async (selection: { tenderId: string; companyName: string; year?: number }) => {
    if (!selectedGroup) return;
    const hasDocuments = selectedGroup.documents.length > 0;
    const shouldTransfer = hasDocuments
      ? window.confirm("Do you want to transfer the existing documents to the newly selected company folder?")
      : false;
    setRoomError("");
    setRoomLoading(true);
    try {
      const detail = await updateDocumentGroup({
        groupId: selectedGroup.group.id,
        name: selectedGroup.group.name,
        description: selectedGroup.group.description,
        tenderId: selection.tenderId,
        year: selection.year || selectedGroup.group.year || new Date().getFullYear(),
        transferExistingDocuments: shouldTransfer,
      });
      const messages = await getDocumentGroupMessages(selectedGroup.group.id);
      setSelectedGroup(detail);
      setRoomMessages(messages);
      setSelectedRoomTenderId(detail.group.tender_id || "");
      setGroups(await getDocumentGroups());
      setShowMissingCompanyPrompt(false);
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Şirket bağlantısı güncellenemedi.");
    } finally {
      setRoomLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === "all" || activeTab === "rooms") {
      void refreshGroups();
    }
    if (activeTab === "all" || activeTab === "people" || activeTab === "rooms") {
      void refreshRoomUsers();
    }
  }, [activeTab]);

  useEffect(() => {
    void refreshGroups();
    void refreshRoomUsers();
    void refreshDirectMessages();
    void refreshRoomTenders();
  }, [user.id, user.role]);

  useEffect(() => () => {
    if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
    recordStreamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  useEffect(() => {
    if (!openRequest) return;
    const openFromNotification = async () => {
      let messages = directMessages;
      if (messages.length === 0) {
        messages = await getERPDirectMessages(100);
        setDirectMessages(messages);
      }
      if (roomUsers.length === 0) {
        await refreshRoomUsers();
      }
      const targetMessage = messages.find(message => message.id === openRequest.messageId);
      if (!targetMessage) {
        setRoomError("İlgili mesaj bulunamadı.");
        setActiveTab("all");
        setScreen("inbox");
        return;
      }
      setActiveTab("all");
      openDirectThread(resolveDirectTargetFromMessage(targetMessage));
    };
    void openFromNotification().catch(exception => {
      setRoomError(exception instanceof Error ? exception.message : "Mesaj bildirimi açılamadı.");
    });
  }, [openRequest?.nonce]);

  if (screen === "thread") return (
    <div className="flex flex-col h-full min-h-0">
      <TopBar title={directThreadTitle} onBack={() => setScreen("inbox")} />
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {roomError && (
          <Card className="p-3 border-red-500/30 bg-red-500/10">
            <p className="text-xs text-red-300">{roomError}</p>
          </Card>
        )}
        {roomNotice && (
          <Card className="p-3 border-teal-500/30 bg-teal-500/10">
            <p className="text-xs text-teal-200">{roomNotice}</p>
          </Card>
        )}
        {visibleDirectMessages.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Henüz mesaj yok. İlk mesajı gönderin.</p>
          </div>
        )}
        {visibleDirectMessages.map(message => {
          const own = directMessageOwn(message);
          return (
          <div key={message.id} className={`flex gap-2 ${own ? "justify-end" : "justify-start"}`}>
            {!own && <Avatar name={message.sender_name} size="sm" color="bg-slate-700" src={readProfilePhoto(message.sender_user_id || message.sender_name)} />}
            <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 ${own ? "bg-primary text-white rounded-br-sm" : "bg-card border border-border text-foreground rounded-bl-sm"}`}>
              {!own && <p className="text-[10px] font-semibold opacity-70 mb-1">{message.sender_name}</p>}
              {isForwardedLabel(message.body) && (
                <div className={`mb-1 flex items-center gap-1 text-[10px] font-semibold ${own ? "text-white/70" : "text-muted-foreground"}`}>
                  <Share2 className="w-3 h-3" /> İletildi
                </div>
              )}
              {message.message_kind === "voice" && message.media_data ? (
                <div className="min-w-[190px] space-y-2">
                  <div className="flex items-center gap-2">
                    <Mic className={`w-4 h-4 ${own ? "text-white" : "text-primary"}`} />
                    <span className="text-xs font-semibold">Ses mesajı</span>
                    <span className={`ml-auto text-[10px] ${own ? "text-white/70" : "text-muted-foreground"}`}>
                      {formatVoiceDuration(message.media_duration_ms)}
                    </span>
                  </div>
                  <audio controls src={message.media_data} className="w-full h-8" />
                </div>
              ) : message.message_kind === "image" && message.media_data ? (
                <div className="space-y-2">
                  <button onClick={() => previewDirectMedia(message)} className="block w-full">
                    <img src={message.media_data} alt={message.body} className="max-h-56 rounded-xl object-contain bg-black/20" />
                  </button>
                  <p className="text-xs leading-relaxed whitespace-pre-wrap">{forwardedBodyText(message.body)}</p>
                </div>
              ) : message.message_kind === "file" && message.media_data ? (
                <div className="min-w-[190px] space-y-2">
                  <div className="flex items-center gap-2">
                    <FileText className={`w-4 h-4 ${own ? "text-white" : "text-primary"}`} />
                    <span className="text-xs font-semibold line-clamp-2">{message.body}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => previewDirectMedia(message)}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${own ? "bg-white/15 text-white" : "bg-muted text-foreground"}`}
                    >
                      <Eye className="w-3.5 h-3.5" /> Önizle
                    </button>
                    <button
                      onClick={() => downloadDirectMedia(message)}
                      className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${own ? "bg-white/15 text-white" : "bg-primary text-white"}`}
                    >
                      <Download className="w-3.5 h-3.5" /> İndir
                    </button>
                  </div>
                </div>
              ) : (
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{forwardedBodyText(message.body)}</p>
              )}
              <p className={`text-[10px] mt-1 ${own ? "text-white/60" : "text-muted-foreground"}`}>{formatDate(message.created_at)}</p>
            </div>
          </div>
        )})}
        <div className="h-2" />
      </div>
      <div className="shrink-0 border-t border-border px-4 py-3 flex items-end gap-2.5 bg-background">
        <button className="w-9 h-9 flex items-center justify-center rounded-full bg-muted shrink-0">
          <Paperclip className="w-4 h-4 text-muted-foreground" />
        </button>
        {isRecording ? (
          <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-2.5 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />
            <span className="text-sm font-semibold text-red-200">Kaydediliyor</span>
            <span className="ml-auto text-xs font-mono text-red-200">{formatVoiceDuration(recordingMs)}</span>
          </div>
        ) : (
          <div className="flex-1 bg-muted rounded-2xl px-4 py-2.5">
            <textarea rows={1} value={msgText} onChange={e => setMsgText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMsg(); } }}
              placeholder="Mesaj yazın..."
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none" />
          </div>
        )}
        {isRecording && (
          <button onClick={() => stopVoiceRecording(true)} className="w-9 h-9 flex items-center justify-center rounded-full bg-muted shrink-0">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
        {isRecording ? (
          <button onClick={() => stopVoiceRecording(false)} className="w-9 h-9 flex items-center justify-center rounded-full bg-primary shrink-0">
            <Square className="w-4 h-4 text-white fill-white" />
          </button>
        ) : msgText.trim() ? (
          <button onClick={() => void sendMsg()} className="w-9 h-9 flex items-center justify-center rounded-full bg-primary shrink-0">
            <Send className="w-4 h-4 text-white" />
          </button>
        ) : (
          <button
            onClick={() => void startVoiceRecording("direct")}
            disabled={voiceSending}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-primary shrink-0 disabled:opacity-60"
          >
            <Mic className="w-4 h-4 text-white" />
          </button>
        )}
      </div>
      {previewFile && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
          <div className="h-14 px-4 flex items-center gap-3 border-b border-border bg-background">
            <button onClick={closePreviewFile} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
              <X className="w-5 h-5 text-foreground" />
            </button>
            <p className="flex-1 min-w-0 text-sm font-semibold text-foreground truncate">{previewFile.name}</p>
            <button
              onClick={() => {
                const link = document.createElement("a");
                link.href = previewFile.url;
                link.download = previewFile.name;
                document.body.appendChild(link);
                link.click();
                link.remove();
              }}
              className="w-9 h-9 rounded-full bg-primary flex items-center justify-center"
              aria-label="Önizlenen dokümanı indir"
            >
              <Download className="w-4 h-4 text-white" />
            </button>
          </div>
          <div className="flex-1 min-h-0 bg-background">
            {previewFile.type.startsWith("image/") ? (
              <img src={previewFile.url} alt={previewFile.name} className="w-full h-full object-contain" />
            ) : previewFile.type.startsWith("video/") ? (
              <video src={previewFile.url} controls className="w-full h-full" />
            ) : isPdfFile(previewFile) ? (
              <PdfCanvasPreview url={previewFile.url} />
            ) : (
              <iframe src={previewFile.url} title={previewFile.name} className="w-full h-full border-0 bg-white" />
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (screen === "room-thread" && selectedGroup) return (
    <div className="flex flex-col h-full min-h-0">
      <TopBar
        title={
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-foreground truncate">{selectedGroup.group.name}</h1>
              <p className="text-[10px] text-muted-foreground truncate">{selectedGroup.members.length} üye</p>
            </div>
          </div>
        }
        onBack={() => setScreen("inbox")}
      />

      <div className="shrink-0 px-4 py-3 border-b border-border bg-background space-y-3">
        {user.role === "admin" && (
          <CompanyWorkflowPicker
            tenders={roomTenders}
            value={selectedCompanyLabel(selectedGroup.group.tender_id) || "Şirket seçilmedi"}
            onSelect={selection => void updateSelectedGroupCompany(selection)}
            onCreateCompany={createRoomCompany}
          />
        )}
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
          {([
            ["chat", "Sohbet"],
            ["documents", "Dokümanlar"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setRoomView(id)}
              className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                roomView === id ? "bg-primary text-white" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {roomError && (
        <div className="px-4 pt-3 shrink-0">
          <Card className="p-3 border-red-500/30 bg-red-500/10">
            <p className="text-xs text-red-300">{roomError}</p>
          </Card>
        </div>
      )}
      {roomNotice && (
        <div className="px-4 pt-3 shrink-0">
          <Card className="p-3 border-teal-500/30 bg-teal-500/10">
            <p className="text-xs text-teal-200">{roomNotice}</p>
          </Card>
        </div>
      )}

      {roomView === "chat" ? (
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {roomFeed.length === 0 ? (
          <EmptyState icon={MessageSquare} title="Henüz mesaj yok" desc="Mesaj yazın veya doküman gönderin." />
        ) : (
          roomFeed.map(item => item.kind === "message" && item.message ? (
            <div key={item.id} className={`flex items-start gap-2 ${item.message.author_user_id === user.id ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 ${
                item.message.author_user_id === user.id
                  ? "bg-primary text-white rounded-br-sm"
                  : "bg-card border border-border text-foreground rounded-bl-sm"
              }`}>
                {item.message.author_user_id !== user.id && (
                  <p className="text-[10px] font-semibold opacity-70 mb-1">{item.message.author_name}</p>
                )}
                {isForwardedLabel(item.message.body) && (
                  <div className={`mb-1 flex items-center gap-1 text-[10px] font-semibold ${item.message.author_user_id === user.id ? "text-white/70" : "text-muted-foreground"}`}>
                    <Share2 className="w-3 h-3" /> İletildi
                  </div>
                )}
                {item.message.message_kind === "voice" && item.message.media_data ? (
                  <div className="min-w-[190px] space-y-2">
                    <div className="flex items-center gap-2">
                      <Mic className={`w-4 h-4 ${item.message.author_user_id === user.id ? "text-white" : "text-primary"}`} />
                      <span className="text-xs font-semibold">Ses mesajı</span>
                      <span className="ml-auto text-[10px] opacity-70">{formatVoiceDuration(item.message.media_duration_ms)}</span>
                    </div>
                    <audio controls src={item.message.media_data} className="w-full h-8" />
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{forwardedBodyText(item.message.body)}</p>
                )}
                <p className="text-[10px] opacity-60 mt-1">{formatDate(item.message.created_at)}</p>
              </div>
              <button
                onClick={() => setRoomActionTarget({ action: "options", kind: "message", id: item.message!.id, title: item.message!.message_kind === "voice" ? "Ses mesajı" : item.message!.body || "Mesaj" })}
                className="w-8 h-8 mt-1 rounded-full bg-muted flex items-center justify-center shrink-0"
                aria-label="Mesajı sil"
              >
                <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          ) : item.document ? (
            <div key={item.id} className="flex justify-start">
              <Card className="p-3 max-w-[88%]">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {item.document.document.original_filename || item.document.document.stored_filename || `Doküman #${item.document.document_id}`}
                    </p>
                    {item.document.note && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.document.note}</p>}
                    {isForwardedLabel(item.document.note) && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <Share2 className="w-3 h-3" /> İletildi
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-2">
                      {item.document.uploaded_by} · {formatDate(item.document.created_at)}
                    </p>
                    {isImageDocument(item.document) && (
                      <GroupImagePreview
                        groupId={selectedGroup.group.id}
                        document={item.document}
                        onOpen={() => void previewRoomFile(item.document)}
                      />
                    )}
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <button
                        onClick={() => void previewRoomFile(item.document)}
                        className="py-2 rounded-xl bg-muted text-xs font-semibold text-foreground flex items-center justify-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" /> Görüntüle
                      </button>
                      <button
                        onClick={() => void downloadRoomFile(item.document.id, item.document.document.original_filename || item.document.document.stored_filename)}
                        className="py-2 rounded-xl bg-primary text-xs font-semibold text-white flex items-center justify-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" /> İndir
                      </button>
                    </div>
                  </div>
                  <button
                    onClick={() => setRoomActionTarget({
                      action: "options",
                      kind: "document",
                      id: item.document!.id,
                      title: item.document!.document.original_filename || item.document!.document.stored_filename || "Doküman",
                    })}
                    className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0"
                    aria-label="Dokümanı sil"
                  >
                    <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </Card>
            </div>
          ) : null)
        )}
        <div className="h-2" />
      </div>
      ) : (
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        {groupedRoomDocuments.length === 0 ? (
          <EmptyState icon={FolderOpen} title="Doküman yok" desc="Bu alana gönderilen dosyalar burada yıl ve şirket bazında klasörlenir." />
        ) : groupedRoomDocuments.map(yearGroup => (
          <div key={yearGroup.year} className="space-y-3">
            <SectionHeader title={yearGroup.year} />
            {yearGroup.tenders.map(tenderGroup => (
              <Card key={tenderGroup.tenderId} className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-primary" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{tenderGroup.tenderId}</p>
                    <p className="text-[10px] text-muted-foreground">{tenderGroup.items.length} doküman</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {tenderGroup.items.map(item => (
                    <div key={item.id} className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2.5">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {item.document.original_filename || item.document.stored_filename || `Doküman #${item.document_id}`}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">{item.document.document_type} · {formatDate(item.created_at)}</p>
                      </div>
                      <button onClick={() => void previewRoomFile(item)} className="w-8 h-8 rounded-full bg-background/60 flex items-center justify-center">
                        <Eye className="w-4 h-4 text-foreground" />
                      </button>
                      <button
                        onClick={() => void downloadRoomFile(item.id, item.document.original_filename || item.document.stored_filename)}
                        className="w-8 h-8 rounded-full bg-primary flex items-center justify-center"
                      >
                        <Download className="w-4 h-4 text-white" />
                      </button>
                      <button
                        onClick={() => setRoomActionTarget({
                          action: "options",
                          kind: "document",
                          id: item.id,
                          title: item.document.original_filename || item.document.stored_filename || "Doküman",
                        })}
                        className="w-8 h-8 rounded-full bg-background/60 flex items-center justify-center"
                        aria-label="Dokümanı sil"
                      >
                        <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        ))}
      </div>
      )}

      {roomView === "chat" && <div className="shrink-0 border-t border-border px-4 py-3 flex items-end gap-2.5 bg-background">
        <label className="w-9 h-9 flex items-center justify-center rounded-full bg-muted shrink-0 active:opacity-80">
          <Paperclip className="w-4 h-4 text-muted-foreground" />
          <input
            type="file"
            accept="application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.txt,image/*"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void uploadRoomFile(file);
            }}
          />
        </label>
        <label className="w-9 h-9 flex items-center justify-center rounded-full bg-muted shrink-0 active:opacity-80">
          <ImageIcon className="w-4 h-4 text-muted-foreground" />
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void uploadRoomFile(file);
            }}
          />
        </label>
        {isRecording ? (
          <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-2.5 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />
            <span className="text-sm font-semibold text-red-200">Kaydediliyor</span>
            <span className="ml-auto text-xs font-mono text-red-200">{formatVoiceDuration(recordingMs)}</span>
          </div>
        ) : (
          <div className="flex-1 bg-muted rounded-2xl px-4 py-2.5">
            <textarea
              rows={1}
              value={roomMessageText}
              onChange={event => setRoomMessageText(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendRoomMessage();
                }
              }}
              placeholder="Mesaj yazın..."
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none"
            />
          </div>
        )}
        {isRecording && (
          <button onClick={() => stopVoiceRecording(true)} className="w-9 h-9 flex items-center justify-center rounded-full bg-muted shrink-0">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
        {isRecording ? (
          <button onClick={() => stopVoiceRecording(false)} className="w-9 h-9 flex items-center justify-center rounded-full bg-primary shrink-0">
            <Square className="w-4 h-4 text-white fill-white" />
          </button>
        ) : (
          <>
            <button
              onClick={() => void startVoiceRecording("room")}
              disabled={voiceSending}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-muted shrink-0 disabled:opacity-60"
              aria-label="Ses mesajı kaydet"
            >
              <Mic className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={() => void sendRoomMessage()}
              disabled={!roomMessageText.trim()}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-primary shrink-0 disabled:opacity-50"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </>
        )}
      </div>}

      {showMissingCompanyPrompt && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center px-5">
          <Card className="w-full p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-foreground">Şirket seçilmedi</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Bu çalışma alanı için şirket seçmediniz. Şimdi şirket seçmek ister misiniz?
              </p>
            </div>
            <CompanyWorkflowPicker
              tenders={roomTenders}
              value=""
              onSelect={selection => void updateSelectedGroupCompany(selection)}
              onCreateCompany={createRoomCompany}
            />
            <button
              onClick={() => setShowMissingCompanyPrompt(false)}
              className="w-full py-3 rounded-xl bg-muted text-sm font-semibold text-foreground"
            >
              Daha sonra
            </button>
          </Card>
        </div>
      )}

      {roomActionTarget?.action === "options" && (
        <MessageOptionsSheet
          title={roomActionTarget.title}
          onClose={() => setRoomActionTarget(null)}
          onDelete={() => setRoomActionTarget({ ...roomActionTarget, action: "delete" })}
          onForward={() => setRoomActionTarget({ ...roomActionTarget, action: "forward" })}
        />
      )}

      {roomActionTarget?.action === "delete" && (
        <DeleteActionSheet
          title={roomActionTarget.title}
          onClose={() => setRoomActionTarget(null)}
          onDeleteForMe={deleteRoomItemForMe}
          onDeleteForEveryone={() => void deleteRoomItemForEveryone()}
        />
      )}

      {roomActionTarget?.action === "forward" && (
        <ForwardActionSheet
          title={roomActionTarget.title}
          people={roomUsers.filter(item => item.id !== user.id)}
          rooms={groups.filter(item => item.id !== selectedGroup.group.id)}
          onClose={() => setRoomActionTarget(null)}
          onForwardToPerson={person => void forwardRoomItemToPerson(person)}
          onForwardToRoom={room => void forwardRoomItemToRoom(room)}
        />
      )}

      {previewFile && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
          <div className="h-14 px-4 flex items-center gap-3 border-b border-border bg-background">
            <button onClick={closePreviewFile} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
              <X className="w-5 h-5 text-foreground" />
            </button>
            <p className="flex-1 min-w-0 text-sm font-semibold text-foreground truncate">{previewFile.name}</p>
            <a href={previewFile.url} download={previewFile.name} className="w-9 h-9 rounded-full bg-primary flex items-center justify-center">
              <Download className="w-4 h-4 text-white" />
            </a>
          </div>
          <div className="flex-1 min-h-0 bg-background">
            {previewFile.type.startsWith("image/") ? (
              <img src={previewFile.url} alt={previewFile.name} className="w-full h-full object-contain" />
            ) : previewFile.type.startsWith("video/") ? (
              <video src={previewFile.url} controls className="w-full h-full" />
            ) : isPdfFile(previewFile) ? (
              <PdfCanvasPreview url={previewFile.url} />
            ) : (
              <iframe src={previewFile.url} title={previewFile.name} className="w-full h-full border-0 bg-white" />
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <TopBar title="İletişim" />
      <div className="flex px-4 pt-3 border-b border-border shrink-0">
        {(["all", "rooms", "people"] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`flex-1 py-2.5 text-xs font-semibold border-b-2 transition-colors ${activeTab === t ? "text-primary border-primary" : "text-muted-foreground border-transparent"}`}>
            {t === "all" ? "Tümü" : t === "rooms" ? "Alanlar" : "Kişiler"}
          </button>
        ))}
      </div>

      {activeTab === "all" && (
        <div className="flex-1 min-h-0 overflow-y-auto">
          {user.role !== "admin" && (
            <button onClick={() => openDirectThread(null)}
              className="w-full flex items-center gap-3 px-4 py-4 border-b border-border active:bg-muted/30 transition-colors">
              <div className="w-11 h-11 rounded-full bg-teal-600 flex items-center justify-center text-sm font-bold text-white shrink-0">AD</div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold text-foreground">Admin</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{lastDirectMessage?.body || "Kişisel konuşma"}</p>
              </div>
              <span className="text-[10px] text-muted-foreground shrink-0">{lastDirectMessage ? formatDate(lastDirectMessage.created_at) : ""}</span>
            </button>
          )}
          {groups.map(group => (
            <button
              key={group.id}
              onClick={() => openGroup(group.id)}
              className="w-full flex items-center gap-3 px-4 py-4 border-b border-border active:bg-muted/30 transition-colors"
            >
              <div className="w-11 h-11 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold text-foreground truncate">{group.name}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {[group.tender_id ? selectedCompanyLabel(group.tender_id) : "Şirket seçilmedi", `${group.document_count} doküman`, `${group.member_count} üye`].join(" · ")}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          ))}
          {user.role === "admin" && groups.length === 0 && (
            <EmptyState icon={MessageSquare} title="Sohbet yok" desc="Çalışma alanı oluşturduğunuzda konuşmalar burada görünecek." />
          )}
        </div>
      )}

      {activeTab === "rooms" && (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
          {roomError && (
            <Card className="p-3 border-red-500/30 bg-red-500/10">
              <p className="text-xs text-red-300">{roomError}</p>
            </Card>
          )}

          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Yeni Çalışma Alanı</h3>
            </div>
            <CompanyWorkflowPicker
              tenders={roomTenders}
              value={groupTenderId ? groupName || selectedCompanyLabel(groupTenderId) : ""}
              onSelect={selection => {
                setGroupTenderId(selection.tenderId);
                setGroupYear(String(selection.year || Number(groupYear) || new Date().getFullYear()));
                if (!groupName.trim() || groupName === groupTenderId) {
                  setGroupName(selection.companyName);
                }
              }}
              onCreateCompany={createRoomCompany}
            />
            <input
              value={groupYear}
              onChange={event => setGroupYear(event.target.value.replace(/[^\d]/g, "").slice(0, 4))}
              placeholder="Yıl"
              inputMode="numeric"
              className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <input
              value={groupName}
              onChange={event => setGroupName(event.target.value)}
              placeholder="Çalışma alanı adı"
              className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <textarea
              value={groupDesc}
              onChange={event => setGroupDesc(event.target.value)}
              rows={2}
              placeholder="Açıklama"
              className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none"
            />
            <button
              onClick={createRoom}
              disabled={roomLoading || !groupName.trim() || groupYear.length !== 4}
              className="w-full py-3 bg-primary rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Yayınla
            </button>
          </Card>

          {roomLoading && groups.length === 0 && !selectedGroup ? (
            <EmptyState icon={Clock} title="Yükleniyor" desc="Doküman odaları açılıyor." />
          ) : groups.length === 0 ? (
            <EmptyState icon={FolderOpen} title="Alan yok" desc="İlk çalışma alanını oluşturun." />
          ) : (
            <div className="space-y-2">
              <SectionHeader title="Çalışma Alanları" />
              {groups.map(group => (
                <button
                  key={group.id}
                  onClick={() => openGroup(group.id)}
                  className={`w-full text-left rounded-xl border p-4 transition-colors ${
                    selectedGroup?.group.id === group.id
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-card active:bg-muted/30"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                      <FolderOpen className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-foreground truncate">{group.name}</p>
                      {group.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{group.description}</p>}
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                        <span>{group.tender_id ? selectedCompanyLabel(group.tender_id) : "Şirket seçilmedi"}</span>
                        <span>{group.member_count} üye</span>
                        <span>{group.document_count} doküman</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground mt-3" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {selectedGroup ? false && (
            <div className="space-y-3">
              <SectionHeader title={selectedGroup!.group.name} />
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Users className="w-4 h-4 text-primary shrink-0" />
                    <h3 className="text-sm font-bold text-foreground">Üyeler</h3>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{selectedGroup!.members.length} kişi</span>
                </div>

                {user.role === "admin" && (
                  <div className="flex gap-2">
                    <select
                      value={selectedMemberId}
                      onChange={event => setSelectedMemberId(event.target.value)}
                      className="flex-1 min-w-0 bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground outline-none"
                    >
                      <option value="">Çalışan seç</option>
                      {availableRoomUsers.map(roomUser => (
                        <option key={roomUser.id} value={roomUser.id}>
                          {roomUser.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={addRoomMember}
                      disabled={memberLoading || !selectedMemberId}
                      className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center shrink-0 disabled:opacity-50"
                      aria-label="Üye ekle"
                    >
                      <UserPlus className="w-4 h-4 text-white" />
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  {selectedGroup!.members.map(member => (
                    <div key={member.id} className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2.5">
                      <Avatar name={member.name || member.email || `#${member.user_id}`} size="sm" src={userPhoto(member)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{member.name || member.email || `Kullanıcı #${member.user_id}`}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{member.role === "owner" ? "Alan sahibi" : "Üye"}</p>
                      </div>
                      {user.role === "admin" && member.user_id !== user.id && member.role !== "owner" && (
                        <button
                          onClick={() => void removeRoomMember(member.user_id)}
                          disabled={memberLoading}
                          className="w-8 h-8 rounded-full bg-background/60 flex items-center justify-center shrink-0 disabled:opacity-50"
                          aria-label="Üyeyi çıkar"
                        >
                          <X className="w-4 h-4 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-4 space-y-3">
                <textarea
                  value={uploadNote}
                  onChange={event => setUploadNote(event.target.value)}
                  rows={2}
                  placeholder="Doküman notu"
                  className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none"
                />
                <label className="w-full py-3 bg-primary rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 active:opacity-80">
                  <Upload className="w-4 h-4" /> Doküman Yükle
                  <input
                    type="file"
                    className="hidden"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      void uploadRoomFile(file);
                    }}
                  />
                </label>
              </Card>

              <div className="space-y-2">
                <SectionHeader title="Alan Akışı" />
                {roomFeed.length === 0 ? (
                  <EmptyState icon={MessageSquare} title="Akış boş" desc="Mesaj yazın veya ilk dokümanı yükleyin." />
                ) : (
                  <div className="space-y-2">
                    {roomFeed.map(item => item.kind === "message" && item.message ? (
                      <div key={item.id} className={`flex ${item.message.author_user_id === user.id ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 ${
                          item.message.author_user_id === user.id
                            ? "bg-primary text-white rounded-br-sm"
                            : "bg-card border border-border text-foreground rounded-bl-sm"
                        }`}>
                          <p className="text-[10px] font-semibold opacity-70 mb-1">{item.message.author_name}</p>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{item.message.body}</p>
                          <p className="text-[10px] opacity-60 mt-1">{formatDate(item.message.created_at)}</p>
                        </div>
                      </div>
                    ) : item.document ? (
                      <Card key={item.id} className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {item.document.document.original_filename || item.document.document.stored_filename || `Doküman #${item.document.document_id}`}
                            </p>
                            {item.document.note && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.document.note}</p>}
                            <p className="text-[10px] text-muted-foreground mt-2">
                              {item.document.uploaded_by} · {formatDate(item.document.created_at)}
                            </p>
                            <div className="grid grid-cols-2 gap-2 mt-3">
                              <button
                                onClick={() => void previewRoomFile(item.document)}
                                className="py-2 rounded-xl bg-muted text-xs font-semibold text-foreground flex items-center justify-center gap-1.5"
                              >
                                <Eye className="w-3.5 h-3.5" /> Görüntüle
                              </button>
                              <button
                                onClick={() => void downloadRoomFile(item.document.id, item.document.document.original_filename || item.document.document.stored_filename)}
                                className="py-2 rounded-xl bg-primary text-xs font-semibold text-white flex items-center justify-center gap-1.5"
                              >
                                <Download className="w-3.5 h-3.5" /> İndir
                              </button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ) : null)}
                  </div>
                )}
              </div>

              <div className="shrink-0 border border-border rounded-2xl bg-card p-2 flex items-end gap-2">
                <textarea
                  value={roomMessageText}
                  onChange={event => setRoomMessageText(event.target.value)}
                  rows={1}
                  placeholder="Alana mesaj yazın..."
                  className="flex-1 bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none"
                />
                <button
                  onClick={sendRoomMessage}
                  disabled={!roomMessageText.trim()}
                  className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 disabled:opacity-50"
                  aria-label="Alan mesajı gönder"
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>

              {selectedGroup!.documents.length === 0 ? (
                <EmptyState icon={FileText} title="Doküman yok" desc="Bu odaya ilk dokümanı yükleyin." />
              ) : (
                <div className="space-y-2">
                  <SectionHeader title="Dokümanlar" />
                  {selectedGroup!.documents.map(item => (
                    <Card key={item.id} className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {item.document.original_filename || item.document.stored_filename || `Doküman #${item.document_id}`}
                          </p>
                          {item.note && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.note}</p>}
                          <p className="text-[10px] text-muted-foreground mt-2">
                            {item.uploaded_by} · {formatDate(item.created_at)}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => void previewRoomFile(item)}
                            className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
                            aria-label="Dokümanı görüntüle"
                          >
                            <Eye className="w-4 h-4 text-foreground" />
                          </button>
                          <button
                            onClick={() => void downloadRoomFile(item.id, item.document.original_filename || item.document.stored_filename)}
                            className="w-9 h-9 rounded-full bg-primary flex items-center justify-center"
                            aria-label="Dokümanı indir"
                          >
                            <Download className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          <div className="h-8" />
        </div>
      )}

      {activeTab === "people" && (
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5">
          {roomUsers.length === 0 ? (
            <EmptyState icon={Users} title="Kişi yok" desc="Onaylı çalışanlar burada görünecek." />
          ) : (
            userDirectorySections.map(section => (
              <div key={section.title} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{section.title}</h3>
                  <span className="text-[10px] text-muted-foreground">{section.items.length}</span>
                </div>
                {section.items.length === 0 ? (
                  <Card className="p-3">
                    <p className="text-xs text-muted-foreground">Bu bölümde kullanıcı yok.</p>
                  </Card>
                ) : (
                  <Card className="divide-y divide-border overflow-hidden">
                    {section.items.map(roomUser => {
                      const isSelf = user.id === roomUser.id;
                      return (
                        <div key={roomUser.id} className="w-full flex items-center gap-2 px-3 py-2.5">
                          <button
                            onClick={() => !isSelf && openDirectThread(roomUser)}
                            disabled={isSelf}
                            className="flex-1 min-w-0 flex items-center gap-3 text-left rounded-xl px-0 py-1 disabled:opacity-70 active:bg-muted/30"
                          >
                            <Avatar
                              name={roomUser.name}
                              size="sm"
                              color={roomUser.role === "admin" ? "bg-teal-600" : "bg-slate-700"}
                              src={userPhoto(roomUser)}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">{roomUser.name}</p>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {roomUser.email || "E-posta yok"} · {roomUser.role === "admin" ? "Admin" : "Kullanıcı"}
                              </p>
                            </div>
                            {isSelf ? (
                              <span className="px-2.5 py-1.5 rounded-xl bg-muted text-[10px] font-bold text-muted-foreground shrink-0">Siz</span>
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            )}
                          </button>
                          {user.role === "admin" && (
                            <button
                              onClick={() => void toggleDocumentNetworkVisibility(roomUser)}
                              disabled={visibilityLoadingUserId === roomUser.id}
                              className={`px-3 py-2 rounded-xl text-[10px] font-bold shrink-0 disabled:opacity-50 ${
                                roomUser.document_network_visible
                                  ? "bg-primary text-white"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              Ağ
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </Card>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {previewFile && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
          <div className="h-14 px-4 flex items-center gap-3 border-b border-border bg-background">
            <button onClick={closePreviewFile} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
              <X className="w-5 h-5 text-foreground" />
            </button>
            <p className="flex-1 min-w-0 text-sm font-semibold text-foreground truncate">{previewFile.name}</p>
            <a
              href={previewFile.url}
              download={previewFile.name}
              className="w-9 h-9 rounded-full bg-primary flex items-center justify-center"
              aria-label="Önizlenen dokümanı indir"
            >
              <Download className="w-4 h-4 text-white" />
            </a>
          </div>
          <div className="flex-1 min-h-0 bg-background">
            {previewFile.type.startsWith("image/") ? (
              <img src={previewFile.url} alt={previewFile.name} className="w-full h-full object-contain" />
            ) : previewFile.type.startsWith("video/") ? (
              <video src={previewFile.url} controls className="w-full h-full" />
            ) : isPdfFile(previewFile) ? (
              <PdfCanvasPreview url={previewFile.url} />
            ) : (
              <iframe src={previewFile.url} title={previewFile.name} className="w-full h-full border-0 bg-white" />
            )}
          </div>
        </div>
      )}
    </div>
  );
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
  const [notifsToggle, setNotifsToggle] = useState(true);
  const [showConfirm, setShowConfirm] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState(() => readProfilePhoto(user.id || user.email));

  const handleProfilePhoto = async (file: File | undefined) => {
    if (!file) return;
    const dataUrl = await blobToDataUrl(file);
    writeProfilePhoto(user.id || user.email, dataUrl);
    setProfilePhoto(dataUrl);
    onProfilePhotoChange();
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
              { label: "Karanlık Tema", desc: "Göz yorgunluğunu azalt", val: darkToggle, toggle: () => setDarkToggle(v => !v) },
              { label: "Bildirimler",   desc: "Push bildirimlerini al",  val: notifsToggle, toggle: () => setNotifsToggle(v => !v) },
            ].map((s, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-4">
                <div>
                  <p className="text-sm font-medium text-foreground">{s.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                </div>
                <button onClick={s.toggle}
                  className={`w-11 h-6 rounded-full transition-colors relative ${s.val ? "bg-primary" : "bg-muted"}`}>
                  <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${s.val ? "translate-x-5" : "translate-x-0.5"}`}
                    style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
                </button>
              </div>
            ))}
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
  const [authUser, setAuthUser] = useState<AuthUser | null>(() => {
    const stored = loadStoredUser();
    return stored ? { id: stored.id, name: stored.name, email: stored.email, role: stored.role, dept: stored.dept } : null;
  });
  const [tab, setTab] = useState<Tab>("home");
  const [directMessageOpenRequest, setDirectMessageOpenRequest] = useState<DirectMessageOpenRequest | null>(null);
  const [profilePhotoVersion, setProfilePhotoVersion] = useState(0);

  useEffect(() => {
    if (!authUser) return;
    void registerNativePushNotifications().catch(error => {
      console.warn("Native push setup failed.", error);
    });
  }, [authUser?.email]);

  const handleLogin = (u: AuthUser) => {
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

  return (
    <div
      className="docsbot-mobile-shell flex flex-col bg-background text-foreground overflow-hidden"
      style={{ fontFamily: "'Inter', sans-serif", height: "100dvh", width: "100%", maxWidth: 480, margin: "0 auto" }}
    >
      {!authUser ? (
        <LoginScreen onLogin={handleLogin} />
      ) : (
        <>
          <div className="flex-1 min-h-0 overflow-hidden relative">
            {(["home", "erp", "tender", "messages", "profile"] as Tab[]).map(t => {
              // Kullanıcılar tender göremiyor
              if (t === "tender" && authUser.role !== "admin") return null;
              return (
                <div key={t} className={`absolute inset-0 ${tab === t ? "flex flex-col min-h-0" : "hidden"}`}>
                  <div className={`flex-1 min-h-0 ${t === "messages" ? "overflow-hidden" : "overflow-y-auto"}`}>
                    {t === "home"     && <HomeTab     user={authUser} setTab={setTab} />}
                    {t === "erp"      && <ERPTab      user={authUser} onOpenDirectMessage={openDirectMessageFromNotification} />}
                    {t === "tender"   && <TenderTab   user={authUser} />}
                    {t === "messages" && <MessagesTab user={authUser} openRequest={directMessageOpenRequest} profilePhotoVersion={profilePhotoVersion} />}
                    {t === "profile"  && <ProfileTab  user={authUser} onLogout={handleLogout} onProfilePhotoChange={() => setProfilePhotoVersion(value => value + 1)} />}
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
