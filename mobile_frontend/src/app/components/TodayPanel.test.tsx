import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TodayPanel } from "./TodayPanel";

const mocks = vi.hoisted(() => ({
  getTenderProfile: vi.fn(),
  getERPOverview: vi.fn(),
  getCompanyCredentials: vi.fn(),
}));
vi.mock("../api", () => mocks);

function overview(tasks: Array<{ id: number; status: string }>, assignments: Array<{ task_id: number; assignee_user_id: number }> = []) {
  return { tasks, assignments };
}

function panel(props: Partial<Parameters<typeof TodayPanel>[0]> = {}) {
  return (
    <TodayPanel
      isAdmin
      userId={1}
      onOpenBulletin={vi.fn()}
      onOpenCredentials={vi.fn()}
      onOpenTasks={vi.fn()}
      {...props}
    />
  );
}

describe("TodayPanel", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    mocks.getTenderProfile.mockResolvedValue({ matching_count: 13 });
    mocks.getERPOverview.mockResolvedValue(overview([]));
    mocks.getCompanyCredentials.mockResolvedValue([]);
  });

  it("günün üç sayısını gösterir", async () => {
    mocks.getERPOverview.mockResolvedValue(overview([
      { id: 1, status: "overdue" }, { id: 2, status: "overdue" }, { id: 3, status: "todo" },
    ]));
    mocks.getCompanyCredentials.mockResolvedValue([
      { days_remaining: 12 }, { days_remaining: 200 }, { days_remaining: null },
    ]);
    render(panel());

    expect(await screen.findByText("13")).toBeInTheDocument();
    expect(await screen.findByText("2")).toBeInTheDocument();
    // 200 gün sonrası acil değil; süresiz belge hiç değil.
    expect(await screen.findByText("1")).toBeInTheDocument();
  });

  it("yaklaşan belge süresi amber, dolmuş olan kırmızı", async () => {
    mocks.getCompanyCredentials.mockResolvedValue([{ days_remaining: 12 }]);
    const { unmount } = render(panel());
    // A clock running is a warning; red is reserved for something that has already failed.
    await waitFor(() => expect(screen.getByText("1").className).toContain("text-amber"));
    unmount();

    mocks.getCompanyCredentials.mockResolvedValue([{ days_remaining: -3 }, { days_remaining: 12 }]);
    render(panel());
    // A bid cannot be submitted on a lapsed imza sirküleri — that is a failure, not a countdown.
    await waitFor(() => expect(screen.getByText("2").className).toContain("text-red"));
    expect(await screen.findByText("1 tanesinin süresi doldu")).toBeInTheDocument();
  });

  it("sıfır gecikmeyi kırmızı göstermez", async () => {
    render(panel());

    await screen.findByText("13");
    // A zero is good news, on every row that can show one. Painting it red teaches people to
    // ignore red, and red is the only thing on this screen that has to be believed.
    for (const zero of screen.getAllByText("0")) {
      expect(zero.className).not.toContain("text-red");
    }
  });

  it("çalışana yalnız kendi geciken görevini sayar", async () => {
    mocks.getERPOverview.mockResolvedValue(overview(
      [{ id: 1, status: "overdue" }, { id: 2, status: "overdue" }],
      [{ task_id: 1, assignee_user_id: 7 }],
    ));
    render(panel({ isAdmin: false, userId: 7 }));

    expect(await screen.findByText("Geciken görevim")).toBeInTheDocument();
    // The number has to be something the reader can act on; somebody else's late task is not.
    await waitFor(() => expect(screen.getByText("1")).toBeInTheDocument());
  });

  it("belge satırını yalnızca yöneticiye gösterir", async () => {
    render(panel({ isAdmin: false, userId: 7 }));

    await screen.findByText("Size uygun ihale");
    expect(screen.queryByText("Süresi yaklaşan belge")).not.toBeInTheDocument();
    // The endpoint is admin-only; asking for it as an employee would just 403.
    expect(mocks.getCompanyCredentials).not.toHaveBeenCalled();
  });

  it("bir uç düşerse yalnız o satır düşer", async () => {
    mocks.getTenderProfile.mockRejectedValue(new Error("bülten servisi kapalı"));
    mocks.getERPOverview.mockResolvedValue(overview([{ id: 1, status: "overdue" }]));
    render(panel());

    // A blank home screen because one endpoint hiccuped would be worse than the hiccup.
    expect(await screen.findByText("şu an okunamadı")).toBeInTheDocument();
    expect(await screen.findByText("1")).toBeInTheDocument();
  });

  it("satıra dokununca ilgili ekrana götürür", async () => {
    const onOpenBulletin = vi.fn();
    render(panel({ onOpenBulletin }));

    await userEvent.click(await screen.findByText("Size uygun ihale"));

    expect(onOpenBulletin).toHaveBeenCalled();
  });
});
