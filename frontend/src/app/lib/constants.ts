import {
  ERPSession,
} from "../api";
import type { Page, NotificationUrgency } from "./types";

export const STATUS_COLORS: Record<string, string> = {
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

export const DEFAULT_ADMIN_SESSION: ERPSession = {
  role: "admin",
  name: "Ahmet Yılmaz",
  user_id: null,
  email: null,
};

export const SESSION_STORAGE_KEYS = ["docsbot.erp.session", "docsbot_session", "erpSession"];
export const BROWSER_NOTIFICATION_KEY = "docsbot.browser_notifications.enabled";

export const URGENCY_ICON_CLASSES: Record<NotificationUrgency, string> = {
  critical: "bg-red-100 text-red-600",
  high: "bg-amber-100 text-amber-700",
  normal: "bg-teal-100 text-teal-700",
};

export const URGENCY_DOT_CLASSES: Record<NotificationUrgency, string> = {
  critical: "bg-red-500 animate-pulse",
  high: "bg-amber-500",
  normal: "bg-teal-500",
};

export const URGENCY_UNREAD_ROW_CLASSES: Record<NotificationUrgency, string> = {
  critical: "bg-red-50/60 border-l-2 border-l-red-500",
  high: "bg-amber-50/50 border-l-2 border-l-amber-400",
  normal: "bg-teal-50/40",
};

// ─── PAGE TITLES ──────────────────────────────────────────────────────────────
export const PAGE_TITLES: Record<Page, string> = {
  home: "Ana Sayfa",
  "erp-overview": "ERP-TAKIP — Genel Bakış",
  employees: "Çalışanlar",
  tasks: "Görevler",
  approvals: "Tamamlama Onayları",
  messages: "Mesajlar",
  "company-chat": "Şirket Geneli",
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
  feedback: "Dönütler & Duyuru",
};
