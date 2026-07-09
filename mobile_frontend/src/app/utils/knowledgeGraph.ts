import type { DocumentGroupSummary, Tender, TenderDocument, VaultNote } from "../api";

export type KnowledgeGraphStatus = "Onaylandı" | "İncelemede" | "Taslak" | "Reddedildi" | "Arşiv";

export type KnowledgeGraphNode = {
  id: string;
  label: string;
  shortLabel: string;
  x: number;
  y: number;
  cat: string;
  status: KnowledgeGraphStatus;
  r: number;
  owner: string;
  dept: string;
  version: string;
  date: string;
  desc: string;
  entity?: { kind: "document"; id: number } | { kind: "note"; name: string } | { kind: "room"; id: number };
};

export type KnowledgeGraphEdge = { s: string; t: string; str: "strong" | "med" | "weak" };

export type KnowledgeGraphData = {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  dynamic: boolean;
};

const fallbackNodes: KnowledgeGraphNode[] = [
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

const fallbackEdges: KnowledgeGraphEdge[] = [
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

export const KG_CAT_COLORS: Record<string, string> = {
  system: "#14B8A6",
  finance: "#F59E0B",
  hr: "#8B5CF6",
  tender: "#A78BFA",
  contracts: "#F97316",
  inventory: "#06B6D4",
  reports: "#EC4899",
  sales: "#3B82F6",
  approvals: "#10B981",
  documents: "#22C55E",
  rooms: "#38BDF8",
  notes: "#FACC15",
};

export const KG_CAT_LABELS: Record<string, string> = {
  system: "Sistem",
  finance: "Finans",
  hr: "İK",
  tender: "Şirket",
  contracts: "Sözleşme",
  inventory: "Stok",
  reports: "Rapor",
  sales: "Satış",
  approvals: "Onay",
  documents: "Belge",
  rooms: "Alan",
  notes: "Not",
};

function safeId(prefix: string, value: string | number | null | undefined) {
  return `${prefix}_${String(value || "GENEL")
    .trim()
    .toLocaleUpperCase("tr-TR")
    .replace(/[^A-ZÇĞİÖŞÜ0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || "GENEL"}`;
}

function shortLabel(value: string | null | undefined, fallback: string) {
  const clean = (value || fallback).trim();
  return clean.length <= 7 ? clean : clean.slice(0, 7);
}

function formatGraphDate(value: string | null | undefined) {
  if (!value) return "Tarih yok";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Tarih yok";
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short" }).format(date);
}

function statusLabel(value: string | null | undefined): KnowledgeGraphStatus {
  if (value === "classified" || value === "active" || value === "stored") return "Onaylandı";
  if (value === "unclassified" || value === "pending") return "İncelemede";
  if (value === "rejected") return "Reddedildi";
  if (value === "archived") return "Arşiv";
  return "Taslak";
}

function nodePosition(index: number, total: number, radius = 92) {
  const angle = (Math.PI * 2 * index) / Math.max(1, total) - Math.PI / 2;
  return {
    x: Math.round(180 + Math.cos(angle) * radius),
    y: Math.round(145 + Math.sin(angle) * radius),
  };
}

function pushUniqueEdge(edges: KnowledgeGraphEdge[], edge: KnowledgeGraphEdge) {
  if (!edge.s || !edge.t || edge.s === edge.t) return;
  if (edges.some(item => item.s === edge.s && item.t === edge.t)) return;
  edges.push(edge);
}

export function buildKnowledgeGraphData(input: {
  documents: TenderDocument[];
  tenders: Tender[];
  vaultNotes: VaultNote[];
  documentGroups: DocumentGroupSummary[];
}): KnowledgeGraphData {
  const hasLiveData = input.documents.length > 0
    || input.tenders.length > 0
    || input.vaultNotes.length > 0
    || input.documentGroups.length > 0;
  if (!hasLiveData) {
    return { nodes: fallbackNodes, edges: fallbackEdges, dynamic: false };
  }

  const nodes = new Map<string, KnowledgeGraphNode>();
  const edges: KnowledgeGraphEdge[] = [];
  const companyIds = new Map<string, string>();

  const addNode = (node: KnowledgeGraphNode) => {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
  };

  addNode({
    id: "ERP_CORE",
    label: "Mobit Operasyon Merkezi",
    shortLabel: "OPS",
    x: 180,
    y: 145,
    cat: "system",
    status: "Onaylandı",
    r: 17,
    owner: "Mobit",
    dept: "Operasyon",
    version: "Canlı",
    date: formatGraphDate(new Date().toISOString()),
    desc: "Şirket, çalışma alanı, belge ve bilgi notu ağının merkez kaydı.",
  });
  addNode({
    id: "VAULT",
    label: "Bilgi Ağı",
    shortLabel: "AĞ",
    x: 180,
    y: 74,
    cat: "system",
    status: "Onaylandı",
    r: 14,
    owner: "Mobit",
    dept: "Bilgi",
    version: `${input.vaultNotes.length} not`,
    date: formatGraphDate(new Date().toISOString()),
    desc: "Vault notları, dokümanlar ve çalışma alanlarının canlı bağlantı noktası.",
  });
  pushUniqueEdge(edges, { s: "ERP_CORE", t: "VAULT", str: "strong" });

  const companies = new Map<string, {
    organization: string;
    year: number | null;
    tenderCount: number;
    documentCount: number;
    roomCount: number;
    latest: string | null;
    status: string | null;
  }>();

  for (const tender of input.tenders) {
    const name = tender.organization?.trim() || "Genel";
    const current = companies.get(name) || {
      organization: name,
      year: null,
      tenderCount: 0,
      documentCount: 0,
      roomCount: 0,
      latest: null,
      status: tender.status,
    };
    current.tenderCount += 1;
    current.year = Math.max(current.year || 0, tender.year || 0) || current.year;
    current.latest = !current.latest || tender.created_at > current.latest ? tender.created_at : current.latest;
    current.status = tender.status || current.status;
    companies.set(name, current);
  }

  for (const document of input.documents) {
    const name = document.organization?.trim() || "Genel";
    const current = companies.get(name) || {
      organization: name,
      year: document.year,
      tenderCount: 0,
      documentCount: 0,
      roomCount: 0,
      latest: null,
      status: document.status,
    };
    current.documentCount += 1;
    current.year = Math.max(current.year || 0, document.year || 0) || current.year;
    current.latest = !current.latest || document.timestamp > current.latest ? document.timestamp : current.latest;
    current.status = document.status || current.status;
    companies.set(name, current);
  }

  for (const room of input.documentGroups) {
    const companyName = room.tender_id?.split("-")[0]?.replace(/_/g, " ") || "Genel";
    const current = companies.get(companyName) || {
      organization: companyName,
      year: room.year,
      tenderCount: 0,
      documentCount: 0,
      roomCount: 0,
      latest: null,
      status: room.archived_at ? "archived" : "active",
    };
    current.roomCount += 1;
    current.documentCount += room.document_count || 0;
    current.year = Math.max(current.year || 0, room.year || 0) || current.year;
    current.latest = !current.latest || room.updated_at > current.latest ? room.updated_at : current.latest;
    companies.set(companyName, current);
  }

  [...companies.values()].slice(0, 12).forEach((company, index, list) => {
    const id = safeId("COMPANY", company.organization);
    companyIds.set(company.organization.toLocaleLowerCase("tr-TR"), id);
    const position = nodePosition(index, list.length, 88);
    addNode({
      id,
      label: company.organization,
      shortLabel: shortLabel(company.organization, "Şirket"),
      x: position.x,
      y: position.y,
      cat: "tender",
      status: statusLabel(company.status),
      r: Math.min(14, 8 + company.documentCount + company.roomCount),
      owner: "Doküman Ağı",
      dept: "Şirket",
      version: `${company.tenderCount} kayıt`,
      date: formatGraphDate(company.latest),
      desc: `${company.documentCount} belge, ${company.roomCount} çalışma alanı ve ${company.tenderCount} şirket kaydı bağlı.`,
    });
    pushUniqueEdge(edges, { s: "ERP_CORE", t: id, str: "strong" });
  });

  input.documentGroups.slice(0, 10).forEach((room, index) => {
    const id = safeId("ROOM", room.id);
    const position = nodePosition(index, Math.max(1, Math.min(10, input.documentGroups.length)), 124);
    addNode({
      id,
      label: room.name,
      shortLabel: shortLabel(room.name, "Alan"),
      x: position.x,
      y: position.y,
      cat: "rooms",
      status: room.archived_at ? "Arşiv" : "Onaylandı",
      r: Math.min(13, 7 + room.document_count),
      owner: room.created_by,
      dept: "Çalışma Alanı",
      version: `${room.member_count} üye`,
      date: formatGraphDate(room.updated_at),
      desc: room.description || `${room.document_count} doküman ve ${room.member_count} üye içeren çalışma alanı.`,
      entity: { kind: "room", id: room.id },
    });
    const companyId = room.tender_id
      ? companyIds.get(room.tender_id.split("-")[0].replace(/_/g, " ").toLocaleLowerCase("tr-TR"))
      : null;
    pushUniqueEdge(edges, { s: companyId || "ERP_CORE", t: id, str: "med" });
  });

  input.documents.slice(0, 14).forEach((document, index) => {
    const id = safeId("DOC", document.id);
    const position = nodePosition(index, Math.max(1, Math.min(14, input.documents.length)), 62);
    const filename = document.original_filename || document.stored_filename || document.tender_id;
    addNode({
      id,
      label: filename,
      shortLabel: shortLabel(filename, "Belge"),
      x: position.x,
      y: position.y,
      cat: "documents",
      status: statusLabel(document.status),
      r: 5 + Math.min(5, Math.round((document.file_size || 0) / 75_000)),
      owner: document.organization || "Doküman Ağı",
      dept: document.document_type || "Belge",
      version: document.text_extraction_status || "stored",
      date: formatGraphDate(document.timestamp),
      desc: `${document.organization || "Kurum yok"} · ${document.internal_unit || "Birim yok"} · ${document.tender_id}`,
      entity: { kind: "document", id: document.id },
    });
    const companyId = companyIds.get((document.organization || "Genel").toLocaleLowerCase("tr-TR"));
    pushUniqueEdge(edges, { s: companyId || "VAULT", t: id, str: "med" });
  });

  input.vaultNotes.slice(0, 10).forEach((note, index) => {
    const id = safeId("NOTE", note.path || note.name);
    const position = nodePosition(index, Math.max(1, Math.min(10, input.vaultNotes.length)), 112);
    addNode({
      id,
      label: note.name,
      shortLabel: shortLabel(note.name, "Not"),
      x: position.x,
      y: position.y,
      cat: "notes",
      status: "Onaylandı",
      r: Math.min(11, 6 + note.linked_files),
      owner: "Vault",
      dept: "Bilgi Notu",
      version: `${note.linked_files} bağlantı`,
      date: formatGraphDate(note.updated),
      desc: note.tags.length > 0 ? note.tags.join(", ") : note.path,
      entity: { kind: "note", name: note.name },
    });
    pushUniqueEdge(edges, { s: "VAULT", t: id, str: note.linked_files > 0 ? "strong" : "weak" });
  });

  return { nodes: [...nodes.values()], edges, dynamic: true };
}
