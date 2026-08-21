import { describe, expect, it } from "vitest";

import { formatTurkishNumber, parseTurkishNumber } from "./turkishNumber";

describe("turkishNumber", () => {
  it("sunucudan geleni Türkçe biçimde gösterir", () => {
    expect(formatTurkishNumber("0.85")).toBe("0,85");
    expect(formatTurkishNumber("6200000")).toBe("6.200.000");
    expect(formatTurkishNumber("6200000.5")).toBe("6.200.000,5");
    // NUMERIC(6,3) "0.850" dondurur; kutuda gorunen sayiyi degistirmeden sadelesir.
    expect(formatTurkishNumber("0.850")).toBe("0,85");
  });

  it("boş ve sayı olmayanı olduğu gibi bırakır", () => {
    expect(formatTurkishNumber(null)).toBe("");
    expect(formatTurkishNumber(undefined)).toBe("");
    // Tarih ve serbest metin bu yoldan gecerse yeniden gruplanmamali.
    expect(formatTurkishNumber("2026-08-21")).toBe("2026-08-21");
    expect(formatTurkishNumber("Köprü yapım işi")).toBe("Köprü yapım işi");
  });

  it("Türkçe yazılanı sunucu sayısına çevirir", () => {
    expect(parseTurkishNumber("0,85")).toBe("0.85");
    expect(parseTurkishNumber("6.200.000")).toBe("6200000");
    expect(parseTurkishNumber("6.200.000,5")).toBe("6200000.5");
    expect(parseTurkishNumber("   ")).toBeNull();
    expect(parseTurkishNumber("abc")).toBeNull();
  });

  it("gidiş-dönüş kayıpsız: hiçbir değer yeniden kaydedilince değişmez", () => {
    // Bu dosyanin varlik sebebi. Onceden iki yarim birbirine uymuyordu: sunucunun "0.85"i kutuya
    // oldugu gibi yaziliyor, kaydederken Turkce okunup noktalar binlik ayraci sanildigi icin
    // dokunulmamis bir cari oran 85 olarak geri gonderiliyordu.
    const stored = [
      "0.85", "1.2", "0.5", "0.123", "1", "0",
      "4000000", "6200000.5", "54524045.25", "123456789012.99",
    ];
    for (const value of stored) {
      const shown = formatTurkishNumber(value);
      const sentBack = parseTurkishNumber(shown);
      expect(Number(sentBack)).toBe(Number(value));
    }
  });

  it("bilinmeyen alanı sıfıra çevirmez", () => {
    // Bos alan "girilmedi" demek; sifir "hic yok" demek ve kontrol listesi ikisini farkli okur.
    expect(parseTurkishNumber(formatTurkishNumber(null))).toBeNull();
  });
});
