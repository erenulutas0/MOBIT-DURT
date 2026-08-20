import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TenderResult } from "../api";
import { TenderResultsPage } from "./TenderResultsPage";

const mocks = vi.hoisted(() => ({ getTenderResults: vi.fn(), getAuthorityProfile: vi.fn() }));
vi.mock("../api", () => mocks);
const { getTenderResults, getAuthorityProfile } = mocks;

function result(overrides: Partial<TenderResult> = {}): TenderResult {
  return {
    id: 1, ikn: "2026/951756", title: "Açık stok alanlarının yapılması işi",
    authority: "TCDD 3. BÖLGE MÜDÜRLÜĞÜ", province: "İzmir",
    category: "insaat", category_label: "İnşaat ve Yapım", bulletin_type: "yapim",
    work_place: "Aliağa", procedure: "Açık",
    tender_date: "2026-06-30", contract_date: "2026-08-07",
    estimated_cost: "82368000.00", contract_amount: "54524045.00", currency: "TRY",
    bid_count: 45, valid_bid_count: 31,
    winner: "Tavsun Enerji A.Ş.", winner_province: "Diyarbakır",
    discount_percent: "33.8", partial_award: false,
    ...overrides,
  };
}

describe("TenderResultsPage", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    getTenderResults.mockResolvedValue([result()]);
  });

  it("sözleşme bedelini ve yaklaşık maliyeti yan yana gösterir", async () => {
    render(<TenderResultsPage />);

    // Neither figure means much alone: 54 million is cheap against 82 and dear against 60.
    expect(await screen.findByText("54.524.045 TRY")).toBeInTheDocument();
    expect(screen.getByText("82.368.000 TRY")).toBeInTheDocument();
    expect(screen.getByText(/%33,8/)).toBeInTheDocument();
  });

  it("kısımlara bölünmüş ihalede kırım yerine sebebini yazar", async () => {
    getTenderResults.mockResolvedValue([
      result({ discount_percent: null, partial_award: true, contract_amount: "25130.00" }),
    ]);
    render(<TenderResultsPage />);

    // One lot's price against a whole tender's estimate reads as a 98% saving and is fiction.
    expect(await screen.findByText(/Kısımlara bölünmüş ihale/)).toBeInTheDocument();
  });

  it("idareye tıklayınca o idarenin geçmişini açar", async () => {
    const user = userEvent.setup();
    getAuthorityProfile.mockResolvedValue({
      authority: "TCDD 3. BÖLGE MÜDÜRLÜĞÜ", total_awards: 34, sample_size: 21,
      median_discount: "24.8", lowest_discount: "1.0", highest_discount: "57.6",
      average_bidders: "8.8", top_winners: [],
    });
    render(<TenderResultsPage />);

    await user.click(await screen.findByText("TCDD 3. BÖLGE MÜDÜRLÜĞÜ"));

    // The figure never travels without the count it was drawn from.
    expect(await screen.findByText(/21 ihalede/)).toBeInTheDocument();
  });

  it("idare geçmişi için veri azsa ortanca uydurmaz", async () => {
    const user = userEvent.setup();
    getAuthorityProfile.mockResolvedValue({
      authority: "Küçük İdare", total_awards: 2, sample_size: 2,
      median_discount: null, lowest_discount: "6.0", highest_discount: "31.0",
      average_bidders: "3.0", top_winners: [],
    });
    render(<TenderResultsPage />);

    await user.click(await screen.findByText("TCDD 3. BÖLGE MÜDÜRLÜĞÜ"));

    expect(await screen.findByText(/henüz yeterli veri yok/)).toBeInTheDocument();
  });

  it("sonuç yoksa bunu hata gibi göstermez", async () => {
    getTenderResults.mockResolvedValue([]);
    render(<TenderResultsPage />);

    expect(await screen.findByText("Bu süzgeçle sonuçlanmış ihale yok")).toBeInTheDocument();
  });
});
