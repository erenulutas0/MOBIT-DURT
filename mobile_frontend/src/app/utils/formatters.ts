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

export function taskStatusLabel(status: string) {
  return TASK_STATUS_LABELS[status] || status;
}

export function taskPriorityLabel(priority: string) {
  return TASK_PRIORITY_LABELS[priority] || priority;
}

export function employeeStatusLabel(status: string) {
  if (status === "online") return "Çevrimiçi";
  if (status === "away") return "Uzakta";
  return "Çevrimdışı";
}

export function formatDate(value: string | null) {
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

export function dayKey(value: string | null) {
  if (!value) return "unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return new Intl.DateTimeFormat("tr-TR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function formatDayLabel(value: string | null) {
  if (!value) return "Tarih yok";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tarih yok";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(value) === dayKey(today.toISOString())) return "Bugün";
  if (dayKey(value) === dayKey(yesterday.toISOString())) return "Dün";
  return new Intl.DateTimeFormat("tr-TR", {
    day: "2-digit",
    month: "long",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  }).format(date);
}

export function formatFileSize(value: number | null) {
  if (!value) return "Boyut yok";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function tenderStatusLabel(status: string) {
  if (status === "classified") return "Sınıflandırıldı";
  if (status === "unclassified") return "Sınıflandırılmamış";
  if (status === "active") return "Aktif";
  return status;
}

export function formatVoiceDuration(milliseconds?: number | null) {
  const totalSeconds = Math.max(0, Math.round((milliseconds || 0) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
