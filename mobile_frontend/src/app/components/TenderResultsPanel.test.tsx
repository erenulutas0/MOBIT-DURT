import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TenderResult } from "../api";
import { TenderResultsPanel } from "./TenderResultsPanel";

const mocks = vi.hoisted(() => ({ getTenderResults: vi.fn(), getTenderResultDetail: vi.fn() }));
vi.mock("../api", () => mocks);
const { getTenderResults, getTenderResultDetail } = mocks;

function result(overrides: Partial<TenderResult> = {}): TenderResult {
  return {
    id: 1,
    ikn: "2026/951756",
    title: "Açık stok alanlarının yapılması işi",
    authority: "TCDD 3. BÖLGE MÜDÜRLÜĞÜ",
    province: "İzmir",
    category: "insaat",
    category_label: "İnşaat ve Yapım",
    bulletin_type: "yapim",
    work_place: "Aliağa İstasyonu",
    procedure: "Açık",
    tender_date: "2026-06-30",
    contract_date: "2026-08-07",
    estimated_cost: "82368000.00",
    contract_amount: "54524045.00",
    currency: "TRY",
    bid_count: 45,
    valid_bid_count: 31,
    winner: "Tavsun Enerji Mühendislik A.Ş.",
    winner_province: "Diyarbakır",
    discount_percent: "33.8",
    partial_award: false,
    ...overrides,
  };
}

function panel(props: Partial<Parameters<typeof TenderResultsPanel>[0]> = {}) {
  return (
    <TenderResultsPanel
      mineOnly={false}
      province={null}
      category={null}
      bulletinType={null}
      {...props}
    />
  );
}

describe("TenderResultsPanel", () => {
  beforeEach(() => {
    getTenderResults.mockReset();
    getTenderResultDetail.mockReset();
    getTenderResults.mockResolvedValue([result()]);
  });

  it("kazananı, bedeli ve kırımı gösterir", async () => {
    render(panel());

    expect(await screen.findByText("Tavsun Enerji Mühendislik A.Ş.", { exact: false }))
      .toBeInTheDocument();
    // The two figures have to appear together: a 54-million contract is cheap against an
    // 82-million estimate and dear against a 60-million one.
    expect(screen.getByText("54.524.045 TRY")).toBeInTheDocument();
    expect(screen.getByText("82.368.000 TRY")).toBeInTheDocument();
    expect(screen.getByText("%33,8")).toBeInTheDocument();
  });

  it("kısımlara bölünmüş ihalede kırım yerine sebebini yazar", async () => {
    getTenderResults.mockResolvedValue([
      result({ discount_percent: null, partial_award: true, contract_amount: "25130.00" }),
    ]);
    render(panel());

    // The estimate covers eleven lots and the amount covers one. Printed as a discount it reads
    // as a 98% saving, which is arithmetic fiction — and one such number teaches people to
    // distrust the ones that are real.
    expect(await screen.findByText(/Kısımlara bölünmüş/)).toBeInTheDocument();
    expect(screen.queryByText(/kırım$/)).not.toBeInTheDocument();
  });

  it("işin ilini gösterir, kazananın ilini onun yerine koymaz", async () => {
    render(panel());

    // A company filtering for its own province must not be handed an İzmir railway job because
    // the firm that took it is registered in Diyarbakır.
    expect(await screen.findByText("İzmir")).toBeInTheDocument();
    expect(screen.getByText(/Diyarbakır/)).toBeInTheDocument();
  });

  it("süzgeçleri sunucuya geçirir", async () => {
    render(panel({ mineOnly: true, province: "Konya", category: "elektrik", bulletinType: "yapim" }));

    await waitFor(() => expect(getTenderResults).toHaveBeenCalledWith({
      province: "Konya", category: "elektrik", type: "yapim", mine: true,
    }));
  });

  it("sonuç yoksa bunu hata gibi göstermez", async () => {
    getTenderResults.mockResolvedValue([]);
    render(panel());

    expect(await screen.findByText("Bu süzgeçle sonuçlanmış ihale yok")).toBeInTheDocument();
  });

  it("karta dokununca ilanın basıldığı hâlini açar", async () => {
    const user = userEvent.setup();
    getTenderResultDetail.mockResolvedValue({
      result: result(),
      body: [
        "İhale kayıt numarası : 2026/951756",
        "4- Sözleşmenin",
        "b) Bedeli : 54.524.045,00 TRY",
      ].join("\n"),
    });
    render(panel());

    await user.click(await screen.findByText("Açık stok alanlarının yapılması işi"));

    // The card's figures were parsed out of this text; somebody about to price a bid against them
    // is entitled to check them against the bulletin's own words.
    expect(await screen.findByText(/b\) Bedeli : 54.524.045,00 TRY/)).toBeInTheDocument();
    expect(getTenderResultDetail).toHaveBeenCalledWith(1);
  });

  it("çekilemezse hatayı söyler", async () => {
    getTenderResults.mockRejectedValue(new Error("İhale sonuçları alınamadı."));
    render(panel());

    // "Nothing was awarded" and "we could not ask" are different answers.
    expect(await screen.findByText("İhale sonuçları alınamadı.")).toBeInTheDocument();
  });
});
