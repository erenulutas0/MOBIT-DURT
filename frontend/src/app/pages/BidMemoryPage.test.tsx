import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BidMemory } from "../api";
import { BidMemoryPage } from "./BidMemoryPage";

const mocks = vi.hoisted(() => ({
  getBidMemory: vi.fn(), searchRivals: vi.fn(), getRivalProfile: vi.fn(),
}));
vi.mock("../api", () => mocks);
const { getBidMemory, searchRivals, getRivalProfile } = mocks;

function memory(overrides: Partial<BidMemory> = {}): BidMemory {
  return {
    total_bids: 9, won: 2, lost: 5, pending: 1, unclear: 1,
    median_gap_percent: "3.4", smallest_gap_percent: "0.8",
    rivals: [{ rival: "Sürekli Rakip A.Ş.", beat_us: 3, median_gap_percent: "3.1" }],
    authorities: [],
    outcomes: [{
      id: 1, ikn: "2026/1", title: "Köy yolu asfalt işi", authority: "Karayolları",
      province: "Konya", bid_amount: "8250000", bid_at: "2026-07-01", status: "LOST",
      winning_amount: "8000000", winner: "Sürekli Rakip A.Ş.", gap_percent: "3.1", note: null,
    }],
    ...overrides,
  };
}

describe("BidMemoryPage", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    getBidMemory.mockResolvedValue(memory());
    searchRivals.mockResolvedValue([]);
  });

  it("kaybettiğinde ne kadar yukarıda kaldığını söyler", async () => {
    render(<BidMemoryPage setPage={vi.fn()} />);

    expect(await screen.findByText("%3,4")).toBeInTheDocument();
    expect(screen.getByText(/5 kayıp üzerinden ortanca/)).toBeInTheDocument();
  });

  it("üç kayıptan azken ortalama uydurmaz", async () => {
    getBidMemory.mockResolvedValue(memory({
      lost: 2, median_gap_percent: null, smallest_gap_percent: "3.8", rivals: [],
    }));
    render(<BidMemoryPage setPage={vi.fn()} />);

    // Two near misses are an anecdote; the closest one is still a fact and survives.
    expect(await screen.findByText(/henüz yeterli veri yok/)).toBeInTheDocument();
    expect(screen.getByText(/%3,8 farkla kaybetti/)).toBeInTheDocument();
  });

  it("sizi geçen firmaya tıklayınca o firmanın kaydını açar", async () => {
    const user = userEvent.setup();
    getRivalProfile.mockResolvedValue({
      winner: "Sürekli Rakip A.Ş.", contracts: 14, total_amount: "48000000", currency: "TRY",
      distinct_authorities: 6, median_discount: "11.2", beat_us: 3,
      authorities: [{ name: "Karayolları", contracts: 8 }], provinces: [], recent: [],
    });
    render(<BidMemoryPage setPage={vi.fn()} />);

    await user.click(await screen.findByText(/3 kez geçti/));

    // The line that needs our own bid, which never leaves the company.
    expect(await screen.findByText(/teklif verdiğiniz 3 ihaleyi almış/)).toBeInTheDocument();
    expect(screen.getByText(/%11,2/)).toBeInTheDocument();
  });

  it("hiç teklif yokken ne yapılacağını söyler", async () => {
    getBidMemory.mockResolvedValue(memory({ total_bids: 0, outcomes: [], rivals: [] }));
    render(<BidMemoryPage setPage={vi.fn()} />);

    expect(await screen.findByText("Henüz kayıtlı teklifiniz yok")).toBeInTheDocument();
  });

  it("boş ekrandan bültene götürür", async () => {
    // The screen asks for a bid and a bid is recorded on an ilan — which the web panel can now do,
    // so the button is no longer a path to a page that cannot answer it.
    const user = userEvent.setup();
    const setPage = vi.fn();
    getBidMemory.mockResolvedValue(memory({ total_bids: 0, outcomes: [], rivals: [] }));
    render(<BidMemoryPage setPage={setPage} />);

    await user.click(await screen.findByRole("button", { name: "Bülteni aç" }));

    expect(setPage).toHaveBeenCalledWith("tender-bulletin");
  });

  it("tek harfle firma araması yapmaz", async () => {
    const user = userEvent.setup();
    render(<BidMemoryPage setPage={vi.fn()} />);

    await user.type(await screen.findByPlaceholderText("Rakip firma adı…"), "a");

    expect(searchRivals).not.toHaveBeenCalled();
  });
});
