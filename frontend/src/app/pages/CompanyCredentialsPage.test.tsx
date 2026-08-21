import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CompanyCredential } from "../api";
import { CompanyCredentialsPage } from "./CompanyCredentialsPage";

const mocks = vi.hoisted(() => ({
  getCompanyCredentials: vi.fn(),
  createCompanyCredential: vi.fn(),
  deleteCompanyCredential: vi.fn(),
}));
vi.mock("../api", () => mocks);
const { getCompanyCredentials, createCompanyCredential, deleteCompanyCredential } = mocks;

function credential(overrides: Partial<CompanyCredential> = {}): CompanyCredential {
  return {
    id: 1, name: "İmza Sirküleri", kind: null, issued_at: null,
    valid_until: "2026-12-31", document_id: null, note: null, days_remaining: 132,
    ...overrides,
  };
}

describe("CompanyCredentialsPage", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    getCompanyCredentials.mockResolvedValue([credential()]);
    createCompanyCredential.mockResolvedValue(credential());
    deleteCompanyCredential.mockResolvedValue(undefined);
  });

  it("süresi dolmuş belgeyi listenin üstünde söyler", async () => {
    // A lapsed document is not a list item — it is the reason a bid cannot be submitted, and it
    // has to be readable without scrolling.
    getCompanyCredentials.mockResolvedValue([
      credential({ id: 2, name: "Oda Kayıt Belgesi", days_remaining: -9 }),
      credential(),
    ]);
    render(<CompanyCredentialsPage />);

    expect(await screen.findByText("1 belgenizin süresi dolmuş")).toBeInTheDocument();
    expect(screen.getByText("9 gün önce doldu")).toBeInTheDocument();
  });

  it("süresiz belgeyi aciliyet gibi göstermez", async () => {
    getCompanyCredentials.mockResolvedValue([credential({ valid_until: null, days_remaining: null })]);
    render(<CompanyCredentialsPage />);

    // Null is "no expiry", not "expires today" — reading it as urgency would cry wolf forever.
    expect(await screen.findByText("Süresiz")).toBeInTheDocument();
    expect(screen.queryByText(/süresi dolmuş/)).not.toBeInTheDocument();
  });

  it("bitiş tarihi olmadan da belge ekler", async () => {
    const user = userEvent.setup();
    render(<CompanyCredentialsPage />);

    await user.type(await screen.findByLabelText("Belgenin adı"), "Vergi Levhası");
    await user.click(screen.getByRole("button", { name: /Ekle/ }));

    // Plenty of paperwork has no expiry; a required date would be filled with a guess.
    await waitFor(() => expect(createCompanyCredential).toHaveBeenCalledWith({
      name: "Vergi Levhası", valid_until: null,
    }));
  });

  it("sık kullanılan belgeye tıklayınca adı doldurur", async () => {
    const user = userEvent.setup();
    render(<CompanyCredentialsPage />);

    await user.click(await screen.findByRole("button", { name: "SGK Borcu Yoktur Yazısı" }));

    expect(screen.getByLabelText("Belgenin adı")).toHaveValue("SGK Borcu Yoktur Yazısı");
  });

  it("adsız kayıt göndermez", async () => {
    const user = userEvent.setup();
    render(<CompanyCredentialsPage />);

    await user.click(await screen.findByRole("button", { name: /Ekle/ }));

    expect(createCompanyCredential).not.toHaveBeenCalled();
  });

  it("silmeden önce onay ister", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<CompanyCredentialsPage />);

    await user.click(await screen.findByRole("button", { name: "İmza Sirküleri kaydını sil" }));

    expect(confirm).toHaveBeenCalled();
    expect(deleteCompanyCredential).not.toHaveBeenCalled();
    confirm.mockRestore();
  });

  it("hiç belge yokken ne yapılacağını söyler", async () => {
    getCompanyCredentials.mockResolvedValue([]);
    render(<CompanyCredentialsPage />);

    expect(await screen.findByText("Henüz kayıtlı belgeniz yok")).toBeInTheDocument();
  });

  it("alınamazsa hatayı söyler", async () => {
    getCompanyCredentials.mockRejectedValue(new Error("Belgeler yüklenemedi."));
    render(<CompanyCredentialsPage />);

    expect(await screen.findByText("Belgeler yüklenemedi.")).toBeInTheDocument();
  });
});
