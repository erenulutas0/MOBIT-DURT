import { describe, expect, it } from "vitest";
import { validateAccountRequestForm, validateLoginForm, type AccountRequestForm } from "./authForms";

function form(overrides: Partial<AccountRequestForm> = {}): AccountRequestForm {
  return {
    name: "Test User",
    username: "testuser",
    email: "test@mobit.com.tr",
    phone: "05550000000",
    password: "gucluSifre123",
    passwordConfirm: "gucluSifre123",
    code: "MOBIT-2026",
    ...overrides,
  };
}

describe("auth form yardımcıları", () => {
  it("login formunda kimlik ve şifreyi zorunlu tutar", () => {
    expect(validateLoginForm("", "admin123")).toEqual({ ok: false, error: "Kullanıcı adı/e-posta ve şifre zorunludur." });
    expect(validateLoginForm("admin", "")).toEqual({ ok: false, error: "Kullanıcı adı/e-posta ve şifre zorunludur." });
    expect(validateLoginForm(" admin ", "admin123")).toEqual({ ok: true });
  });

  it("kayıtta ad, kullanıcı adı ve şifreyi zorunlu tutar (e-posta opsiyonel)", () => {
    expect(validateAccountRequestForm(form({ name: " " }))).toEqual({
      ok: false,
      error: "Ad soyad, kullanıcı adı ve şifre zorunludur.",
    });
    expect(validateAccountRequestForm(form({ username: " " }))).toEqual({
      ok: false,
      error: "Ad soyad, kullanıcı adı ve şifre zorunludur.",
    });
    expect(validateAccountRequestForm(form({ password: "" }))).toEqual({
      ok: false,
      error: "Ad soyad, kullanıcı adı ve şifre zorunludur.",
    });
    // Email blank is allowed.
    expect(validateAccountRequestForm(form({ email: "" })).ok).toBe(true);
  });

  it("kullanıcı adı kurallarını kontrol eder", () => {
    expect(validateAccountRequestForm(form({ username: "ab" }))).toEqual({
      ok: false,
      error: "Kullanıcı adı en az 3 karakter olmalıdır.",
    });
    expect(validateAccountRequestForm(form({ username: "ad soyad" }))).toEqual({
      ok: false,
      error: "Kullanıcı adı yalnızca harf, rakam, nokta, alt çizgi veya tire içerebilir.",
    });
  });

  it("kayıtta şifre uzunluğunu ve tekrarını kontrol eder", () => {
    expect(validateAccountRequestForm(form({ password: "123456789", passwordConfirm: "123456789" }))).toEqual({
      ok: false,
      error: "Şifre en az 10 karakter olmalıdır.",
    });
    expect(validateAccountRequestForm(form({ passwordConfirm: "farkliSifre123" }))).toEqual({
      ok: false,
      error: "Şifreler eşleşmiyor.",
    });
  });

  it("geçerli kayıtta trim edilmiş backend payload'ı üretir", () => {
    expect(validateAccountRequestForm(form({
      name: "  Yeni Kullanıcı  ",
      username: "  yenikullanici  ",
      email: "  yeni@mobit.com.tr  ",
      phone: "  05551112233  ",
    }))).toEqual({
      ok: true,
      payload: {
        name: "Yeni Kullanıcı",
        username: "yenikullanici",
        email: "yeni@mobit.com.tr",
        phone: "05551112233",
        password: "gucluSifre123",
        code: "MOBIT-2026",
      },
    });
  });

  it("şirket kodu olmadan kayıt kabul etmez", () => {
    // Registration auto-approves: whoever gets through lands in the staff directory and the
    // company chat, so an empty code is an open door rather than a missing formality.
    const result = validateAccountRequestForm(form({ code: "  " }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Şirket kodu");
  });

  it("kodu boşluklarından temizleyerek gönderir", () => {
    const result = validateAccountRequestForm(form({ code: "  MOBIT-2026  " }));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.code).toBe("MOBIT-2026");
  });
});
