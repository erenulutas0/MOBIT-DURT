import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SetupPanel } from "./SetupPanel";

const mocks = vi.hoisted(() => ({
  getTenderProfile: vi.fn(),
  getCompanyCredentials: vi.fn(),
  getTenderDocumentsPage: vi.fn(),
  tenderProfileIsSet: (profile: { categories: string[]; provinces: string[] }) =>
    profile.categories.length > 0 || profile.provinces.length > 0,
}));
vi.mock("../api", () => mocks);

/** A company that has done nothing yet — the state this panel exists for. */
function blank() {
  mocks.getTenderProfile.mockResolvedValue({ categories: [], provinces: [] });
  mocks.getCompanyCredentials.mockResolvedValue([]);
  mocks.getTenderDocumentsPage.mockResolvedValue({ page: { total: 0 }, items: [] });
}

function panel(props: Partial<Parameters<typeof SetupPanel>[0]> = {}) {
  return (
    <SetupPanel
      onOpenProfile={vi.fn()}
      onOpenCredentials={vi.fn()}
      onOpenArchive={vi.fn()}
      {...props}
    />
  );
}

describe("SetupPanel", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      if (typeof mock === "function" && "mockReset" in mock) mock.mockReset();
    }
    blank();
  });

  it("yeni firmaya üç adımı da gösterir", async () => {
    render(panel());

    expect(await screen.findByText("İhale profilinizi belirleyin")).toBeInTheDocument();
    expect(screen.getByText("Şirket belgelerinizi ekleyin")).toBeInTheDocument();
    expect(screen.getByText("Şartname ve sözleşmelerinizi yükleyin")).toBeInTheDocument();
    expect(screen.getByText("0 / 3")).toBeInTheDocument();
  });

  it("hepsi tamamsa kendini hiç göstermez", async () => {
    mocks.getTenderProfile.mockResolvedValue({ categories: ["INSAAT"], provinces: [] });
    mocks.getCompanyCredentials.mockResolvedValue([{ id: 1 }]);
    mocks.getTenderDocumentsPage.mockResolvedValue({ page: { total: 42 }, items: [] });
    const { container } = render(panel());

    // A checklist with nothing left on it is clutter on the one screen people open every morning.
    await waitFor(() => expect(mocks.getTenderDocumentsPage).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector("section")).toBeNull());
  });

  it("biten adımı listede bırakır ama üstünü çizer", async () => {
    mocks.getTenderProfile.mockResolvedValue({ categories: ["INSAAT"], provinces: ["Ankara"] });
    render(panel());

    // Removing finished steps would leave a shorter list and no evidence of progress, and
    // progress is the only reason anybody finishes a checklist.
    const done = await screen.findByText("İhale profilinizi belirleyin");
    expect(done.className).toContain("line-through");
    expect(await screen.findByText("1 / 3")).toBeInTheDocument();
  });

  it("okunamayan adımı 'yapılmadı' diye göstermez", async () => {
    mocks.getCompanyCredentials.mockRejectedValue(new Error("belgeler yüklenemedi"));
    render(panel());

    // Telling a company to add paperwork it already added is the one way this panel loses its
    // credibility, and a failed probe cannot tell the difference.
    expect(await screen.findByText("İhale profilinizi belirleyin")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("0 / 2")).toBeInTheDocument());
    expect(screen.queryByText("Şirket belgelerinizi ekleyin")).not.toBeInTheDocument();
  });

  it("hiçbir uç okunamazsa panel açılmaz", async () => {
    mocks.getTenderProfile.mockRejectedValue(new Error("kapalı"));
    mocks.getCompanyCredentials.mockRejectedValue(new Error("kapalı"));
    mocks.getTenderDocumentsPage.mockRejectedValue(new Error("kapalı"));
    const { container } = render(panel());

    await waitFor(() => expect(mocks.getTenderDocumentsPage).toHaveBeenCalled());
    expect(container.querySelector("section")).toBeNull();
  });

  it("adıma dokununca ilgili ekranı açar", async () => {
    const onOpenProfile = vi.fn();
    render(panel({ onOpenProfile }));

    await userEvent.click(await screen.findByText("İhale profilinizi belirleyin"));

    expect(onOpenProfile).toHaveBeenCalled();
  });
});
