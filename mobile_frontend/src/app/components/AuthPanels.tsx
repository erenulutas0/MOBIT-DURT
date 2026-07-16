import { AlertTriangle, CheckCircle2 } from "lucide-react";

export type AuthMode = "login" | "request" | "admin";

export function AuthModeToggle({
  mode,
  onChange,
}: {
  mode: AuthMode;
  onChange: (mode: AuthMode) => void;
}) {
  const tab = (value: AuthMode, label: string) => (
    <button
      type="button"
      onClick={() => onChange(value)}
      className={`py-2.5 rounded-xl text-sm font-semibold transition-colors ${mode === value ? "bg-primary text-white" : "text-muted-foreground"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="grid grid-cols-3 gap-2 bg-card border border-border rounded-2xl p-1 mb-5">
      {tab("login", "Giriş")}
      {tab("request", "Kayıt Ol")}
      {tab("admin", "Admin")}
    </div>
  );
}

export function AuthFeedback({ success, error }: { success?: string; error?: string }) {
  if (success) {
    return (
      <div className="flex items-center gap-2 bg-primary/10 border border-primary/25 rounded-xl px-4 py-3">
        <CheckCircle2 className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
        <p className="text-xs text-primary">{success}</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
        <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" aria-hidden="true" />
        <p className="text-xs text-red-400">{error}</p>
      </div>
    );
  }

  return null;
}
