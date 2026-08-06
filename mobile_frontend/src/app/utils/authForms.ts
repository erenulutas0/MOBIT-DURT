export type AccountRequestForm = {
  name: string;
  username: string;
  email: string;
  phone: string;
  password: string;
  passwordConfirm: string;
  /** The company's join code, handed out by the admin. */
  code: string;
};

export type AccountRequestValidation =
  | {
      ok: true;
      payload: {
        name: string;
        username: string;
        email: string;
        phone: string;
        password: string;
        code: string;
      };
    }
  | {
      ok: false;
      error: string;
    };

const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;

export function validateAccountRequestForm(form: AccountRequestForm): AccountRequestValidation {
  const name = form.name.trim();
  const username = form.username.trim();
  const email = form.email.trim();
  const phone = form.phone.trim();

  if (!name || !username || !form.password) {
    return { ok: false, error: "Ad soyad, kullanıcı adı ve şifre zorunludur." };
  }
  // Registration auto-approves: whoever gets through lands in the staff directory and the
  // company chat, so the code is the door rather than a formality.
  if (!form.code.trim()) {
    return { ok: false, error: "Şirket kodu zorunludur. Yöneticinizden alabilirsiniz." };
  }
  if (username.length < 3) {
    return { ok: false, error: "Kullanıcı adı en az 3 karakter olmalıdır." };
  }
  if (!USERNAME_PATTERN.test(username)) {
    return { ok: false, error: "Kullanıcı adı yalnızca harf, rakam, nokta, alt çizgi veya tire içerebilir." };
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
      username,
      email,
      phone,
      password: form.password,
      code: form.code.trim(),
    },
  };
}

export function validateLoginForm(identifier: string, password: string) {
  if (!identifier.trim() || !password) {
    return { ok: false as const, error: "Kullanıcı adı/e-posta ve şifre zorunludur." };
  }
  return { ok: true as const };
}
