import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { RivalProfile } from "../api";
import { RivalPanel } from "./RivalPanel";

const mocks = vi.hoisted(() => ({ searchRivals: vi.fn(), getRivalProfile: vi.fn() }));
vi.mock("../api", () => mocks);
const { searchRivals, getRivalProfile } = mocks;

function profile(overrides: Partial<RivalProfile> = {}): RivalProfile {
  return {
    winner: "Sürekli Rakip A.Ş.",
    contracts: 14, total_amount: "48000000", currency: "TRY",
    contracts_in_other_currencies: 0, distinct_authorities: 6,
    median_discount: "11.2", beat_us: 0,
    authorities: [{ name: "Karayolları Genel Müdürlüğü", contracts: 8 }],
    provinces: [{ name: "Konya", contracts: 9 }],
    recent: [{
      id: 1, ikn: "2026/1", title: "Köy yolu asfalt işi", authority: "Karayolları",
      province: "Konya", amount: "8000000", currency: "TRY",
      contract_date: "2026-08-01", discount_percent: "12.4",
    }],
    ...overrides,
  };
}

describe("RivalPanel", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    searchRivals.mockResolvedValue([{ winner: "Sürekli Rakip A.Ş.", contracts: 14 }]);
    getRivalProfile.mockResolvedValue(profile());
  });

  it("firmanın aldığı işi, idareyi ve kırım alışkanlığını gösterir", async () => {
    render(<RivalPanel onClose={vi.fn()} initialWinner="Sürekli Rakip A.Ş." />);

    expect(await screen.findByText("48.000.000 TRY")).toBeInTheDocument();
    expect(screen.getByText("14 sözleşme · 6 idare")).toBeInTheDocument();
    expect(screen.getByText("%11,2")).toBeInTheDocument();
    expect(screen.getByText("Karayolları Genel Müdürlüğü")).toBeInTheDocument();
  });

  it("bizi kaç kez geçtiğini ayrıca söyler", async () => {
    getRivalProfile.mockResolvedValue(profile({ beat_us: 3 }));
    render(<RivalPanel onClose={vi.fn()} initialWinner="Sürekli Rakip A.Ş." />);

    // The one line the public record cannot produce: it needs our own bid, which never leaves the
    // company.
    expect(await screen.findByText(/teklif verdiğiniz 3 ihaleyi almış/)).toBeInTheDocument();
  });

  it("bizi hiç geçmediyse o satırı göstermez", async () => {
    render(<RivalPanel onClose={vi.fn()} initialWinner="Sürekli Rakip A.Ş." />);

    await screen.findByText("48.000.000 TRY");
    expect(screen.queryByText(/ihaleyi almış/)).not.toBeInTheDocument();
  });

  it("kırım için veri yetmiyorsa ortalama uydurmaz", async () => {
    getRivalProfile.mockResolvedValue(profile({ median_discount: null, contracts: 2 }));
    render(<RivalPanel onClose={vi.fn()} initialWinner="Sürekli Rakip A.Ş." />);

    expect(await screen.findByText(/henüz yeterli veri yok/)).toBeInTheDocument();
    expect(screen.queryByText(/kırımla alıyor/)).not.toBeInTheDocument();
  });

  it("arama sonucundan firmayı açar", async () => {
    const user = userEvent.setup();
    render(<RivalPanel onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Firma adı yazın…"), "rakip");
    await user.click(screen.getByLabelText("Ara"));

    await user.click(await screen.findByText("Sürekli Rakip A.Ş."));
    expect(getRivalProfile).toHaveBeenCalledWith("Sürekli Rakip A.Ş.");
  });

  it("tek harfle arama yapmaz", async () => {
    const user = userEvent.setup();
    render(<RivalPanel onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Firma adı yazın…"), "a");

    // One letter matches three thousand firms and answers nothing.
    expect(screen.getByLabelText("Ara")).toBeDisabled();
    expect(searchRivals).not.toHaveBeenCalled();
  });

  it("bulunamazsa bunu hata gibi göstermez", async () => {
    const user = userEvent.setup();
    searchRivals.mockResolvedValue([]);
    render(<RivalPanel onClose={vi.fn()} />);

    await user.type(screen.getByPlaceholderText("Firma adı yazın…"), "olmayan firma");
    await user.click(screen.getByLabelText("Ara"));

    expect(await screen.findByText(/sonuçlanmış ihale bulunamadı/)).toBeInTheDocument();
  });

  it("bilinmeyen sözleşme bedelini 0 TRY diye yazmaz", async () => {
    // Number(null) is 0, and "0 TRY" next to a discount percentage reads as a contract won for
    // nothing. A dash says what is true: we do not hold the figure.
    getRivalProfile.mockResolvedValue(profile({
      recent: [{
        id: 2, ikn: "2026/2", title: "Bedeli okunamayan iş", authority: "DSİ",
        province: "Konya", amount: null, currency: null,
        contract_date: "2026-08-02", discount_percent: null,
      }],
    }));
    render(<RivalPanel onClose={vi.fn()} initialWinner="Sürekli Rakip A.Ş." />);

    expect(await screen.findByText("Bedeli okunamayan iş")).toBeInTheDocument();
    // Exact text, not a regex: /0 TRY/ also matches the header's "48.000.000 TRY".
    expect(screen.queryByText("0 TRY")).not.toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("başka para birimindeki sözleşmelerin toplama katılmadığını söyler", async () => {
    // Borusan holds 139,602 USD and 31,709,200 TRY. Added together under one label the firm reads
    // as forty times its size, or a fraction of it, depending which row was seen first.
    getRivalProfile.mockResolvedValue(profile({
      total_amount: "31709200", currency: "TRY", contracts_in_other_currencies: 1,
      recent: [{
        id: 3, ikn: "2026/3", title: "İthal ekipman", authority: "DSİ",
        province: "Ankara", amount: "139602", currency: "USD",
        contract_date: "2026-08-03", discount_percent: null,
      }],
    }));
    render(<RivalPanel onClose={vi.fn()} initialWinner="Sürekli Rakip A.Ş." />);

    expect(await screen.findByText(/başka para biriminde/)).toBeInTheDocument();
    // And the row itself carries its own currency rather than the profile's.
    expect(screen.getByText(/139\.602 USD/)).toBeInTheDocument();
  });
});
