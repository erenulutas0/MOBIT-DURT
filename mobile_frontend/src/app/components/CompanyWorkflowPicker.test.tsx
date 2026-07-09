import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Tender } from "../api";
import { CompanyWorkflowPicker } from "./CompanyWorkflowPicker";

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

describe("CompanyWorkflowPicker", () => {
  it("şirketleri temiz ve tekil isimlerle gösterir, klasör/workflow detayını listeye basmaz", async () => {
    const user = userEvent.setup();
    render(
      <CompanyWorkflowPicker
        value=""
        onSelect={vi.fn()}
        tenders={[
          tender({ id: 1, organization: " BEDAS ", tender_id: "BEDAS-2026-20260605-001", created_at: "2026-06-05T00:00:00Z" }),
          tender({ id: 2, organization: "BEDAS", tender_id: "BEDAS-2026-20260605-002", created_at: "2026-06-06T00:00:00Z" }),
          tender({ id: 3, organization: "IBB", tender_id: "IBB-2026-010" }),
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: /Şirket ara ve seç/i }));

    expect(screen.getByText("BEDAS")).toBeInTheDocument();
    expect(screen.getByText("IBB")).toBeInTheDocument();
    expect(screen.getAllByText("BEDAS")).toHaveLength(1);
    expect(screen.queryByText(/BEDAS-2026/)).not.toBeInTheDocument();
    expect(screen.queryByText(/20260605/)).not.toBeInTheDocument();
  });

  it("arama yapar ve seçilen şirket bilgisini callback ile döndürür", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <CompanyWorkflowPicker
        value=""
        onSelect={onSelect}
        tenders={[
          tender({ id: 1, organization: "BEDAS", tender_id: "BEDAS-2026-001" }),
          tender({ id: 2, organization: "İBB", tender_id: "IBB-2026-010" }),
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: /Şirket ara ve seç/i }));
    await user.type(screen.getByPlaceholderText("Şirket adı ara..."), "ibb");
    await user.click(screen.getByRole("button", { name: "İBB" }));

    expect(onSelect).toHaveBeenCalledWith({
      tenderId: "IBB-2026-010",
      companyName: "İBB",
      year: 2026,
    });
  });

  it("olmayan şirket için yeni şirket ekleme akışını çalıştırır", async () => {
    const created = tender({ id: 9, organization: "KOC", tender_id: "KOC-2026-001" });
    const onCreateCompany = vi.fn().mockResolvedValue(created);
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(
      <CompanyWorkflowPicker
        value=""
        onSelect={onSelect}
        onCreateCompany={onCreateCompany}
        tenders={[tender({ organization: "BEDAS" })]}
      />
    );

    await user.click(screen.getByRole("button", { name: /Şirket ara ve seç/i }));
    await user.type(screen.getByPlaceholderText("Şirket adı ara..."), "KOC");
    const addButton = screen.getByRole("button", { name: /Yeni şirket ekle/i });
    expect(within(addButton).getByText("KOC")).toBeInTheDocument();
    await user.click(addButton);

    expect(onCreateCompany).toHaveBeenCalledWith("KOC");
    expect(onSelect).toHaveBeenCalledWith({
      tenderId: "KOC-2026-001",
      companyName: "KOC",
      year: 2026,
    });
  });

  it("eşleşme yoksa temiz boş durum gösterir", async () => {
    const user = userEvent.setup();
    render(
      <CompanyWorkflowPicker
        value=""
        onSelect={vi.fn()}
        tenders={[tender({ organization: "BEDAS" })]}
      />
    );

    await user.click(screen.getByRole("button", { name: /Şirket ara ve seç/i }));
    await user.type(screen.getByPlaceholderText("Şirket adı ara..."), "XYZ");

    expect(screen.getByText("Eşleşen şirket yok.")).toBeInTheDocument();
  });
});
