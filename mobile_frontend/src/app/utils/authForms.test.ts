import { describe, expect, it } from "vitest";
import { validateAccountRequestForm, validateLoginForm, type AccountRequestForm } from "./authForms";

function form(overrides: Partial<AccountRequestForm> = {}): AccountRequestForm {
  return {
    name: "Test User",
    email: "test@mobit.com.tr",
    phone: "05550000000",
    password: "gucluSifre123",
    passwordConfirm: "gucluSifre123",
    ...overrides,
  };
}

describe("auth form yardımcıları", () => {
  it("login formunda e-posta ve şifreyi zorunlu tutar", () => {
    expect(validateLoginForm("", "admin123")).toEqual({ ok: false, error: "E-posta ve şifre zorunludur." });
    expect(validateLoginForm("admin@mobit.com.tr", "")).toEqual({ ok: false, error: "E-posta ve şifre zorunludur." });
    expect(validateLoginForm(" admin@mobit.com.tr ", "admin123")).toEqual({ ok: true });
  });

  it("kayıt talebinde zorunlu alanları kontrol eder", () => {
    expect(validateAccountRequestForm(form({ name: " " }))).toEqual({
      ok: false,
      error: "Ad soyad, e-posta ve şifre zorunludur.",
    });
    expect(validateAccountRequestForm(form({ email: " " }))).toEqual({
      ok: false,
      error: "Ad soyad, e-posta ve şifre zorunludur.",
    });
    expect(validateAccountRequestForm(form({ password: "" }))).toEqual({
      ok: false,
      error: "Ad soyad, e-posta ve şifre zorunludur.",
    });
  });

  it("kayıt talebinde şifre uzunluğunu ve tekrarını kontrol eder", () => {
    expect(validateAccountRequestForm(form({ password: "123456789", passwordConfirm: "123456789" }))).toEqual({
      ok: false,
      error: "Şifre en az 10 karakter olmalıdır.",
    });
    expect(validateAccountRequestForm(form({ passwordConfirm: "farkliSifre123" }))).toEqual({
      ok: false,
      error: "Şifreler eşleşmiyor.",
    });
  });

  it("geçerli kayıt talebinde trim edilmiş backend payload'ı üretir", () => {
    expect(validateAccountRequestForm(form({
      name: "  Yeni Kullanıcı  ",
      email: "  yeni@mobit.com.tr  ",
      phone: "  05551112233  ",
    }))).toEqual({
      ok: true,
      payload: {
        name: "Yeni Kullanıcı",
        email: "yeni@mobit.com.tr",
        phone: "05551112233",
        password: "gucluSifre123",
      },
    });
  });
});
