import { describe, expect, it } from "vitest";
import { cleanForSpeech } from "./speech";

describe("cleanForSpeech", () => {
  it("İngilizce terimleri Türkçe fonetiğe çevirir", () => {
    expect(cleanForSpeech("AI raporu hazır")).toBe("ey-ay raporu hazır");
    expect(cleanForSpeech("IT ekibi online")).toBe("ay-ti ekibi onlayn");
    expect(cleanForSpeech("WhatsApp üzerinden e-mail gönder")).toBe("vatsap üzerinden i-meyl gönder");
    expect(cleanForSpeech("deadline yaklaşıyor, update bekliyoruz")).toBe("dedlayn yaklaşıyor, apdeyt bekliyoruz");
  });

  it("teknik/iş terimlerini fonetik okur", () => {
    expect(cleanForSpeech("IT AI integration problem")).toBe("ay-ti ey-ay integreyşın problem");
    expect(cleanForSpeech("Server scaling ve database backup planı"))
      .toBe("sörvır skeyling ve deytabeys bekap planı");
    expect(cleanForSpeech("Meeting sonrası feedback bekliyoruz"))
      .toBe("miiting sonrası fiidbek bekliyoruz");
  });

  it("Türkçe kelimeleri bozmaz", () => {
    // "ait", "bitti" gibi kelimeler AI/IT kalıplarına yakalanmamalı (word boundary + case).
    expect(cleanForSpeech("Bana ait görev bitti")).toBe("Bana ait görev bitti");
  });

  it("markdown, emoji ve linkleri temizler", () => {
    expect(cleanForSpeech("**Önemli** 🎉 https://example.com bakınız")).toBe("Önemli bakınız");
  });

  it("600 karakterde keser", () => {
    expect(cleanForSpeech("a".repeat(1000)).length).toBe(600);
  });
});
