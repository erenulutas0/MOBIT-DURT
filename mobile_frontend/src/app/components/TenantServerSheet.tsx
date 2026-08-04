import { useState } from "react";
import { Building2, Loader2, RotateCcw, X } from "lucide-react";

import {
  clearTenantServer,
  currentTenantServer,
  hasCustomTenantServer,
  probeTenantServer,
  resolveTenantServer,
  setTenantServer,
} from "../api";

/**
 * Points the app at a customer's own backend.
 *
 * <p>Every customer runs their own server and their own database, which is the isolation story that
 * sells this to a company whose tender archive is its competitive position. One app on the Play
 * Store therefore has to be told which server it belongs to, once, on the device.
 *
 * <p>Deliberately behind a link rather than a field on the sign-in form: the people using this today
 * should never see it, and a stray edit to a server address locks someone out of an app that was
 * working a second ago.
 */
export function TenantServerSheet({
  onClose,
  onChanged,
}: {
  onClose: () => void;
  onChanged: () => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const custom = hasCustomTenantServer();

  const connect = async () => {
    const target = resolveTenantServer(code);
    if (!target) {
      setError("Şirket kodunu girin.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      // Checked before it is stored: a typo saved as the server address means an app that cannot
      // sign in and cannot explain why, on a device the customer just installed it on.
      if (!(await probeTenantServer(target))) {
        setError("Bu adrese ulaşılamadı. Kodu kontrol edin.");
        return;
      }
      await setTenantServer(code);
      onChanged();
      onClose();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Sunucu ayarlanamadı.");
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await clearTenantServer();
      onChanged();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-black/70 flex items-end" onClick={onClose}>
      <div
        className="w-full bg-background rounded-t-2xl border-t border-white/10 p-5 space-y-4"
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center">
            <Building2 className="w-5 h-5 text-blue-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground">Şirket Sunucusu</p>
            <p className="text-xs text-muted-foreground truncate">{currentTenantServer()}</p>
          </div>
          <button onClick={onClose} className="p-2 text-muted-foreground active:scale-95" aria-label="Kapat">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          Şirketinizin size verdiği kodu girin. Tam adres de yazabilirsiniz.
        </p>

        <input
          value={code}
          onChange={event => setCode(event.target.value)}
          onKeyDown={event => { if (event.key === "Enter") void connect(); }}
          placeholder="Şirket kodu"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="w-full h-11 px-4 rounded-xl bg-black/30 border border-white/15 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-blue-400/50"
        />

        {code.trim() && (
          <p className="text-[11px] text-muted-foreground break-all">
            Bağlanılacak adres: {resolveTenantServer(code)}
          </p>
        )}

        {error && <p className="text-xs text-red-300">{error}</p>}

        <button
          onClick={() => void connect()}
          disabled={busy || !code.trim()}
          className="w-full h-11 rounded-xl bg-blue-500/25 text-blue-200 text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-40"
        >
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          Bağlan
        </button>

        {custom && (
          <button
            onClick={() => void reset()}
            disabled={busy}
            className="w-full h-10 rounded-xl bg-white/[0.04] text-muted-foreground text-xs font-medium flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Varsayılan sunucuya dön
          </button>
        )}

        <p className="text-[11px] text-muted-foreground">
          Sunucu değiştirildiğinde oturumunuz kapanır: bir şirketin girişi diğerinde geçerli değildir.
        </p>
      </div>
    </div>
  );
}
