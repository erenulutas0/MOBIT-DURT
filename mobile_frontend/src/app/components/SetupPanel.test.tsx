import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SetupPanel } from "./SetupPanel";

const mocks = vi.hoisted(() => ({
  getTenderProfile: vi.fn(),
  getCompanyQualification: vi.fn(),
  getCompanyCredentials: vi.fn(),
  getTenderDocumentsPage: vi.fn(),
  tenderProfileIsSet: (profile: { categories: string[]; provinces: string[] }) =>
    profile.categories.length > 0 || profile.provinces.length > 0,
  companyQualificationIsSet: (value: Record<string, string | null>) =>
    Object.values(value).some(figure => figure !== null && figure !== ""),
}));
vi.mock("../api", () => mocks);

/** A company that has done nothing yet — the state this panel exists for. */
function blank() {
  mocks.getTenderProfile.mockResolvedValue({ categories: [], provinces: [] });
  mocks.getCompanyQualification.mockResolvedValue({ turnover_last_year: null });
  mocks.getCompanyCredentials.mockResolvedValue([]);
  mocks.getTenderDocumentsPage.mockResolvedValue({ page: { total: 0 }, items: [] });
}

function panel(props: Partial<Parameters<typeof SetupPanel>[0]> = {}) {
  return (
    <SetupPanel
      onOpenProfile={vi.fn()}
      onOpenQualification={vi.fn()}
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

  it("yeni firmaya dört adımı da gösterir", async () => {
    render(panel());

    expect(await screen.findByText("İhale profilinizi belirleyin")).toBeInTheDocument();
    expect(screen.getByText("Yeterlik bilgilerinizi girin")).toBeInTheDocument();
    expect(screen.getByText("Şirket belgelerinizi ekleyin")).toBeInTheDocument();
    expect(screen.getByText("Şartname ve sözleşmelerinizi yükleyin")).toBeInTheDocument();
    expect(screen.getByText("0 / 4")).toBeInTheDocument();
  });

  it("hepsi tamamsa kendini hiç göstermez", async () => {
    mocks.getTenderProfile.mockResolvedValue({ categories: ["INSAAT"], provinces: [] });
    mocks.getCompanyQualification.mockResolvedValue({ turnover_last_year: "4000000" });
    mocks.getCompanyCredentials.mockResolvedValue([{ id: 1 }]);
    mocks.getTenderDocumentsPage.mockResolvedValue({ page: { total: 42 }, items: [] });
    const { container } = render(panel());

    // A checklist with nothing left on it is clutter on the one screen people open every morning.
    await waitFor(() => expect(mocks.getTenderDocumentsPage).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector("section")).toBeNull());
  });

  it("tek rakam girilmişse yeterliği tamamlanmış sayar", async () => {
    // Turnover and nothing else still answers every tender whose only bar is turnover, and asking
    // again for a form the company has already filled in as far as it can is how a checklist
    // teaches people to ignore it.
    mocks.getCompanyQualification.mockResolvedValue({
      turnover_last_year: "4000000", experience_amount: null, bank_reference_limit: null,
    });
    render(panel());

    const done = await screen.findByText("Yeterlik bilgilerinizi girin");
    expect(done.className).toContain("line-through");
  });

  it("biten adımı listede bırakır ama üstünü çizer", async () => {
    mocks.getTenderProfile.mockResolvedValue({ categories: ["INSAAT"], provinces: ["Ankara"] });
    render(panel());

    // Removing finished steps would leave a shorter list and no evidence of progress, and
    // progress is the only reason anybody finishes a checklist.
    const done = await screen.findByText("İhale profilinizi belirleyin");
    expect(done.className).toContain("line-through");
    expect(await screen.findByText("1 / 4")).toBeInTheDocument();
  });

  it("okunamayan adımı 'yapılmadı' diye göstermez", async () => {
    mocks.getCompanyCredentials.mockRejectedValue(new Error("belgeler yüklenemedi"));
    render(panel());

    // Telling a company to add paperwork it already added is the one way this panel loses its
    // credibility, and a failed probe cannot tell the difference.
    expect(await screen.findByText("İhale profilinizi belirleyin")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("0 / 3")).toBeInTheDocument());
    expect(screen.queryByText("Şirket belgelerinizi ekleyin")).not.toBeInTheDocument();
  });

  it("hiçbir uç okunamazsa panel açılmaz", async () => {
    mocks.getTenderProfile.mockRejectedValue(new Error("kapalı"));
    mocks.getCompanyQualification.mockRejectedValue(new Error("kapalı"));
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

  it("yeterlik adımı ihale aramadan doğrudan açılır", async () => {
    // The reason this step exists: the figures were only reachable from inside a tender's own
    // yeterlik section, so a company had to find a tender before it could say anything about
    // itself — and until it did, every checklist line answered "bilinmiyor".
    const onOpenQualification = vi.fn();
    render(panel({ onOpenQualification }));

    await userEvent.click(await screen.findByText("Yeterlik bilgilerinizi girin"));

    expect(onOpenQualification).toHaveBeenCalled();
  });
});
