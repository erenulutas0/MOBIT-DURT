import { describe, expect, it } from "vitest";
import { scheduleSummary } from "./mobileWorkflow";

// Fixed formatter so the assertions are about the phrasing, not locale formatting.
const fmt = (value: string | null) => (value ? value.slice(0, 10) : "—");

describe("scheduleSummary", () => {
  it("düz termini eskisi gibi okur", () => {
    expect(scheduleSummary("at", null, "2026-08-12T09:00:00Z", fmt)).toContain("Teslim: 2026-08-12");
  });

  it("türü belirtilmemiş eski görevleri düz termin sayar", () => {
    expect(scheduleSummary(undefined, null, "2026-08-12T09:00:00Z", fmt)).toContain("Teslim: 2026-08-12");
  });

  it("…den sonra: başlangıcı öne alır", () => {
    expect(scheduleSummary("after", "2026-08-01T09:00:00Z", null, fmt))
      .toBe("2026-08-01 tarihinden sonra");
  });

  it("…den sonra + termin: ikisini birlikte söyler", () => {
    expect(scheduleSummary("after", "2026-08-01T09:00:00Z", "2026-08-20T09:00:00Z", fmt))
      .toBe("2026-08-01 sonrası · en geç 2026-08-20");
  });

  it("…arasında: iki ucu da gösterir", () => {
    expect(scheduleSummary("between", "2026-08-01T09:00:00Z", "2026-08-05T09:00:00Z", fmt))
      .toBe("2026-08-01 — 2026-08-05 arasında");
  });

  it("…den önce ve …e kadar farklı okunur", () => {
    expect(scheduleSummary("before", null, "2026-08-12T09:00:00Z", fmt))
      .toBe("2026-08-12 tarihinden önce");
    expect(scheduleSummary("until", null, "2026-08-12T09:00:00Z", fmt))
      .toBe("2026-08-12 tarihine kadar");
  });

  it("eksik tarihte uydurmaz", () => {
    expect(scheduleSummary("between", "2026-08-01T09:00:00Z", null, fmt)).toBe("Tarih aralığı eksik");
    expect(scheduleSummary("after", null, null, fmt)).toBe("Başlangıç tarihi belirlenmedi");
    expect(scheduleSummary("at", null, null, fmt)).toBe("Zaman belirlenmedi");
  });
});
