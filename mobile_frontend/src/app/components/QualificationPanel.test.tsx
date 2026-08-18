import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { QualificationCheck } from "../api";
import { QualificationPanel } from "./QualificationPanel";

const getQualification = vi.hoisted(() => vi.fn());
vi.mock("../api", () => ({ getQualification }));

function check(overrides: Partial<QualificationCheck> = {}): QualificationCheck {
  return {
    qualification_published: true,
    bid_amount: "8000000",
    items: [
      {
        key: "experience", label: "İş deneyimi", status: "MET",
        required: "4000000.00", available: "6200000", note: null,
      },
      {
        key: "turnover", label: "Toplam ciro", status: "NOT_REQUIRED",
        required: null, available: null,
        note: "Bu ihalede ekonomik ve mali yeterlik kriteri belirtilmemiş.",
      },
    ],
    ...overrides,
  };
}

describe("QualificationPanel", () => {
  beforeEach(() => {
    getQualification.mockReset();
    getQualification.mockResolvedValue(check());
  });

  it("gerekli tutarı ve elde olanı yan yana gösterir", async () => {
    render(<QualificationPanel noticeId={7} />);

    // Both numbers travel together: seeing that 4 million is needed against 6,2 million in hand is
    // the whole answer, and either figure alone is half of it.
    expect(await screen.findByText(/Gerekli: 4.000.000/)).toBeInTheDocument();
    expect(screen.getByText(/Sizde: 6.200.000/)).toBeInTheDocument();
  });

  it("teklif tutarı girilince sunucuya onunla sorar", async () => {
    const user = userEvent.setup();
    render(<QualificationPanel noticeId={7} />);
    await screen.findByText("İş deneyimi");

    await user.type(screen.getByPlaceholderText("örn. 8.000.000"), "8.000.000");
    await user.click(screen.getByText("Hesapla"));

    // Every bar is a ratio of the offer, so the offer is the input.
    expect(getQualification).toHaveBeenLastCalledWith(7, 8000000);
  });

  it("bilinmeyeni yetersizden ayırır", async () => {
    getQualification.mockResolvedValue(check({
      items: [{
        key: "turnover", label: "Toplam ciro", status: "UNKNOWN",
        required: "250000.00", available: null, note: "Son yıl cironuz kayıtlı değil.",
      }],
    }));
    render(<QualificationPanel noticeId={7} />);

    // A company that has not typed its turnover in must never be told it cannot bid: that is a
    // claim, and a wrong one costs a tender it could have won.
    const note = await screen.findByText("Son yıl cironuz kayıtlı değil.");
    expect(note).toBeInTheDocument();
    expect(screen.queryByText(/yetersiz/i)).not.toBeInTheDocument();
  });

  it("yeterlik şartı yayımlanmamışsa bunu boş liste gibi göstermez", async () => {
    getQualification.mockResolvedValue(check({ qualification_published: false, items: [] }));
    render(<QualificationPanel noticeId={7} />);

    expect(await screen.findByText("Bu ilanda yeterlik şartı yayımlanmamış")).toBeInTheDocument();
  });

  it("teklif girilmeden önce oranları anlatır, hüküm vermez", async () => {
    getQualification.mockResolvedValue(check({
      bid_amount: null,
      items: [{
        key: "experience", label: "İş deneyimi", status: "UNKNOWN",
        required: null, available: null,
        note: "Teklif tutarını girin: şart, teklifin %50'si kadar iş deneyimi.",
      }],
    }));
    render(<QualificationPanel noticeId={7} />);

    expect(await screen.findByText(/Şartların hepsi teklif bedeline oranlıdır/)).toBeInTheDocument();
  });

  it("kontrol yapılamazsa hatayı söyler", async () => {
    getQualification.mockRejectedValue(new Error("Yeterlik kontrolü yapılamadı."));
    render(<QualificationPanel noticeId={7} />);

    expect(await screen.findByText("Yeterlik kontrolü yapılamadı.")).toBeInTheDocument();
  });
});
