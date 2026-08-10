import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ArrowLeft, Infinity as InfinityIcon, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";

import {
  createCompanyCredential,
  deleteCompanyCredential,
  getCompanyCredentials,
  type CompanyCredential,
} from "../api";

/**
 * "Şirket Belgelerim" — the company's own paperwork and the dates it runs out on.
 *
 * <p>Imza sirküleri, oda kayıt belgesi, borcu yoktur yazıları: every idare asks for them, they all
 * expire, and the day anyone checks is the day a bid is being assembled — by which point a two-week
 * renewal is two weeks too late. The list is sorted by how soon that happens, because that is the
 * only order in which it is useful.
 */

/** What a Turkish tender company is asked for again and again. Filling the form is most of the work. */
const COMMON = [
  "İmza Sirküleri",
  "Ticaret Sicil Gazetesi",
  "Oda Kayıt Belgesi",
  "SGK Borcu Yoktur Yazısı",
  "Vergi Borcu Yoktur Yazısı",
];

function urgency(credential: CompanyCredential) {
  const days = credential.days_remaining;
  if (days === null) return { tone: "none", label: "Süresiz" };
  if (days < 0) return { tone: "expired", label: `${Math.abs(days)} gün önce doldu` };
  if (days === 0) return { tone: "expired", label: "Bugün doluyor" };
  if (days <= 7) return { tone: "urgent", label: `${days} gün kaldı` };
  if (days <= 30) return { tone: "soon", label: `${days} gün kaldı` };
  return { tone: "ok", label: `${days} gün kaldı` };
}

const TONE_CLASSES: Record<string, string> = {
  expired: "bg-red-500/15 text-red-300 border-red-500/30",
  urgent: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  soon: "bg-amber-500/15 text-amber-200 border-amber-500/25",
  ok: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20",
  none: "bg-white/[0.04] text-muted-foreground border-white/10",
};

export function CompanyCredentialsPanel({ onClose }: { onClose: () => void }) {
  const [credentials, setCredentials] = useState<CompanyCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setCredentials(await getCompanyCredentials());
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Belgeler yüklenemedi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await createCompanyCredential({ name: name.trim(), valid_until: validUntil || null });
      setName("");
      setValidUntil("");
      setAdding(false);
      await load();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Belge kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (credential: CompanyCredential) => {
    if (!window.confirm(`"${credential.name}" kaydı silinsin mi?`)) return;
    try {
      await deleteCompanyCredential(credential.id);
      await load();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Belge silinemedi.");
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="px-4 pt-12 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 -ml-2 text-muted-foreground active:scale-95"
            aria-label="Geri">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5 text-emerald-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">Şirket Belgelerim</p>
            <p className="text-xs text-emerald-300/80 truncate">Geçerlilik süreleri ve hatırlatmalar</p>
          </div>
          <button
            onClick={() => setAdding(value => !value)}
            className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-200 flex items-center justify-center active:scale-95"
            aria-label="Belge ekle"
          >
            <Plus className={`w-5 h-5 transition-transform ${adding ? "rotate-45" : ""}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {adding && (
          <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3.5 space-y-3">
            <input
              value={name}
              onChange={event => setName(event.target.value)}
              placeholder="Belge adı"
              className="w-full h-11 px-3.5 rounded-xl bg-black/30 border border-white/15 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-emerald-400/50"
            />
            {/* Tapping a name beats typing it, and it doubles as a checklist of what a tender
                company is actually asked for. */}
            <div className="flex flex-wrap gap-1.5">
              {COMMON.map(common => (
                <button
                  key={common}
                  onClick={() => setName(common)}
                  className="px-2.5 py-1 rounded-lg bg-white/[0.05] text-[11px] text-muted-foreground active:scale-95"
                >
                  {common}
                </button>
              ))}
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Geçerlilik bitiş tarihi</label>
              <input
                type="date"
                value={validUntil}
                onChange={event => setValidUntil(event.target.value)}
                className="mt-1 w-full h-11 px-3.5 rounded-xl bg-black/30 border border-white/15 text-sm text-foreground focus:outline-none focus:border-emerald-400/50"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">
                Boş bırakılırsa süresiz sayılır, hatırlatma gönderilmez.
              </p>
            </div>
            <button
              onClick={() => void save()}
              disabled={!name.trim() || saving}
              className="w-full h-11 rounded-xl bg-emerald-500/25 text-emerald-200 text-sm font-semibold flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-40"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Kaydet
            </button>
          </div>
        )}

        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…
          </div>
        )}

        {!loading && credentials.length === 0 && !adding && (
          <div className="rounded-xl bg-white/[0.03] border border-white/10 px-4 py-6 text-center space-y-2">
            <ShieldCheck className="w-6 h-6 text-muted-foreground mx-auto" />
            <p className="text-sm text-foreground">Henüz belge eklenmemiş.</p>
            <p className="text-xs text-muted-foreground">
              İmza sirküleri, oda kayıt belgesi gibi süreli belgelerinizi ekleyin; süreleri
              dolmadan önce haber verelim.
            </p>
          </div>
        )}

        {credentials.map(credential => {
          const state = urgency(credential);
          return (
            <div key={credential.id} className="rounded-xl bg-white/[0.03] border border-white/10 p-3.5">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-foreground">{credential.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {credential.valid_until
                      ? `Bitiş: ${credential.valid_until}`
                      : "Geçerlilik tarihi girilmemiş"}
                  </p>
                </div>
                <button
                  onClick={() => void remove(credential)}
                  className="p-1.5 text-muted-foreground active:scale-95"
                  aria-label={`${credential.name} kaydını sil`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className={`mt-2.5 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-semibold ${TONE_CLASSES[state.tone]}`}>
                {state.tone === "expired" || state.tone === "urgent" ? (
                  <AlertTriangle className="w-3 h-3" />
                ) : state.tone === "none" ? (
                  <InfinityIcon className="w-3 h-3" />
                ) : null}
                {state.label}
              </div>
            </div>
          );
        })}
        <div className="h-4" />
      </div>
    </div>
  );
}
