import { describe, expect, it } from "vitest";
import type { ApiDocument, ApiTender, ApiVaultNote } from "../api";
import { buildKnowledgeGraphData } from "./knowledgeGraph";

function tender(overrides: Partial<ApiTender> = {}): ApiTender {
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

function document(overrides: Partial<ApiDocument> = {}): ApiDocument {
  return {
    id: overrides.id ?? 10,
    source: overrides.source ?? "web",
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
  };
}

function note(overrides: Partial<ApiVaultNote> = {}): ApiVaultNote {
  return {
    name: overrides.name ?? "BEDAS Notu",
    path: overrides.path ?? "2026/BEDAS.md",
    updated: overrides.updated ?? "2026-07-04T00:00:00Z",
    linked_files: overrides.linked_files ?? 2,
    tags: overrides.tags ?? ["BEDAS", "teklif"],
  };
}

describe("web knowledge graph veri üretimi", () => {
  it("canlı veriden node/edge üretir ve boş documentGroups ile çalışır", () => {
    const graph = buildKnowledgeGraphData({
      tenders: [tender()],
      documents: [document()],
      vaultNotes: [note()],
      documentGroups: [],
    });

    expect(graph.dynamic).toBe(true);
    expect(graph.nodes.some((item) => item.id === "ERP_CORE")).toBe(true);
    expect(graph.nodes.some((item) => item.cat === "tender" && item.label === "BEDAS")).toBe(true);
    expect(graph.nodes.some((item) => item.cat === "documents")).toBe(true);
    expect(graph.nodes.some((item) => item.cat === "rooms")).toBe(false);
  });

  it("canlı veri yoksa fallback grafiği döner", () => {
    const graph = buildKnowledgeGraphData({ tenders: [], documents: [], vaultNotes: [], documentGroups: [] });
    expect(graph.dynamic).toBe(false);
    expect(graph.nodes.length).toBeGreaterThan(5);
  });

  it("notu frontmatter etiketinden şirkete bağlar", () => {
    const graph = buildKnowledgeGraphData({
      tenders: [tender()],
      documents: [document()],
      vaultNotes: [note({ tags: ["BEDAS", "teklif"] })],
      documentGroups: [],
    });
    const companyId = graph.nodes.find((item) => item.cat === "tender" && item.label === "BEDAS")?.id;
    const noteId = graph.nodes.find((item) => item.cat === "notes")?.id;
    expect(graph.edges.some((item) => item.s === companyId && item.t === noteId)).toBe(true);
  });
});
