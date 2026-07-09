export type AccountRequestForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  passwordConfirm: string;
};

export type AccountRequestValidation =
  | {
      ok: true;
      payload: {
        name: string;
        email: string;
        phone: string;
        password: string;
      };
    }
  | {
      ok: false;
      error: string;
    };

export function validateAccountRequestForm(form: AccountRequestForm): AccountRequestValidation {
  const name = form.name.trim();
  const email = form.email.trim();
  const phone = form.phone.trim();

  if (!name || !email || !form.password) {
    return { ok: false, error: "Ad soyad, e-posta ve şifre zorunludur." };
  }
  if (form.password.length < 10) {
    return { ok: false, error: "Şifre en az 10 karakter olmalıdır." };
  }
  if (form.password !== form.passwordConfirm) {
    return { ok: false, error: "Şifreler eşleşmiyor." };
  }

  return {
    ok: true,
    payload: {
      name,
      email,
      phone,
      password: form.password,
    },
  };
}

export function validateLoginForm(email: string, password: string) {
  if (!email.trim() || !password) {
    return { ok: false as const, error: "E-posta ve şifre zorunludur." };
  }
  return { ok: true as const };
}
