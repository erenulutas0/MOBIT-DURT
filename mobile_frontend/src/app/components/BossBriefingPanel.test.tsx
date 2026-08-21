import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BossBriefing } from "../api";
import { BossBriefingPanel } from "./BossBriefingPanel";

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

function panel(props: Partial<Parameters<typeof BossBriefingPanel>[0]> = {}) {
  return (
    <BossBriefingPanel
      onClose={vi.fn()} onOpenTasks={vi.fn()} onOpenBids={vi.fn()} onOpenBulletin={vi.fn()}
      {...props}
    />
  );
}

describe("BossBriefingPanel", () => {
  beforeEach(() => {
    getBossBriefing.mockReset();
    getBossBriefing.mockResolvedValue(briefing());
  });

  it("kazanılan işi ve bekleyen parayı ayrı ayrı gösterir", async () => {
    render(panel());

    expect(await screen.findByText("8.000.000 TRY")).toBeInTheDocument();
    // Money that is not decided yet is its own figure, not folded into what was won.
    expect(screen.getByText("21.500.000 TRY")).toBeInTheDocument();
    expect(screen.getByText(/3 ihale · henüz karara bağlanmadı/)).toBeInTheDocument();
  });

  it("toplamın ne kadarı kendi rakamımızsa bunu söyler", async () => {
    getBossBriefing.mockResolvedValue(briefing({ won_amount_from_our_own_figure: 2 }));
    render(panel());

    // The one place this screen could mislead: a tender marked won by hand before the bulletin
    // published a price contributes our own bid. A total that hid that would be a number nobody
    // could defend in a meeting.
    expect(await screen.findByText(/2 tanesinin bedeli henüz/)).toBeInTheDocument();
  });

  it("onay bekleyen işi en üste ve tek başına koyar", async () => {
    const onOpenTasks = vi.fn();
    getBossBriefing.mockResolvedValue(briefing({ pending_approval: 3 }));
    render(panel({ onOpenTasks }));

    // The only thing on this screen that is stopped because of the person reading it.
    await userEvent.click(await screen.findByText("3 iş onayınızı bekliyor"));
    expect(onOpenTasks).toHaveBeenCalled();
  });

  it("onay bekleyen yoksa o satırı hiç göstermez", async () => {
    render(panel());

    await screen.findByText("8.000.000 TRY");
    expect(screen.queryByText(/onayınızı bekliyor/)).not.toBeInTheDocument();
  });

  it("süresi dolmuş belgeyi yaklaşandan ayırır", async () => {
    getBossBriefing.mockResolvedValue(briefing({ lapsed_credentials: 1, expiring_credentials: 2 }));
    render(panel());

    // A lapsed paper stops a bid at the door; one that expires next month does not. When both are
    // true the harder fact is the one worth the space.
    expect(await screen.findByText(/1 belgenizin süresi dolmuş/)).toBeInTheDocument();
    expect(screen.queryByText(/30 gün içinde doluyor/)).not.toBeInTheDocument();
  });

  it("hiç teklif yokken ne yapılacağını söyler", async () => {
    getBossBriefing.mockResolvedValue(briefing({
      bids_this_month: 0, won_this_month: 0, won_amount_this_month: "0",
      awaiting_result: 0, awaiting_amount: "0",
    }));
    render(panel());

    expect(await screen.findByText("Henüz kayıtlı teklif yok")).toBeInTheDocument();
  });

  it("boş ekrandan bültene götürür", async () => {
    // This page adds up bids and there are none to add up. Correct advice with no way to follow it
    // is where a first morning ends.
    const onOpenBulletin = vi.fn();
    getBossBriefing.mockResolvedValue(briefing({
      bids_this_month: 0, won_this_month: 0, won_amount_this_month: "0",
      awaiting_result: 0, awaiting_amount: "0",
    }));
    render(panel({ onOpenBulletin }));

    await userEvent.click(await screen.findByRole("button", { name: "Bülteni aç" }));

    expect(onOpenBulletin).toHaveBeenCalled();
  });

  it("alınamazsa hatayı söyler", async () => {
    getBossBriefing.mockRejectedValue(new Error("Şirket özeti alınamadı."));
    render(panel());

    expect(await screen.findByText("Şirket özeti alınamadı.")).toBeInTheDocument();
  });
});
