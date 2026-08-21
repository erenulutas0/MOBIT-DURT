import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BidMemory } from "../api";
import { BidMemoryPanel } from "./BidMemoryPanel";

const getBidMemory = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({ getBidMemory }));

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

describe("BidMemoryPanel", () => {
  beforeEach(() => {
    getBidMemory.mockReset();
    getBidMemory.mockResolvedValue(memory());
  });

  it("kaybettiğinde ne kadar yukarıda kaldığını söyler", async () => {
    render(<BidMemoryPanel onClose={vi.fn()} onOpenBulletin={vi.fn()} />);

    // The only feedback a bidder ever gets — and today they get it by doing the subtraction off
    // EKAP in their head, if at all.
    expect(await screen.findByText("%3,4")).toBeInTheDocument();
    expect(screen.getByText(/5 kayıp üzerinden ortanca/)).toBeInTheDocument();
  });

  it("sizi geçen firmayı ve farkı adıyla söyler", async () => {
    render(<BidMemoryPanel onClose={vi.fn()} onOpenBulletin={vi.fn()} />);

    // The sentence this whole feature exists to produce, and the one no bulletin service can:
    // it needs our own bid, which never leaves the company.
    expect(await screen.findAllByText("Sürekli Rakip A.Ş.")).not.toHaveLength(0);
    expect(screen.getByText(/3 kez geçti · genelde %3,1 farkla/)).toBeInTheDocument();
  });

  it("üç kayıptan azken ortalama uydurmaz", async () => {
    getBidMemory.mockResolvedValue(memory({
      lost: 2, median_gap_percent: null, smallest_gap_percent: "3.8",
      rivals: [{ rival: "Rakip A.Ş.", beat_us: 2, median_gap_percent: null }],
    }));
    render(<BidMemoryPanel onClose={vi.fn()} onOpenBulletin={vi.fn()} />);

    // Two near misses are an anecdote. A median over them looks like knowledge and is a coin flip.
    expect(await screen.findByText(/henüz yeterli veri yok/)).toBeInTheDocument();
    // The closest miss is still a fact, so it survives.
    expect(screen.getByText(/%3,8 farkla kaybetti/)).toBeInTheDocument();
  });

  it("bekleyen teklifi kayıp gibi göstermez", async () => {
    getBidMemory.mockResolvedValue(memory({
      outcomes: [{
        id: 2, ikn: "2026/2", title: "Bekleyen iş", authority: "DSİ", province: "Konya",
        bid_amount: "5000000", bid_at: "2026-08-01", status: "PENDING",
        winning_amount: null, winner: null, gap_percent: null,
        note: "Sonuç ilanı henüz yayımlanmadı.",
      }],
    }));
    render(<BidMemoryPanel onClose={vi.fn()} onOpenBulletin={vi.fn()} />);

    // Weeks pass between a bid and its result; reading that silence as a loss would make the whole
    // memory wrong for most of its life.
    expect(await screen.findByText("Sonuç bekliyor")).toBeInTheDocument();
  });

  it("hiç teklif yokken ne yapılacağını söyler", async () => {
    getBidMemory.mockResolvedValue(memory({ total_bids: 0, outcomes: [], rivals: [] }));
    render(<BidMemoryPanel onClose={vi.fn()} onOpenBulletin={vi.fn()} />);

    expect(await screen.findByText("Henüz kayıtlı teklifiniz yok")).toBeInTheDocument();
  });

  it("boş ekrandan bültene götürür", async () => {
    // The screen asks for a bid, and a bid is recorded on an ilan. Saying so without opening the
    // bulletin leaves a first morning at a dead end with correct advice on it.
    const onOpenBulletin = vi.fn();
    getBidMemory.mockResolvedValue(memory({ total_bids: 0, outcomes: [], rivals: [] }));
    render(<BidMemoryPanel onClose={vi.fn()} onOpenBulletin={onOpenBulletin} />);

    await userEvent.click(await screen.findByRole("button", { name: "Bülteni aç" }));

    expect(onOpenBulletin).toHaveBeenCalled();
  });

  it("alınamazsa hatayı söyler", async () => {
    getBidMemory.mockRejectedValue(new Error("Teklif geçmişi alınamadı."));
    render(<BidMemoryPanel onClose={vi.fn()} onOpenBulletin={vi.fn()} />);

    expect(await screen.findByText("Teklif geçmişi alınamadı.")).toBeInTheDocument();
  });
});
