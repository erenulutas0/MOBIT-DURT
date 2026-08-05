import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TenderBrief, TenderBriefEntry } from "../api";
import { TenderBriefPanel } from "./TenderBriefPanel";

const getTenderBrief = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({ getTenderBrief }));

function entry(overrides: Partial<TenderBriefEntry> = {}): TenderBriefEntry {
  return {
    key: "gecikme_cezasi",
    label: "Gecikme cezası",
    question: "İşi geç bitirirsem ne kadar ceza öderim?",
    found: true,
    document_id: 11,
    document_name: "03-sozlesme-tasarisi.txt",
    content: "MADDE 1 - GECİKME CEZASI\nGecikilen her takvim günü için sözleşme bedelinin onbinde 5'i.",
    similarity: 0.875,
    same_as: null,
    ...overrides,
  };
}

function brief(entries: TenderBriefEntry[]): TenderBrief {
  return {
    ready: true,
    message: `${entries.filter(e => e.found).length} / ${entries.length} madde bulundu.`,
    tender_id: "ORNEK-ENERJI-2026-001",
    entries,
  };
}

describe("TenderBriefPanel", () => {
  beforeEach(() => getTenderBrief.mockReset());

  it("her maddeyi kaynak şartnamedeki haliyle gösterir", async () => {
    getTenderBrief.mockResolvedValue(brief([entry()]));
    render(<TenderBriefPanel tenderId="ORNEK-ENERJI-2026-001" onClose={vi.fn()} />);

    expect(await screen.findByText("Gecikme cezası")).toBeInTheDocument();
    // The clause, not a figure lifted out of it: "onbinde 5" read back without "sözleşme bedelinin"
    // is a different number, and this one is priced into a bid.
    expect(screen.getByText(/onbinde 5'i/)).toBeInTheDocument();
    expect(screen.getByText("03-sozlesme-tasarisi.txt")).toBeInTheDocument();
  });

  it("bulunamayan maddeyi listeden düşürmez", async () => {
    getTenderBrief.mockResolvedValue(brief([
      entry(),
      entry({
        key: "fiyat_farki",
        label: "Fiyat farkı",
        found: false,
        document_id: null,
        document_name: null,
        content: null,
        similarity: null,
      }),
    ]));
    render(<TenderBriefPanel tenderId="ORNEK-ENERJI-2026-001" onClose={vi.fn()} />);

    // "Bu şartnamede fiyat farkı hükmü yok" is itself a finding before bidding; a brief that hides
    // its gaps looks complete when it is not.
    expect(await screen.findByText("Fiyat farkı")).toBeInTheDocument();
    expect(screen.getByText("bulunamadı")).toBeInTheDocument();
  });

  it("aynı maddeyle yanıtlanan ikinci soruyu metni tekrarlamadan gösterir", async () => {
    getTenderBrief.mockResolvedValue(brief([
      entry(),
      entry({ key: "teminat_suresi", label: "Teminat geçerlilik süresi", same_as: "gecikme_cezasi" }),
    ]));
    render(<TenderBriefPanel tenderId="ORNEK-ENERJI-2026-001" onClose={vi.fn()} />);

    // The question stays answered; the clause is not printed twice, which is what made a real
    // brief look like it was padding out its twelve lines.
    expect(await screen.findByText("Teminat geçerlilik süresi")).toBeInTheDocument();
    expect(screen.getByText(/“Gecikme cezası” maddesinde yanıtlandı/)).toBeInTheDocument();
    expect(screen.getAllByText(/onbinde 5'i/)).toHaveLength(1);
  });

  it("sorulan ihaleyi başlıkta gösterir", async () => {
    getTenderBrief.mockResolvedValue(brief([entry()]));
    render(<TenderBriefPanel tenderId="ORNEK-ENERJI-2026-001" onClose={vi.fn()} />);

    // Which tender this belongs to is the whole basis for trusting the numbers on screen.
    expect(await screen.findByText("ORNEK-ENERJI-2026-001")).toBeInTheDocument();
    expect(getTenderBrief).toHaveBeenCalledWith("ORNEK-ENERJI-2026-001");
  });
});
