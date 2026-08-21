import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CompanyQualification } from "../api";
import { CompanyQualificationPage } from "./CompanyQualificationPage";

const mocks = vi.hoisted(() => ({
  getCompanyQualification: vi.fn(), saveCompanyQualification: vi.fn(),
}));
vi.mock("../api", () => mocks);
const { getCompanyQualification, saveCompanyQualification } = mocks;

function record(overrides: Partial<CompanyQualification> = {}): CompanyQualification {
  return {
    experience_amount: null, experience_date: null, experience_subject: null,
    turnover_last_year: null, turnover_previous_year: null, sector_turnover: null,
    current_ratio: null, equity_ratio: null, bank_debt_ratio: null,
    bank_reference_limit: null, updated_by: null, updated_at: null,
    ...overrides,
  };
}

describe("CompanyQualificationPage", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) mock.mockReset();
    getCompanyQualification.mockResolvedValue(record());
    saveCompanyQualification.mockImplementation(async (payload: Partial<CompanyQualification>) =>
      record(payload));
  });

  it("girilmemiş alanı sıfırla doldurmaz", async () => {
    render(<CompanyQualificationPage />);

    // A zero is a claim — "we have none" — and a blank is not. Pre-filling would turn every field
    // the company has not got round to into a statement it never made.
    const field = await screen.findByLabelText("Son yıl cirosu");
    expect(field).toHaveValue("");
    expect(await screen.findByText("Henüz girilmedi")).toBeInTheDocument();
  });

  it("boş bırakılan alanı null olarak gönderir, 0 olarak değil", async () => {
    const user = userEvent.setup();
    render(<CompanyQualificationPage />);

    await user.type(await screen.findByLabelText("Son yıl cirosu"), "6.200.000");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(saveCompanyQualification).toHaveBeenCalled());
    const sent = saveCompanyQualification.mock.calls[0][0];
    // Turkish thousands separators are stripped; everything untouched stays absent.
    expect(sent.turnover_last_year).toBe("6200000");
    expect(sent.current_ratio).toBeNull();
    expect(sent.experience_amount).toBeNull();
  });

  it("ondalık virgülü kabul eder", async () => {
    const user = userEvent.setup();
    render(<CompanyQualificationPage />);

    await user.type(await screen.findByLabelText("Cari oran"), "0,85");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(saveCompanyQualification).toHaveBeenCalled());
    expect(saveCompanyQualification.mock.calls[0][0].current_ratio).toBe("0.85");
  });

  it("kaydedildi yazısını değişiklik yapılınca kaldırır", async () => {
    const user = userEvent.setup();
    render(<CompanyQualificationPage />);

    await user.type(await screen.findByLabelText("Cari oran"), "1,2");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(await screen.findByText("Kaydedildi")).toBeInTheDocument();

    // Leaving it up next to an edited field would say the edit is saved when it is not.
    await user.type(screen.getByLabelText("Öz kaynak oranı"), "0,3");
    expect(screen.queryByText("Kaydedildi")).not.toBeInTheDocument();
  });

  it("okunamazsa formu boş kaydedilebilir halde bırakmaz", async () => {
    getCompanyQualification.mockRejectedValue(new Error("Yeterlik bilgileri alınamadı."));
    render(<CompanyQualificationPage />);

    // Saving a form that never loaded would overwrite real figures with blanks.
    expect(await screen.findByText("Yeterlik bilgileri alınamadı.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Kaydet" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tekrar dene" })).toBeInTheDocument();
  });

  it("tekrar denediğinde formu getirir", async () => {
    const user = userEvent.setup();
    getCompanyQualification.mockRejectedValueOnce(new Error("Yeterlik bilgileri alınamadı."));
    getCompanyQualification.mockResolvedValue(record({ turnover_last_year: "4000000" }));
    render(<CompanyQualificationPage />);

    await user.click(await screen.findByRole("button", { name: "Tekrar dene" }));

    expect(await screen.findByLabelText("Son yıl cirosu")).toHaveValue("4.000.000");
    expect(screen.queryByText("Yeterlik bilgileri alınamadı.")).not.toBeInTheDocument();
  });

  it("dokunulmayan oranı yeniden kaydedince aynen geri gönderir", async () => {
    // Bu testin varlik sebebi olan hata: sunucunun "0.85"i kutuya oldugu gibi yaziliyor, kaydederken
    // Turkce okunup noktalar binlik ayraci sanildigi icin dokunulmamis cari oran 85 olarak geri
    // gidiyordu. Musteri sadece cirosunu duzeltmek icin ekrani actiginda oranlari bozuluyordu.
    const user = userEvent.setup();
    getCompanyQualification.mockResolvedValue(record({
      current_ratio: "0.85", equity_ratio: "1.2", turnover_last_year: "6200000",
    }));
    render(<CompanyQualificationPage />);

    // Sadece ilgisiz bir alana dokunuluyor.
    await user.type(await screen.findByLabelText("İşin konusu"), "Köprü");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));

    await waitFor(() => expect(saveCompanyQualification).toHaveBeenCalled());
    const sent = saveCompanyQualification.mock.calls[0][0];
    expect(Number(sent.current_ratio)).toBe(0.85);
    expect(Number(sent.equity_ratio)).toBe(1.2);
    expect(Number(sent.turnover_last_year)).toBe(6200000);
  });

  it("kayıtlı değeri Türkçe biçimde gösterir", async () => {
    getCompanyQualification.mockResolvedValue(record({
      current_ratio: "0.850", turnover_last_year: "6200000",
    }));
    render(<CompanyQualificationPage />);

    expect(await screen.findByLabelText("Cari oran")).toHaveValue("0,85");
    expect(screen.getByLabelText("Son yıl cirosu")).toHaveValue("6.200.000");
  });

  it("kim ne zaman güncellemiş gösterir", async () => {
    getCompanyQualification.mockResolvedValue(record({
      turnover_last_year: "4000000", updated_by: "Eren", updated_at: "2026-08-20T09:15:00Z",
    }));
    render(<CompanyQualificationPage />);

    expect(await screen.findByText(/Eren/)).toBeInTheDocument();
    expect(await screen.findByLabelText("Son yıl cirosu")).toHaveValue("4.000.000");
  });
});
