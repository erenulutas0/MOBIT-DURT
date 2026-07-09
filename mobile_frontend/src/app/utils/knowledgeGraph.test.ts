import { describe, expect, it } from "vitest";
import type { DocumentGroupSummary, Tender, TenderDocument, VaultNote } from "../api";
import { buildKnowledgeGraphData } from "./knowledgeGraph";

function tender(overrides: Partial<Tender> = {}): Tender {
  return {
    id: overrides.id ?? 1,
    tender_id: overrides.tender_id ?? "BEDAS-2026-001",
    organization: overrides.organization ?? "BEDAS",
    year: overrides.year ?? 2026,
    sequence: overrides.sequence ?? 1,
    internal_unit: overrides.internal_unit ?? "MOBIT",
    title: overrides.title ?? "BEDAS saha operasyonu",
    status: overrides.status ?? "active",
    created_at: overrides.created_at ?? "2026-07-01T00:00:00Z",
  };
}

function document(overrides: Partial<TenderDocument> = {}): TenderDocument {
  return {
    id: overrides.id ?? 10,
    source: overrides.source ?? "mobile",
    timestamp: overrides.timestamp ?? "2026-07-02T00:00:00Z",
    mime_type: overrides.mime_type ?? "application/pdf",
    original_filename: overrides.original_filename ?? "bedas-teklif.pdf",
    stored_filename: overrides.stored_filename ?? "bedas-teklif.pdf",
    file_size: overrides.file_size ?? 1024,
    internal_unit: overrides.internal_unit ?? "MOBIT",
    organization: overrides.organization ?? "BEDAS",
    year: overrides.year ?? 2026,
    tender_id: overrides.tender_id ?? "BEDAS-2026-001",
    document_type: overrides.document_type ?? "Teklif",
    status: overrides.status ?? "classified",
    file_path: overrides.file_path ?? "/data/bedas.pdf",
    text_extraction_status: overrides.text_extraction_status ?? "done",
    fact_extraction_status: overrides.fact_extraction_status ?? null,
    ai_summary_status: overrides.ai_summary_status ?? null,
    ai_risk_status: overrides.ai_risk_status ?? null,
  };
}

function room(overrides: Partial<DocumentGroupSummary> = {}): DocumentGroupSummary {
  return {
    id: overrides.id ?? 5,
    name: overrides.name ?? "BEDAS Operasyon",
    description: overrides.description ?? "BEDAS çalışma alanı",
    tender_id: overrides.tender_id ?? "BEDAS-2026-001",
    year: overrides.year ?? 2026,
    created_by: overrides.created_by ?? "Admin",
    archived_at: overrides.archived_at ?? null,
    created_at: overrides.created_at ?? "2026-07-01T00:00:00Z",
    updated_at: overrides.updated_at ?? "2026-07-03T00:00:00Z",
    member_count: overrides.member_count ?? 3,
    document_count: overrides.document_count ?? 2,
    unread_message_count: overrides.unread_message_count ?? 0,
  };
}

function note(overrides: Partial<VaultNote> = {}): VaultNote {
  return {
    name: overrides.name ?? "BEDAS Notu",
    path: overrides.path ?? "2026/BEDAS.md",
    updated: overrides.updated ?? "2026-07-04T00:00:00Z",
    linked_files: overrides.linked_files ?? 2,
    tags: overrides.tags ?? ["BEDAS", "teklif"],
  };
}

describe("knowledge graph veri üretimi", () => {
  it("canlı şirket, belge, oda ve vault notlarından node/edge üretir", () => {
    const graph = buildKnowledgeGraphData({
      tenders: [tender()],
      documents: [document()],
      documentGroups: [room()],
      vaultNotes: [note()],
    });

    expect(graph.dynamic).toBe(true);
    expect(graph.nodes.some(item => item.id === "ERP_CORE")).toBe(true);
    expect(graph.nodes.some(item => item.id === "VAULT")).toBe(true);
    expect(graph.nodes.some(item => item.cat === "tender" && item.label === "BEDAS")).toBe(true);
    expect(graph.nodes.some(item => item.cat === "documents" && item.label === "bedas-teklif.pdf")).toBe(true);
    expect(graph.nodes.some(item => item.cat === "rooms" && item.label === "BEDAS Operasyon")).toBe(true);
    expect(graph.nodes.some(item => item.cat === "notes" && item.label === "BEDAS Notu")).toBe(true);
    expect(graph.edges.some(item => item.s === "ERP_CORE" && item.t.startsWith("COMPANY_"))).toBe(true);
    expect(graph.edges.some(item => item.s === "VAULT" && item.t.startsWith("NOTE_"))).toBe(true);
  });

  it("canlı veri yoksa fallback grafiği korur", () => {
    const graph = buildKnowledgeGraphData({
      tenders: [],
      documents: [],
      documentGroups: [],
      vaultNotes: [],
    });

    expect(graph.dynamic).toBe(false);
    expect(graph.nodes.length).toBeGreaterThan(10);
    expect(graph.edges.length).toBeGreaterThan(5);
  });

  it("aynı şirketten gelen kayıtları tek şirket node'unda birleştirir", () => {
    const graph = buildKnowledgeGraphData({
      tenders: [
        tender({ id: 1, organization: "BEDAS", tender_id: "BEDAS-2026-001" }),
        tender({ id: 2, organization: "BEDAS", tender_id: "BEDAS-2026-002" }),
      ],
      documents: [
        document({ id: 11, organization: "BEDAS", original_filename: "bir.pdf" }),
        document({ id: 12, organization: "BEDAS", original_filename: "iki.pdf" }),
      ],
      documentGroups: [],
      vaultNotes: [],
    });

    const companyNodes = graph.nodes.filter(item => item.cat === "tender" && item.label === "BEDAS");
    expect(companyNodes).toHaveLength(1);
    expect(companyNodes[0].desc).toContain("2 belge");
    expect(companyNodes[0].version).toBe("2 kayıt");
  });
});
