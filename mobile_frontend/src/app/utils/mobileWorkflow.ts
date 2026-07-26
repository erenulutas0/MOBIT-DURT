import type { DocumentGroupDocument, ERPOverview, ERPTask, ERPUser, MobileAppUpdateInfo, Tender } from "../api";

export function appUpdateBannerView(update: MobileAppUpdateInfo) {
  return {
    required: update.required,
    title: update.title || "Yeni versiyon geldi",
    message: update.required
      ? "Uygulamanızı düzgün kullanmanız için güncellemeniz gerekmektedir."
      : update.message || "Uygulamayı düzgün kullanmanız için güncellemeniz öneriliyor.",
    versionLabel: `v${update.current_version} → v${update.latest_version}`,
    buttonLabel: "Güncelle",
    tone: update.required ? "required" : "optional",
  } as const;
}

export function companySlug(value: string) {
  return value
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/[^A-ZÇĞİÖŞÜ0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32) || "SIRKET";
}

// Common Turkish tender-issuing organisations offered as one-tap presets when creating a tender
// group, so the user doesn't have to type them. Any organisation not on this list can still be
// added via the free-text "Yeni şirket ekle" option.
export const PRESET_TENDER_COMPANIES = [
  "BEDAŞ",
  "İBB",
  "ASELSAN",
  "ROKETSAN",
  "TEİAŞ",
  "EÜAŞ",
  "TEDAŞ",
  "TCDD",
  "BOTAŞ",
  "DSİ",
  "Karayolları Genel Müdürlüğü",
  "HAVELSAN",
  "MKE",
  "İSKİ",
  "ASKİ",
];

// Presets not already present in the tender list, filtered by the search query.
export function presetCompanyOptions(tenders: Tender[], query: string) {
  const existing = new Set(
    companyOptionsFromTenders(tenders).map(tender => tender.organization.toLocaleLowerCase("tr-TR"))
  );
  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
  return PRESET_TENDER_COMPANIES.filter(name => {
    const key = name.toLocaleLowerCase("tr-TR");
    if (existing.has(key)) return false;
    return !normalizedQuery || key.includes(normalizedQuery);
  });
}

export function companyOptionsFromTenders(tenders: Tender[]) {
  const companies = new Map<string, Tender>();
  for (const tender of tenders) {
    const organization = tender.organization.trim();
    if (!organization) continue;
    const key = organization.toLocaleLowerCase("tr-TR");
    const current = companies.get(key);
    if (!current || tender.year > current.year || tender.created_at > current.created_at) {
      companies.set(key, { ...tender, organization });
    }
  }
  return [...companies.values()].sort((left, right) =>
    left.organization.localeCompare(right.organization, "tr", { sensitivity: "base" })
  );
}

export function filterCompanyOptions(tenders: Tender[], query: string) {
  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
  const options = companyOptionsFromTenders(tenders);
  if (!normalizedQuery) return options;
  return options.filter(item =>
    item.organization.toLocaleLowerCase("tr-TR").includes(normalizedQuery)
  );
}

export function canCreateCompanyOption(tenders: Tender[], query: string) {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length < 2) return false;
  return !companyOptionsFromTenders(tenders).some(item =>
    item.organization.localeCompare(trimmedQuery, "tr", { sensitivity: "base" }) === 0
  );
}

export function microphoneErrorMessage(exception?: unknown) {
  if (exception instanceof DOMException && (exception.name === "NotAllowedError" || exception.name === "SecurityError")) {
    return "Mikrofon izni kapalı. Telefon ayarlarından Mobit uygulaması için mikrofon iznini açın ve tekrar deneyin.";
  }
  if (exception instanceof Error && /permission|denied|notallowed/i.test(exception.message)) {
    return "Mikrofon izni alınamadı. Telefon ayarlarından Mobit uygulamasına mikrofon izni verin.";
  }
  return "Ses kaydı başlatılamadı. Mikrofon iznini ve cihaz ayarlarını kontrol edin.";
}

export function isForwardedLabel(value: string | null | undefined) {
  return Boolean(value && /^İletil(en|di)/i.test(value.trim()));
}

export function forwardedBodyText(value: string) {
  return value.replace(/^İletildi\s*\n/i, "").trim();
}

export function forwardedDocumentName(value: string) {
  return value
    .replace(/^İletilen doküman:\s*/i, "")
    .replace(/^İletildi\s*·\s*/i, "")
    .trim() || "dokuman";
}

const MONTH_NAMES_TR = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık",
];

// Obsidian-like tender archive: year → month → tender-issuing company → documents. The month is
// derived from each document's upload date (no dedicated field needed). Years and months sort
// newest-first; companies sort alphabetically.
export function groupDocumentsByYearMonthTender(documents: DocumentGroupDocument[]) {
  const byYear = new Map<string, Map<string, Map<string, DocumentGroupDocument[]>>>();
  for (const item of documents) {
    const uploaded = new Date(item.created_at);
    const valid = !Number.isNaN(uploaded.getTime());
    const year = String(item.year || item.document.year || (valid ? uploaded.getFullYear() : new Date().getFullYear()));
    const monthKey = String(valid ? uploaded.getMonth() : 0).padStart(2, "0");
    const tenderId = item.tender_id || item.document.tender_id || "Genel";
    if (!byYear.has(year)) byYear.set(year, new Map());
    const months = byYear.get(year)!;
    if (!months.has(monthKey)) months.set(monthKey, new Map());
    const tenders = months.get(monthKey)!;
    if (!tenders.has(tenderId)) tenders.set(tenderId, []);
    tenders.get(tenderId)!.push(item);
  }
  return [...byYear.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([year, months]) => ({
      year,
      months: [...months.entries()]
        .sort(([left], [right]) => right.localeCompare(left))
        .map(([monthKey, tenders]) => ({
          monthKey,
          monthLabel: MONTH_NAMES_TR[Number(monthKey)] || "",
          tenders: [...tenders.entries()]
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([tenderId, items]) => ({ tenderId, items })),
        })),
    }));
}

export function groupDocumentsByYearTender(documents: DocumentGroupDocument[]) {
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

export function taskAssignees(task: ERPTask, overview: ERPOverview | null) {
  const assignments = overview?.assignments.filter(item => item.task_id === task.id && item.assignee_user_id) || [];
  return assignments
    .map(assignment => overview?.users.find(item => item.id === assignment.assignee_user_id))
    .filter((item): item is ERPUser => Boolean(item));
}

export function taskAssigneeName(task: ERPTask, overview: ERPOverview | null) {
  const users = taskAssignees(task, overview);
  if (users.length === 0) return "Atanmamış";
  if (users.length === 1) return users[0].name;
  return `${users[0].name} +${users.length - 1}`;
}

export function deadlineRemainingLabel(value: string | null | undefined) {
  if (!value) return "Zaman belirlenmedi";
  const deadline = new Date(value);
  if (Number.isNaN(deadline.getTime())) return "Zaman belirlenmedi";
  const diff = deadline.getTime() - Date.now();
  const abs = Math.abs(diff);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const minutes = Math.floor((abs % 3_600_000) / 60_000);
  const detail = days > 0 ? `${days} gün ${hours} saat` : hours > 0 ? `${hours} saat ${minutes} dk` : `${minutes} dk`;
  return diff < 0 ? `${detail} gecikti` : `${detail} kaldı`;
}

/**
 * Reads a task's dates back the way they were entered. A bare date tells you nothing about intent —
 * "12 Ağustos" could mean start then, finish by then, or the near end of a window — so the phrasing
 * carries the kind. Used on the create form and on the task itself so both say the same thing.
 */
export function scheduleSummary(
  kind: string | null | undefined,
  startsAt: string | null,
  deadlineAt: string | null,
  // Takes the caller's date formatter so the phrasing matches the rest of that screen.
  formatDate: (value: string | null) => string,
): string {
  const start = startsAt ? formatDate(startsAt) : "";
  const due = deadlineAt ? formatDate(deadlineAt) : "";
  switch (kind) {
    case "after":
      if (!start) return "Başlangıç tarihi belirlenmedi";
      return due ? `${start} sonrası · en geç ${due}` : `${start} tarihinden sonra`;
    case "between":
      if (!start || !due) return "Tarih aralığı eksik";
      return `${start} — ${due} arasında`;
    case "before":
      return due ? `${due} tarihinden önce` : "Termin belirlenmedi";
    case "until":
      return due ? `${due} tarihine kadar` : "Termin belirlenmedi";
    default:
      if (!due) return "Zaman belirlenmedi";
      return `Teslim: ${due} · ${deadlineRemainingLabel(deadlineAt)}`;
  }
}

export function initials(value: string | null | undefined) {
  return (value || "K")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toLocaleUpperCase("tr-TR") || "")
    .join("") || "K";
}
