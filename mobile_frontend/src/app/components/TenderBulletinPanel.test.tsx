import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TenderNotice } from "../api";
import { TenderBulletinPanel } from "./TenderBulletinPanel";

const mocks = vi.hoisted(() => ({
  getTenderNotices: vi.fn(),
  getTenderCategories: vi.fn(),
  getTenderNoticeDetail: vi.fn(),
  refreshTenderBulletin: vi.fn(),
}));
vi.mock("../api", () => mocks);

const NOW = new Date("2026-08-09T09:00:00Z");

function notice(overrides: Partial<TenderNotice> = {}): TenderNotice {
  return {
    id: 1,
    ikn: "2026/1434625",
    title: "Siirt İli Muhtelif Köylerin Altyapı ile Duvar Yapım İşi",
    authority: "Siirt İl Özel İdaresi",
    province: "Siirt",
    category: "insaat",
    category_label: "İnşaat ve Yapım",
    bulletin_type: "yapim",
    tender_at_text: "26.08.2026 - 10:00",
    tender_at: "2026-08-26T07:00:00Z",
    quantity: "12 km",
    delivery_place: "Siirt",
    address: "Siirt Merkez/Siirt",
    ...overrides,
  };
}

describe("TenderBulletinPanel", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(NOW);
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getTenderNotices.mockResolvedValue([]);
    mocks.getTenderCategories.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ilanı işi, idaresi ve iliyle listeler", async () => {
    mocks.getTenderNotices.mockResolvedValue([notice()]);

    render(<TenderBulletinPanel isAdmin={false} onClose={vi.fn()} />);

    expect(await screen.findByText(/Muhtelif Köylerin Altyapı/)).toBeInTheDocument();
    expect(screen.getByText("Siirt İl Özel İdaresi")).toBeInTheDocument();
    expect(screen.getByText("İnşaat ve Yapım")).toBeInTheDocument();
    expect(screen.getByText("1 açık ihale")).toBeInTheDocument();
  });

  it("kalan süreyi gün olarak söyler", async () => {
    mocks.getTenderNotices.mockResolvedValue([notice()]);

    render(<TenderBulletinPanel isAdmin={false} onClose={vi.fn()} />);

    // A date on its own makes every reader do the subtraction, and the answer to "is this worth
    // opening" is how long is left, not when it closes.
    expect(await screen.findByText("16 gün kaldı")).toBeInTheDocument();
  });

  it("kategoriye tıklayınca listeyi o kategoriyle ister", async () => {
    mocks.getTenderCategories.mockResolvedValue([
      { code: "elektrik", label: "Elektrik ve Enerji", count: 8 },
      { code: "gida", label: "Gıda ve Yemek", count: 0 },
    ]);
    render(<TenderBulletinPanel isAdmin={false} onClose={vi.fn()} />);

    await userEvent.click(await screen.findByText("Elektrik ve Enerji 8"));

    await waitFor(() => expect(mocks.getTenderNotices).toHaveBeenLastCalledWith(
      expect.objectContaining({ category: "elektrik" })));
    // An empty category is a chip that does nothing; it is left out rather than shown greyed.
    expect(screen.queryByText(/Gıda ve Yemek/)).not.toBeInTheDocument();
  });

  it("boş sonucu hata gibi değil, boş gibi gösterir", async () => {
    render(<TenderBulletinPanel isAdmin={false} onClose={vi.fn()} />);

    expect(await screen.findByText("Bu filtrelerde açık ihale yok.")).toBeInTheDocument();
  });

  it("bülteni çekmeyi yalnızca yöneticiye verir", async () => {
    const { unmount } = render(<TenderBulletinPanel isAdmin={false} onClose={vi.fn()} />);
    await screen.findByText("Kamu İhale Bülteni");
    // Pulling reaches out to EKAP's servers; reading what was already pulled does not.
    expect(screen.queryByLabelText("Bülteni çek")).not.toBeInTheDocument();
    unmount();

    render(<TenderBulletinPanel isAdmin onClose={vi.fn()} />);
    expect(await screen.findByLabelText("Bülteni çek")).toBeInTheDocument();
  });

  it("ilan açılınca metnin tamamını gösterir", async () => {
    mocks.getTenderNotices.mockResolvedValue([notice()]);
    mocks.getTenderNoticeDetail.mockResolvedValue({
      notice: notice(),
      body: "3x240/25 mm² XLPE kablo ve montaj işleri",
      section: "İHALE İLANLARI",
    });
    render(<TenderBulletinPanel isAdmin={false} onClose={vi.fn()} />);

    await userEvent.click(await screen.findByText(/Muhtelif Köylerin Altyapı/));

    // The line that decides whether a company can do the work lives in the body and nowhere else.
    expect(await screen.findByText(/3x240\/25 mm² XLPE kablo/)).toBeInTheDocument();
  });

  it("çekme sonrası yeni ilan yoksa bunu söyler", async () => {
    mocks.refreshTenderBulletin.mockResolvedValue(0);
    render(<TenderBulletinPanel isAdmin onClose={vi.fn()} />);

    await userEvent.click(await screen.findByLabelText("Bülteni çek"));

    // "Nothing new" and "the pull failed" look identical without this line.
    expect(await screen.findByText("Bülten çekildi, yeni ilan yok.")).toBeInTheDocument();
  });
});
