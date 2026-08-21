import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BossBriefing } from "../api";
import { CompanyBriefingPage } from "./CompanyBriefingPage";

const getBossBriefing = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({ getBossBriefing }));

function briefing(overrides: Partial<BossBriefing> = {}): BossBriefing {
  return {
    period_start: "2026-08-01",
    bids_this_month: 4, won_this_month: 1,
    won_amount_this_month: "8000000", won_amount_from_our_own_figure: 0,
    awaiting_result: 3, awaiting_amount: "21500000",
    pending_approval: 0, overdue_tasks: 0, due_this_week: 2,
    lapsed_credentials: 0, expiring_credentials: 0,
    upcoming: [],
    ...overrides,
  };
}

/**
 * The page most likely to be open on a laptop in a meeting, which is why the tests are about what
 * it must never overstate.
 */
describe("CompanyBriefingPage", () => {
  beforeEach(() => {
    getBossBriefing.mockReset();
    getBossBriefing.mockResolvedValue(briefing());
  });

  it("kazanılan işi ve bekleyen parayı ayrı gösterir", async () => {
    render(<CompanyBriefingPage setPage={vi.fn()} />);

    expect(await screen.findByText("8.000.000 TRY")).toBeInTheDocument();
    // Money that is not decided must not be folded into what was won.
    expect(screen.getByText("21.500.000 TRY")).toBeInTheDocument();
  });

  it("toplamın ne kadarı kendi rakamımızsa söyler", async () => {
    getBossBriefing.mockResolvedValue(briefing({ won_amount_from_our_own_figure: 2 }));
    render(<CompanyBriefingPage setPage={vi.fn()} />);

    expect(await screen.findByText(/2 tanesinin sözleşme bedeli henüz/)).toBeInTheDocument();
  });

  it("onay bekleyen yoksa o uyarıyı hiç göstermez", async () => {
    render(<CompanyBriefingPage setPage={vi.fn()} />);

    await screen.findByText("8.000.000 TRY");
    expect(screen.queryByText(/onayınızı bekliyor/)).not.toBeInTheDocument();
  });

  it("süresi dolmuş belgeyi yaklaşandan ayırır", async () => {
    getBossBriefing.mockResolvedValue(briefing({ lapsed_credentials: 1, expiring_credentials: 2 }));
    render(<CompanyBriefingPage setPage={vi.fn()} />);

    // A lapsed paper stops a bid at the door; one expiring next month does not.
    expect(await screen.findByText(/1 belgenizin süresi dolmuş/)).toBeInTheDocument();
    expect(screen.queryByText(/30 gün içinde doluyor/)).not.toBeInTheDocument();
  });

  it("hiç teklif yokken boş ekrandan bültene götürür", async () => {
    // This page adds up bids and there are none to add up, so it opens where one is recorded —
    // which the web panel can now do.
    const user = userEvent.setup();
    const setPage = vi.fn();
    getBossBriefing.mockResolvedValue(briefing({
      bids_this_month: 0, won_this_month: 0, won_amount_this_month: "0",
      awaiting_result: 0, awaiting_amount: "0",
    }));
    render(<CompanyBriefingPage setPage={setPage} />);

    expect(await screen.findByText("Henüz kayıtlı teklif yok")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Bülteni aç" }));

    expect(setPage).toHaveBeenCalledWith("tender-bulletin");
  });

  it("alınamazsa hatayı söyler", async () => {
    getBossBriefing.mockRejectedValue(new Error("Şirket özeti alınamadı."));
    render(<CompanyBriefingPage setPage={vi.fn()} />);

    expect(await screen.findByText("Şirket özeti alınamadı.")).toBeInTheDocument();
  });
});
