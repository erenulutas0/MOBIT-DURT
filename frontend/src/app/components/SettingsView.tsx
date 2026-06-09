import { useState } from "react";
import { Save, Bot, Folder, RefreshCw, Shield } from "lucide-react";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
      <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)", background: "var(--muted)" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)", fontFamily: "Inter, sans-serif" }}>{title}</span>
      </div>
      <div className="px-4 py-4 flex flex-col gap-4">{children}</div>
    </div>
  );
}

function Field({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div className="flex-1">
        <div style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)", fontFamily: "Inter, sans-serif" }}>{label}</div>
        {description && <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2, fontFamily: "Inter, sans-serif" }}>{description}</div>}
      </div>
      <div style={{ flexShrink: 0, minWidth: 260 }}>{children}</div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  padding: "7px 10px",
  border: "1px solid var(--border)",
  borderRadius: "var(--radius)",
  background: "var(--input-background)",
  fontSize: 12,
  fontFamily: "JetBrains Mono, monospace",
  color: "var(--foreground)",
  outline: "none",
  boxSizing: "border-box" as const,
};

export function SettingsView() {
  const [botToken, setBotToken] = useState("7312●●●●●●●●:AAF-●●●●●●●●●●");
  const [vaultPath, setVaultPath] = useState("~/Documents/TenderVault");
  const [storagePath, setStoragePath] = useState("/mnt/nas/tender-archive");
  const [defaultBranch, setDefaultBranch] = useState("MOBIT");
  const [autoClassify, setAutoClassify] = useState(true);
  const [ocrEnabled, setOcrEnabled] = useState(true);
  const [notifyOnUpload, setNotifyOnUpload] = useState(false);

  return (
    <div className="p-5 flex flex-col gap-5 max-w-3xl" style={{ fontFamily: "Inter, sans-serif" }}>
      <div>
        <h1 style={{ fontSize: 16, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Settings</h1>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>System and workspace configuration</p>
      </div>

      <Section title="Telegram Bot">
        <Field label="Bot Token" description="Telegram Bot API token from @BotFather">
          <input style={inputStyle} value={botToken} onChange={(e) => setBotToken(e.target.value)} />
        </Field>
        <Field label="Webhook URL" description="Auto-configured — read-only">
          <input style={{ ...inputStyle, color: "var(--muted-foreground)" }} value="https://docsbot.internal/webhook/telegram" readOnly />
        </Field>
        <Field label="Auto-classify incoming files" description="Automatically assign files from bound groups to the correct tender">
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => setAutoClassify(!autoClassify)}
              className="rounded-full transition-colors"
              style={{
                width: 36, height: 20,
                background: autoClassify ? "var(--primary)" : "var(--switch-background)",
                position: "relative",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <div style={{
                position: "absolute",
                top: 2, left: autoClassify ? 18 : 2,
                width: 16, height: 16,
                background: "#fff",
                borderRadius: "50%",
                transition: "left 0.2s",
              }} />
            </div>
            <span style={{ fontSize: 12, color: "var(--foreground)" }}>{autoClassify ? "Enabled" : "Disabled"}</span>
          </label>
        </Field>
      </Section>

      <Section title="Storage & Vault">
        <Field label="Local storage path" description="Where raw files are stored on disk">
          <input style={inputStyle} value={storagePath} onChange={(e) => setStoragePath(e.target.value)} />
        </Field>
        <Field label="Obsidian vault path" description="Location of the Obsidian knowledge vault">
          <input style={inputStyle} value={vaultPath} onChange={(e) => setVaultPath(e.target.value)} />
        </Field>
        <Field label="OCR processing" description="Extract text from PDFs for Obsidian notes">
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => setOcrEnabled(!ocrEnabled)}
              className="rounded-full transition-colors"
              style={{
                width: 36, height: 20,
                background: ocrEnabled ? "var(--primary)" : "var(--switch-background)",
                position: "relative",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <div style={{
                position: "absolute",
                top: 2, left: ocrEnabled ? 18 : 2,
                width: 16, height: 16,
                background: "#fff",
                borderRadius: "50%",
                transition: "left 0.2s",
              }} />
            </div>
            <span style={{ fontSize: 12, color: "var(--foreground)" }}>{ocrEnabled ? "Enabled" : "Disabled"}</span>
          </label>
        </Field>
      </Section>

      <Section title="Workspace">
        <Field label="Default company branch" description="Used for new uploads when no branch is selected">
          <select
            value={defaultBranch}
            onChange={(e) => setDefaultBranch(e.target.value)}
            style={{ ...inputStyle, fontFamily: "Inter, sans-serif", cursor: "pointer" }}
          >
            {["MOBIT", "ENCON", "ENERJI A.Ş.", "TEKNOPARK"].map((b) => <option key={b}>{b}</option>)}
          </select>
        </Field>
        <Field label="Notify on new upload" description="Send a dashboard notification when files arrive">
          <label className="flex items-center gap-2 cursor-pointer">
            <div
              onClick={() => setNotifyOnUpload(!notifyOnUpload)}
              className="rounded-full transition-colors"
              style={{
                width: 36, height: 20,
                background: notifyOnUpload ? "var(--primary)" : "var(--switch-background)",
                position: "relative",
                cursor: "pointer",
                flexShrink: 0,
              }}
            >
              <div style={{
                position: "absolute",
                top: 2, left: notifyOnUpload ? 18 : 2,
                width: 16, height: 16,
                background: "#fff",
                borderRadius: "50%",
                transition: "left 0.2s",
              }} />
            </div>
            <span style={{ fontSize: 12, color: "var(--foreground)" }}>{notifyOnUpload ? "Enabled" : "Disabled"}</span>
          </label>
        </Field>
      </Section>

      <button
        className="flex items-center gap-2 px-4 py-2 rounded"
        style={{ background: "var(--primary)", color: "#fff", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", alignSelf: "flex-start" }}
      >
        <Save size={14} />
        Save settings
      </button>
    </div>
  );
}
