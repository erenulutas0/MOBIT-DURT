import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SetupCard } from "./SetupCard";

const mocks = vi.hoisted(() => ({
  getTenderProfile: vi.fn(),
  getCompanyQualification: vi.fn(),
  getCompanyCredentials: vi.fn(),
  getDocumentsPage: vi.fn(),
  tenderProfileIsSet: (profile: { categories: string[]; provinces: string[] }) =>
    profile.categories.length > 0 || profile.provinces.length > 0,
  companyQualificationIsSet: (value: Record<string, string | null>) =>
    Object.values(value).some(figure => figure !== null && figure !== ""),
}));
vi.mock("../api", () => mocks);

/** A company that has done nothing yet — the state this card exists for. */
function blank() {
  mocks.getTenderProfile.mockResolvedValue({ categories: [], provinces: [] });
  mocks.getCompanyQualification.mockResolvedValue({ turnover_last_year: null });
  mocks.getCompanyCredentials.mockResolvedValue([]);
  mocks.getDocumentsPage.mockResolvedValue({ page: { total: 0 }, items: [] });
}

describe("SetupCard", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      if (typeof mock === "function" && "mockReset" in mock) mock.mockReset();
    }
    blank();
  });

  it("yeni firmaya dört adımı da gösterir", async () => {
    render(<SetupCard setPage={vi.fn()} />);

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
    mocks.getDocumentsPage.mockResolvedValue({ page: { total: 42 }, items: [] });
    const { container } = render(<SetupCard setPage={vi.fn()} />);

    await waitFor(() => expect(mocks.getDocumentsPage).toHaveBeenCalled());
    await waitFor(() => expect(container.querySelector("section")).toBeNull());
  });

  it("okunamayan adımı 'yapılmadı' diye göstermez", async () => {
    mocks.getCompanyCredentials.mockRejectedValue(new Error("Belgeler yüklenemedi."));
    render(<SetupCard setPage={vi.fn()} />);

    // Telling a company to add paperwork it already added is the one way this card loses its
    // credibility, and a failed probe cannot tell the difference.
    expect(await screen.findByText("İhale profilinizi belirleyin")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("0 / 3")).toBeInTheDocument());
    expect(screen.queryByText("Şirket belgelerinizi ekleyin")).not.toBeInTheDocument();
  });

  it("hiçbir uç okunamazsa kart açılmaz", async () => {
    for (const key of ["getTenderProfile", "getCompanyQualification",
                       "getCompanyCredentials", "getDocumentsPage"] as const) {
      mocks[key].mockRejectedValue(new Error("kapalı"));
    }
    const { container } = render(<SetupCard setPage={vi.fn()} />);

    await waitFor(() => expect(mocks.getDocumentsPage).toHaveBeenCalled());
    expect(container.querySelector("section")).toBeNull();
  });

  it("her adım kendi sayfasına götürür", async () => {
    const user = userEvent.setup();
    const setPage = vi.fn();
    render(<SetupCard setPage={setPage} />);

    // Each step has a web page of its own — the reason the company-credentials page was written
    // rather than the step pointing at the tender archive, which is a different thing entirely.
    await user.click(await screen.findByText("Yeterlik bilgilerinizi girin"));
    expect(setPage).toHaveBeenCalledWith("company-qualification");

    await user.click(screen.getByText("Şirket belgelerinizi ekleyin"));
    expect(setPage).toHaveBeenCalledWith("company-credentials");
  });

  it("biten adımı listede bırakır ama üstünü çizer", async () => {
    mocks.getTenderProfile.mockResolvedValue({ categories: ["INSAAT"], provinces: ["Ankara"] });
    render(<SetupCard setPage={vi.fn()} />);

    const done = await screen.findByText("İhale profilinizi belirleyin");
    expect(done.className).toContain("line-through");
    expect(await screen.findByText("1 / 4")).toBeInTheDocument();
  });
});
