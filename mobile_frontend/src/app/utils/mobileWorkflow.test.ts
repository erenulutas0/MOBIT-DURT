import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocumentGroupDocument, ERPOverview, ERPTask, MobileAppUpdateInfo, Tender } from "../api";
import {
  appUpdateBannerView,
  canCreateCompanyOption,
  companyOptionsFromTenders,
  companySlug,
  deadlineRemainingLabel,
  filterCompanyOptions,
  forwardedBodyText,
  forwardedDocumentName,
  groupDocumentsByYearTender,
  initials,
  isForwardedLabel,
  microphoneErrorMessage,
  taskAssigneeName,
  taskAssignees,
} from "./mobileWorkflow";

function tender(overrides: Partial<Tender>): Tender {
  return {
    id: overrides.id ?? 1,
    tender_id: overrides.tender_id ?? "BEDAS-2026-001",
    organization: overrides.organization ?? "BEDAS",
    year: overrides.year ?? 2026,
    sequence: overrides.sequence ?? 1,
    internal_unit: overrides.internal_unit ?? null,
    title: overrides.title ?? null,
    status: overrides.status ?? "active",
    created_at: overrides.created_at ?? "2026-07-07T00:00:00Z",
  };
}

function groupDocument(overrides: Partial<DocumentGroupDocument>): DocumentGroupDocument {
  const document = overrides.document ?? {
    id: 1,
    source: "mobile",
    timestamp: "2026-07-07T00:00:00Z",
    mime_type: "application/pdf",
    original_filename: "dosya.pdf",
    stored_filename: "dosya.pdf",
    file_size: 1024,
    internal_unit: null,
    organization: "BEDAS",
    year: 2026,
    tender_id: "BEDAS-2026-001",
    document_type: "unknown",
    status: "stored",
    file_path: "/tmp/dosya.pdf",
  };
  return {
    id: overrides.id ?? 1,
    group_id: overrides.group_id ?? 1,
    document_id: overrides.document_id ?? document.id,
    uploaded_by_user_id: overrides.uploaded_by_user_id ?? 1,
    uploaded_by: overrides.uploaded_by ?? "Admin",
    note: overrides.note ?? null,
    tender_id: overrides.tender_id ?? null,
    year: overrides.year ?? null,
    created_at: overrides.created_at ?? "2026-07-07T00:00:00Z",
    document,
  };
}

describe("mobil workflow yardımcıları", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("zorunlu güncelleme banner metnini Türkçe ve okunur üretir", () => {
    const update: MobileAppUpdateInfo = {
      current_version: "1.0.6",
      latest_version: "1.0.7",
      minimum_version: "1.0.7",
      update_available: true,
      required: true,
      title: "",
      message: "Eski mesaj kullanılmamalı",
      play_store_url: "https://play.google.com/store/apps/details?id=com.mobit.docsbotops",
    };

    expect(appUpdateBannerView(update)).toEqual({
      required: true,
      title: "Yeni versiyon geldi",
      message: "Uygulamanızı düzgün kullanmanız için güncellemeniz gerekmektedir.",
      versionLabel: "v1.0.6 → v1.0.7",
      buttonLabel: "Güncelle",
      tone: "required",
    });
  });

  it("opsiyonel güncellemede backend mesajını korur", () => {
    const update: MobileAppUpdateInfo = {
      current_version: "1.0.6",
      latest_version: "1.0.7",
      minimum_version: "1.0.5",
      update_available: true,
      required: false,
      title: "Yeni sürüm hazır",
      message: "Yeni sürümü yüklemeniz önerilir.",
      play_store_url: "https://play.google.com/store/apps/details?id=com.mobit.docsbotops",
    };

    expect(appUpdateBannerView(update).message).toBe("Yeni sürümü yüklemeniz önerilir.");
    expect(appUpdateBannerView(update).tone).toBe("optional");
  });

  it("şirket seçeneklerinde klasör detaylarını değil temiz ve tekil şirket adlarını tutar", () => {
    const options = companyOptionsFromTenders([
      tender({ id: 1, organization: " BEDAS ", tender_id: "BEDAS-2026-001", year: 2026, created_at: "2026-06-01T00:00:00Z" }),
      tender({ id: 2, organization: "BEDAS", tender_id: "BEDAS-2026-002", year: 2026, created_at: "2026-07-01T00:00:00Z" }),
      tender({ id: 3, organization: "IBB", tender_id: "IBB-2026-010", year: 2026 }),
      tender({ id: 4, organization: "ASELSAN", tender_id: "ASELSAN-2026-001", year: 2026 }),
    ]);

    expect(options.map(item => item.organization)).toEqual(["ASELSAN", "BEDAS", "IBB"]);
    expect(options.find(item => item.organization === "BEDAS")?.tender_id).toBe("BEDAS-2026-002");
  });

  it("şirket arama ve yeni şirket oluşturma kararını doğru verir", () => {
    const tenders = [
      tender({ organization: "BEDAS" }),
      tender({ organization: "İBB", tender_id: "IBB-2026-001" }),
    ];

    expect(filterCompanyOptions(tenders, "bb").map(item => item.organization)).toEqual(["İBB"]);
    expect(canCreateCompanyOption(tenders, "BEDAS")).toBe(false);
    expect(canCreateCompanyOption(tenders, "BEDAŞ")).toBe(true);
    expect(canCreateCompanyOption(tenders, "KOC")).toBe(true);
    expect(canCreateCompanyOption(tenders, "k")).toBe(false);
  });

  it("şirket slug değerini Türkçe karakterlerle güvenli üretir", () => {
    expect(companySlug(" İBB / Avrupa Yakası 2026 ")).toBe("İBB-AVRUPA-YAKASI-2026");
    expect(companySlug("")).toBe("SIRKET");
  });

  it("mikrofon izin hatalarını kullanıcı dostu Türkçe metne çevirir", () => {
    expect(microphoneErrorMessage(new DOMException("denied", "NotAllowedError"))).toContain("Mikrofon izni kapalı");
    expect(microphoneErrorMessage(new Error("permission denied"))).toContain("Mikrofon izni alınamadı");
    expect(microphoneErrorMessage(new Error("device busy"))).toContain("Ses kaydı başlatılamadı");
  });

  it("iletilen mesajları algılar ve görünen metni temizler", () => {
    expect(isForwardedLabel("İletildi\nMerhaba")).toBe(true);
    expect(isForwardedLabel("İletilen doküman: teklif.pdf")).toBe(true);
    expect(isForwardedLabel("Normal mesaj")).toBe(false);
    expect(forwardedBodyText("İletildi\nMerhaba")).toBe("Merhaba");
    expect(forwardedDocumentName("İletilen doküman: teklif.pdf")).toBe("teklif.pdf");
    expect(forwardedDocumentName("İletildi · foto.jpg")).toBe("foto.jpg");
  });

  it("oda dokümanlarını yıl ve workflow bazlı klasör mantığıyla gruplar", () => {
    const grouped = groupDocumentsByYearTender([
      groupDocument({ id: 1, tender_id: "BEDAS-2026-001", year: 2026 }),
      groupDocument({ id: 2, tender_id: "IBB-2026-010", year: 2026 }),
      groupDocument({
        id: 3,
        tender_id: null,
        year: null,
        created_at: "2025-12-01T00:00:00Z",
        document: {
          ...groupDocument({}).document,
          id: 3,
          year: null,
          tender_id: "Genel",
        },
      }),
    ]);

    expect(grouped.map(group => group.year)).toEqual(["2026", "2025"]);
    expect(grouped[0].tenders.map(item => item.tenderId)).toEqual(["BEDAS-2026-001", "IBB-2026-010"]);
    expect(grouped[1].tenders[0].tenderId).toBe("Genel");
  });

  it("çoklu görev atamalarını görev ağacı için kullanıcı listesine çevirir", () => {
    const task = { id: 10, title: "Saha kontrol" } as ERPTask;
    const overview = {
      users: [
        { id: 2, name: "Ayşe Demir" },
        { id: 3, name: "Can Yılmaz" },
        { id: 4, name: "Dış Kullanıcı" },
      ],
      assignments: [
        { id: 1, task_id: 10, assignee_user_id: 2 },
        { id: 2, task_id: 10, assignee_user_id: 3 },
        { id: 3, task_id: 11, assignee_user_id: 4 },
        { id: 4, task_id: 10, assignee_team_id: 99, assignee_user_id: null },
      ],
      documents: [],
    } as unknown as ERPOverview;

    expect(taskAssignees(task, overview).map(item => item.name)).toEqual(["Ayşe Demir", "Can Yılmaz"]);
    expect(taskAssigneeName(task, overview)).toBe("Ayşe Demir +1");
    expect(taskAssigneeName(task, null)).toBe("Atanmamış");
  });

  it("görev teslim süresini Türkçe ve kararlı biçimde gösterir", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-08T09:00:00Z"));

    expect(deadlineRemainingLabel("2026-07-10T12:30:00Z")).toBe("2 gün 3 saat kaldı");
    expect(deadlineRemainingLabel("2026-07-08T10:15:00Z")).toBe("1 saat 15 dk kaldı");
    expect(deadlineRemainingLabel("2026-07-08T08:45:00Z")).toBe("15 dk gecikti");
    expect(deadlineRemainingLabel(null)).toBe("Zaman belirlenmedi");
    expect(deadlineRemainingLabel("gecersiz")).toBe("Zaman belirlenmedi");
  });

  it("avatar baş harflerini Türkçe karakterlerle üretir", () => {
    expect(initials("İpek Şahin")).toBe("İŞ");
    expect(initials("  admin  ")).toBe("A");
    expect(initials(null)).toBe("K");
  });
});
