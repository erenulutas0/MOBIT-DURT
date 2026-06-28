import { ArrowRight, BriefcaseBusiness, Check, ClipboardList, LogIn, ShieldCheck, UserPlus, X } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import {
  ERPAccountRequest,
  ERPSession,
  approveERPAccountRequest,
  createERPAccountRequest,
  getERPAccountRequests,
  loginERPAdmin,
  loginERPUser,
  rejectERPAccountRequest,
} from "../api";

export type SessionRole = "admin" | "user";

type HomeViewProps = {
  session: ERPSession | null;
  onSessionChange: (session: ERPSession | null) => void;
  onOpenERP: () => void;
  onOpenTender: () => void;
};

export function HomeView({ session, onSessionChange, onOpenERP, onOpenTender }: HomeViewProps) {
  const [mode, setMode] = useState<"admin" | "user" | "register">("user");
  const [adminForm, setAdminForm] = useState({ username: "admin", password: "" });
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ name: "", email: "", password: "", phone: "" });
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [requests, setRequests] = useState<ERPAccountRequest[]>([]);

  const isAdmin = session?.role === "admin";

  const loadRequests = () => {
    if (!isAdmin) return;
    getERPAccountRequests("pending").then(setRequests).catch((err) => setError(err.message));
  };

  useEffect(() => {
    loadRequests();
  }, [isAdmin]);

  const handleAdminLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      onSessionChange(await loginERPAdmin(adminForm.username, adminForm.password));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Admin girisi basarisiz");
    }
  };

  const handleUserLogin = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      onSessionChange(await loginERPUser(loginForm.email, loginForm.password));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Calisan girisi basarisiz");
    }
  };

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault();
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
      setMessage("Hesap isteginiz admine gonderildi. Onaydan sonra giris yapabilirsiniz.");
      setMode("user");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Hesap istegi olusturulamadi");
    }
  };

  const approve = async (requestId: number) => {
    setError("");
    await approveERPAccountRequest(requestId).catch((err) => setError(err.message));
    loadRequests();
  };

  const reject = async (requestId: number) => {
    setError("");
    await rejectERPAccountRequest(requestId).catch((err) => setError(err.message));
    loadRequests();
  };

  return (
    <div className="p-5" style={{ fontFamily: "Inter, sans-serif" }}>
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "var(--foreground)" }}>DocsBot Ops</h1>
          <p style={{ margin: "6px 0 0", color: "var(--muted-foreground)", fontSize: 13 }}>
            ERP takip ve ihale doküman merkezi için ana çalışma ekranı.
          </p>
          {session && (
            <div style={{ marginTop: 10, fontSize: 13, color: "var(--muted-foreground)" }}>
              Oturum: <strong style={{ color: "var(--foreground)" }}>{session.name}</strong> · {session.role === "admin" ? "Admin" : "Calisan"}
            </div>
          )}
        </div>
        {session && (
          <button onClick={() => onSessionChange(null)} className="rounded px-3 py-2" style={secondaryButtonStyle}>
            Cikis yap
          </button>
        )}
      </div>

      {!session ? (
        <div className="grid gap-4" style={{ gridTemplateColumns: "420px 1fr", marginTop: 20 }}>
          <section className="rounded p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <div className="flex gap-2" style={{ marginBottom: 14 }}>
              <ModeButton active={mode === "user"} onClick={() => setMode("user")} label="Çalışan girişi" />
              <ModeButton active={mode === "admin"} onClick={() => setMode("admin")} label="Admin girişi" />
              <ModeButton active={mode === "register"} onClick={() => setMode("register")} label="Hesap iste" />
            </div>

            {mode === "admin" && (
              <form onSubmit={handleAdminLogin} className="flex flex-col gap-3">
                <PanelTitle icon={<ShieldCheck size={17} />} title="Admin girişi" text="Yönetici hesabıyla tüm ekip, görev ve onay kuyruğu görülür." />
                <input value={adminForm.username} onChange={(event) => setAdminForm({ ...adminForm, username: event.target.value })} placeholder="Admin kullanıcı adı" style={inputStyle} />
                <input required type="password" value={adminForm.password} onChange={(event) => setAdminForm({ ...adminForm, password: event.target.value })} placeholder="Admin şifresi" style={inputStyle} />
                <button className="flex items-center justify-center gap-2 rounded py-2" style={primaryButtonStyle}><LogIn size={14} />Admin olarak gir</button>
              </form>
            )}

            {mode === "user" && (
              <form onSubmit={handleUserLogin} className="flex flex-col gap-3">
                <PanelTitle icon={<LogIn size={17} />} title="Çalışan girişi" text="Hesabı admin onaylanan çalışanlar giriş yapabilir." />
                <input required type="email" value={loginForm.email} onChange={(event) => setLoginForm({ ...loginForm, email: event.target.value })} placeholder="E-posta" style={inputStyle} />
                <input required type="password" value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} placeholder="Şifre" style={inputStyle} />
                <button className="flex items-center justify-center gap-2 rounded py-2" style={primaryButtonStyle}><LogIn size={14} />Giriş yap</button>
              </form>
            )}

            {mode === "register" && (
              <form onSubmit={handleRegister} className="flex flex-col gap-3">
                <PanelTitle icon={<UserPlus size={17} />} title="Hesap oluşturma isteği" text="İstek admine düşer; onaylanınca çalışan hesabı açılır." />
                <input required value={registerForm.name} onChange={(event) => setRegisterForm({ ...registerForm, name: event.target.value })} placeholder="Ad soyad" style={inputStyle} />
                <input required type="email" value={registerForm.email} onChange={(event) => setRegisterForm({ ...registerForm, email: event.target.value })} placeholder="E-posta" style={inputStyle} />
                <input required type="password" value={registerForm.password} onChange={(event) => setRegisterForm({ ...registerForm, password: event.target.value })} placeholder="Şifre (en az 6 karakter)" style={inputStyle} />
                <input value={registerForm.phone} onChange={(event) => setRegisterForm({ ...registerForm, phone: event.target.value })} placeholder="Telefon (opsiyonel)" style={inputStyle} />
                <button className="flex items-center justify-center gap-2 rounded py-2" style={primaryButtonStyle}><UserPlus size={14} />İstek gönder</button>
              </form>
            )}

            {message && <div className="rounded p-3" style={{ marginTop: 12, background: "var(--success-bg)", color: "var(--success)", fontSize: 12 }}>{message}</div>}
            {error && <div className="rounded p-3" style={{ marginTop: 12, background: "#fff1f2", color: "var(--destructive)", fontSize: 12 }}>{error}</div>}
          </section>

          <section className="rounded p-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Giriş akışı</h2>
            <div className="grid gap-3" style={{ marginTop: 16 }}>
              <FlowLine title="1. Çalışan hesap ister" text="Ad, e-posta ve şifre ile başvuru oluşturur." />
              <FlowLine title="2. Admin onaylar" text="Admin ana sayfada bekleyen istekleri görür, onaylar veya reddeder." />
              <FlowLine title="3. Hesap aktif olur" text="Onaylanan çalışan kendi şifresiyle giriş yapar ve sadece kendi görevlerini görür." />
            </div>
          </section>
        </div>
      ) : (
        <>
        <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", marginTop: 20 }}>
            <ModuleCard
              title="ERP-TAKIP"
              text="Çalışanlar, görev kartları, deadline takibi, doküman paylaşımı ve yönetici yardım kanalı."
              icon={<ClipboardList size={22} />}
              action="ERP ekranını aç"
              onClick={onOpenERP}
            />
            <ModuleCard
              title="Tender Hub"
              text={isAdmin ? "Telegram'dan gelen ihale dokümanları, klasör ağacı, Obsidian notları ve yükleme ekranları." : "Tender Hub sadece admin yetkisiyle açılır."}
              icon={<BriefcaseBusiness size={22} />}
              action={isAdmin ? "Tender Hub'ı aç" : "Admin yetkisi gerekli"}
              onClick={isAdmin ? onOpenTender : undefined}
              disabled={!isAdmin}
            />
          </div>

          {isAdmin && (
            <section className="rounded" style={{ marginTop: 18, background: "var(--card)", border: "1px solid var(--border)" }}>
              <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 650 }}>Hesap onay kuyrugu</div>
                  <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 1 }}>Calisan hesap istekleri burada onaylanir.</div>
                </div>
                <button onClick={loadRequests} className="rounded px-3 py-1.5" style={secondaryButtonStyle}>Yenile</button>
              </div>
              {requests.length === 0 ? (
                <div className="px-4 py-4" style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Bekleyen hesap istegi yok.</div>
              ) : requests.map((request) => (
                <div key={request.id} className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
                  <div className="flex-1">
                    <div style={{ fontSize: 13, fontWeight: 650 }}>{request.name}</div>
                    <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>{request.email}{request.phone ? ` · ${request.phone}` : ""}</div>
                  </div>
                  <button onClick={() => approve(request.id)} className="flex items-center gap-1 rounded px-2 py-1" style={secondaryButtonStyle}><Check size={13} />Onayla</button>
                  <button onClick={() => reject(request.id)} className="flex items-center gap-1 rounded px-2 py-1" style={{ ...secondaryButtonStyle, color: "var(--destructive)" }}><X size={13} />Reddet</button>
                </div>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function ModeButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded px-3 py-2"
      style={{
        border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
        background: active ? "var(--secondary)" : "var(--card)",
        color: "var(--foreground)",
        fontSize: 12,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );
}

function PanelTitle({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div>
      <div className="flex items-center gap-2" style={{ fontSize: 15, fontWeight: 700 }}>{icon}{title}</div>
      <div style={{ marginTop: 4, color: "var(--muted-foreground)", fontSize: 12, lineHeight: 1.45 }}>{text}</div>
    </div>
  );
}

function FlowLine({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded p-3" style={{ border: "1px solid var(--border)", background: "var(--background)" }}>
      <div style={{ fontSize: 13, fontWeight: 650 }}>{title}</div>
      <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 3 }}>{text}</div>
    </div>
  );
}

function ModuleCard({
  title,
  text,
  icon,
  action,
  onClick,
  disabled,
}: {
  title: string;
  text: string;
  icon: React.ReactNode;
  action: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="rounded p-5 text-left"
      style={{
        minHeight: 190,
        border: "1px solid var(--border)",
        background: disabled ? "var(--muted)" : "var(--card)",
        cursor: disabled ? "not-allowed" : "pointer",
        color: "var(--foreground)",
        opacity: disabled ? 0.65 : 1,
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center justify-center rounded" style={{ width: 38, height: 38, background: "var(--secondary)", color: "var(--primary)" }}>
          {icon}
        </div>
        <ArrowRight size={18} style={{ color: "var(--muted-foreground)" }} />
      </div>
      <h2 style={{ margin: "18px 0 8px", fontSize: 17, fontWeight: 800 }}>{title}</h2>
      <p style={{ margin: 0, color: "var(--muted-foreground)", fontSize: 13, lineHeight: 1.5, maxWidth: 520 }}>{text}</p>
      <div style={{ marginTop: 18, color: "var(--primary)", fontSize: 12, fontWeight: 750 }}>{action}</div>
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--input-background)",
  borderRadius: 4,
  padding: "9px 10px",
  fontSize: 12,
  color: "var(--foreground)",
  outline: "none",
};

const primaryButtonStyle: React.CSSProperties = {
  border: "none",
  background: "var(--primary)",
  color: "#fff",
  fontSize: 12,
  cursor: "pointer",
  fontWeight: 700,
};

const secondaryButtonStyle: React.CSSProperties = {
  border: "1px solid var(--border)",
  background: "var(--card)",
  color: "var(--foreground)",
  fontSize: 12,
  cursor: "pointer",
};
