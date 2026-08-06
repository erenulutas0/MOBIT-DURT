import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CompanyCredential } from "../api";
import { CompanyCredentialsPanel } from "./CompanyCredentialsPanel";

const mocks = vi.hoisted(() => ({
  getCompanyCredentials: vi.fn(),
  createCompanyCredential: vi.fn(),
  deleteCompanyCredential: vi.fn(),
}));
vi.mock("../api", () => mocks);

function credential(overrides: Partial<CompanyCredential> = {}): CompanyCredential {
  return {
    id: 1,
    name: "İmza Sirküleri",
    kind: null,
    issued_at: null,
    valid_until: "2026-08-22",
    document_id: null,
    note: null,
    days_remaining: 12,
    ...overrides,
  };
}

describe("CompanyCredentialsPanel", () => {
  beforeEach(() => {
    mocks.getCompanyCredentials.mockReset();
    mocks.createCompanyCredential.mockReset();
    mocks.deleteCompanyCredential.mockReset();
    mocks.getCompanyCredentials.mockResolvedValue([]);
  });

  it("kalan süreyi belgenin yanında söyler", async () => {
    mocks.getCompanyCredentials.mockResolvedValue([credential()]);
    render(<CompanyCredentialsPanel onClose={vi.fn()} />);

    expect(await screen.findByText("İmza Sirküleri")).toBeInTheDocument();
    expect(screen.getByText("12 gün kaldı")).toBeInTheDocument();
  });

  it("süresi dolmuş belgeyi kaç gün geçtiğiyle gösterir", async () => {
    mocks.getCompanyCredentials.mockResolvedValue([
      credential({ name: "Oda Kayıt Belgesi", days_remaining: -3, valid_until: "2026-08-07" }),
    ]);
    render(<CompanyCredentialsPanel onClose={vi.fn()} />);

    // "Doldu" alone leaves the next question unanswered; how long ago decides whether it is a
    // renewal to start or a bid already lost.
    expect(await screen.findByText("3 gün önce doldu")).toBeInTheDocument();
  });

  it("tarihi olmayan belgeyi aciliyet gibi göstermez", async () => {
    mocks.getCompanyCredentials.mockResolvedValue([
      credential({ name: "Vergi Levhası", valid_until: null, days_remaining: null }),
    ]);
    render(<CompanyCredentialsPanel onClose={vi.fn()} />);

    // A missing expiry is not "expires today", and colouring it red would train people to ignore red.
    expect(await screen.findByText("Süresiz")).toBeInTheDocument();
    expect(screen.getByText("Geçerlilik tarihi girilmemiş")).toBeInTheDocument();
  });

  it("hazır belge adına dokunmak formu doldurur ve kaydeder", async () => {
    const user = userEvent.setup();
    mocks.createCompanyCredential.mockResolvedValue(credential());
    render(<CompanyCredentialsPanel onClose={vi.fn()} />);

    await user.click(await screen.findByLabelText("Belge ekle"));
    await user.click(screen.getByText("SGK Borcu Yoktur Yazısı"));
    await user.click(screen.getByText("Kaydet"));

    // Typing the same five names on every install is work the app can simply not ask for.
    expect(mocks.createCompanyCredential).toHaveBeenCalledWith(
      expect.objectContaining({ name: "SGK Borcu Yoktur Yazısı" }));
  });

  it("hiç belge yokken ne işe yaradığını anlatır", async () => {
    render(<CompanyCredentialsPanel onClose={vi.fn()} />);

    expect(await screen.findByText("Henüz belge eklenmemiş.")).toBeInTheDocument();
  });
});
