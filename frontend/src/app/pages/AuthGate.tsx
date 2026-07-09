import { useState } from "react";
import {
  ERPSession,
  createERPAccountRequest,
  loginERPAdmin,
  loginERPUser,
} from "../api";
import { persistSession } from "../lib/helpers";

export function AuthGate({ onSession }: { onSession: (session: ERPSession) => void }) {
  const [mode, setMode] = useState<"user" | "admin" | "register">("user");
  const [adminForm, setAdminForm] = useState({ username: "admin", password: "" });
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submitAdmin = async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const next = await loginERPAdmin(adminForm.username, adminForm.password);
      persistSession(next);
      onSession(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin girişi başarısız");
    } finally {
      setLoading(false);
    }
  };

  const submitUser = async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const next = await loginERPUser(loginForm.email, loginForm.password);
      persistSession(next);
      onSession(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Çalışan girişi başarısız");
    } finally {
      setLoading(false);
    }
  };

  const submitRegister = async () => {
    setLoading(true);
    setError("");
    setMessage("");
    try {
      await createERPAccountRequest({
        name: registerForm.name,
        email: registerForm.email,
        password: registerForm.password,
        phone: registerForm.phone || null,
      });
      setRegisterForm({ name: "", email: "", password: "", phone: "" });
      setMode("user");
      setMessage("Hesap isteğiniz admine gönderildi. Onaydan sonra giriş yapabilirsiniz.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hesap isteği gönderilemedi");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-4xl grid grid-cols-[360px_1fr] gap-5">
        <div className="bg-white border border-border rounded p-5 space-y-4">
          <div>
            <h1 className="text-lg font-bold text-foreground">DocsBot Ops</h1>
            <p className="text-xs text-muted-foreground mt-1">ERP takip ve Tender Hub çalışma alanına giriş yapın.</p>
          </div>
          <div className="grid grid-cols-3 gap-1 bg-slate-50 border border-border rounded p-1">
            {[
              ["user", "Çalışan"],
              ["admin", "Admin"],
              ["register", "Hesap iste"],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => { setMode(key as typeof mode); setError(""); setMessage(""); }}
                className={`text-xs rounded px-2 py-1.5 ${mode === key ? "bg-teal-600 text-white" : "text-muted-foreground hover:bg-white"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === "admin" && (
            <form onSubmit={(event) => { event.preventDefault(); submitAdmin(); }} className="space-y-3">
              <input value={adminForm.username} onChange={(event) => setAdminForm({ ...adminForm, username: event.target.value })} className="w-full text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" placeholder="Admin kullanıcı adı" />
              <input required type="password" value={adminForm.password} onChange={(event) => setAdminForm({ ...adminForm, password: event.target.value })} className="w-full text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" placeholder="Admin şifresi" />
              <button disabled={loading} className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded py-2">Admin olarak gir</button>
            </form>
          )}

          {mode === "user" && (
            <form onSubmit={(event) => { event.preventDefault(); submitUser(); }} className="space-y-3">
              <input required type="email" value={loginForm.email} onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })} className="w-full text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" placeholder="E-posta" />
              <input required type="password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} className="w-full text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" placeholder="Şifre" />
              <button disabled={loading} className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded py-2">Çalışan olarak gir</button>
            </form>
          )}

          {mode === "register" && (
            <form onSubmit={(event) => { event.preventDefault(); submitRegister(); }} className="space-y-3">
              <input required value={registerForm.name} onChange={(event) => setRegisterForm({ ...registerForm, name: event.target.value })} className="w-full text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" placeholder="Ad soyad" />
              <input required type="email" value={registerForm.email} onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })} className="w-full text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" placeholder="E-posta" />
              <input required type="password" value={registerForm.password} onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })} className="w-full text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" placeholder="Şifre" />
              <input value={registerForm.phone} onChange={(event) => setRegisterForm({ ...registerForm, phone: event.target.value })} className="w-full text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" placeholder="Telefon" />
              <button disabled={loading} className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold rounded py-2">Hesap isteği gönder</button>
            </form>
          )}

          {message && <div className="text-xs bg-emerald-50 border border-emerald-100 text-emerald-700 rounded px-3 py-2">{message}</div>}
          {error && <div className="text-xs bg-red-50 border border-red-100 text-red-700 rounded px-3 py-2">{error}</div>}
        </div>

        <div className="bg-white border border-border rounded p-6">
          <h2 className="text-sm font-bold text-foreground">Yetki modeli</h2>
          <div className="grid gap-3 mt-4">
            {[
              ["Admin", "Tüm çalışanları, görevleri, onayları, hesap taleplerini ve Tender Hub yönetimini görür."],
              ["Çalışan", "Sadece kendi profili, kendi görevleri, kendi görev konuşmaları ve kendi bildirimlerini görür."],
              ["Mesajlar", "Her konuşma bir göreve bağlıdır. Göreve atanmayan kullanıcı konuşmayı göremez."],
              ["Bildirimler", "Admin bildirimleri user_id=0, çalışan bildirimleri kendi user_id değeriyle çekilir."],
            ].map(([title, text]) => (
              <div key={title} className="border border-border rounded p-3">
                <p className="text-xs font-semibold text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground mt-1">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

