import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";

import {
  createCompanyCredential, deleteCompanyCredential, getCompanyCredentials,
  type CompanyCredential,
} from "../api";

/**
 * "Şirket Belgeleri" — the company's own paperwork and the dates it runs out on.
 *
 * <p>İmza sirküleri, oda kayıt belgesi, borcu yoktur yazıları: every idare asks for them, they all
 * expire, and the day anyone checks is the day a bid is being assembled — by which point a two-week
 * renewal is two weeks too late. The list is sorted by how soon that happens, because that is the
 * only order in which it is useful.
 *
 * <p>On the web as well as the phone because this is where the paperwork is: the scans come off a
 * desk scanner and the dates are read off the documents themselves. The phone's copy is for the
 * person who gets the expiry warning while away from one.
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
  // Null is "no expiry", which is not urgency — it must never be sorted or coloured as if it were.
  if (days === null) return { tone: "none", label: "Süresiz" };
  if (days < 0) return { tone: "expired", label: `${Math.abs(days)} gün önce doldu` };
  if (days === 0) return { tone: "expired", label: "Bugün doluyor" };
  if (days <= 7) return { tone: "urgent", label: `${days} gün kaldı` };
  if (days <= 30) return { tone: "soon", label: `${days} gün kaldı` };
  return { tone: "ok", label: `${days} gün kaldı` };
}

const TONE_CLASSES: Record<string, string> = {
  expired: "bg-red-50 text-red-700 border-red-200",
  urgent: "bg-orange-50 text-orange-700 border-orange-200",
  soon: "bg-amber-50 text-amber-700 border-amber-200",
  ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
  none: "bg-slate-50 text-slate-500 border-slate-200",
};

export function CompanyCredentialsPage() {
  const [credentials, setCredentials] = useState<CompanyCredential[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!name.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await createCompanyCredential({ name: name.trim(), valid_until: validUntil || null });
      setName("");
      setValidUntil("");
      await load();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Belge kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (credential: CompanyCredential) => {
    if (!window.confirm(`"${credential.name}" kaydı silinsin mi?`)) return;
    setError("");
    try {
      await deleteCompanyCredential(credential.id);
      await load();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Belge silinemedi.");
    }
  };

  const expired = (credentials ?? []).filter(
    credential => credential.days_remaining !== null && credential.days_remaining < 0
  );

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-sky-100 text-sky-700 flex items-center justify-center">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-slate-900">Şirket Belgeleri</h1>
          <p className="text-sm text-slate-500">
            İdarenin kapıda istediği evraklar ve ne zaman dolduğu
          </p>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Above the list, because a lapsed document is not an item in a list — it is the reason a
          bid cannot be submitted, and it has to be readable without scrolling. */}
      {expired.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-700 shrink-0" />
          <p className="text-sm text-slate-900">
            <span className="font-semibold">
              {expired.length} belgenizin süresi dolmuş
            </span>{" "}
            — yenilenmeden teklif dosyası tamamlanamaz.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-border bg-white">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-xs font-medium text-slate-700 mb-2">Belge ekle</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <label htmlFor="credential-name" className="block text-xs text-slate-600 mb-1">
                Belgenin adı
              </label>
              <input
                id="credential-name"
                value={name}
                onChange={event => setName(event.target.value)}
                placeholder="örn. İmza Sirküleri"
                className="w-full h-9 px-3 rounded-lg border border-border text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-400"
              />
            </div>
            <div>
              <label htmlFor="credential-valid-until" className="block text-xs text-slate-600 mb-1">
                Geçerlilik bitişi
              </label>
              <input
                id="credential-valid-until"
                type="date"
                value={validUntil}
                onChange={event => setValidUntil(event.target.value)}
                className="h-9 px-3 rounded-lg border border-border text-sm text-slate-900 focus:outline-none focus:border-teal-400"
              />
            </div>
            <button
              onClick={() => void save()}
              disabled={!name.trim() || saving}
              className="h-9 px-4 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              {saving ? "Ekleniyor…" : "Ekle"}
            </button>
          </div>
          {/* Typing the same five names by hand is most of the work of this screen. */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {COMMON.map(common => (
              <button
                key={common}
                onClick={() => setName(common)}
                className="h-7 px-2.5 rounded-full border border-border text-xs text-slate-600 hover:border-teal-300 hover:text-teal-700 transition-colors"
              >
                {common}
              </button>
            ))}
          </div>
          {/* An expiry is optional: plenty of paperwork has none, and a required date field would
              be filled with a guess, which is worse than an empty one. */}
          <p className="text-[11px] text-slate-500 mt-3">
            Geçerlilik bitişi zorunlu değil. Boş bırakılan belge "süresiz" sayılır ve uyarı üretmez.
          </p>
        </div>

        {loading && (
          <div className="flex items-center gap-2 px-5 py-6 text-sm text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…
          </div>
        )}

        {!loading && credentials?.length === 0 && (
          <div className="px-5 py-8 text-center space-y-1">
            <ShieldCheck className="w-6 h-6 text-slate-400 mx-auto" />
            <p className="text-sm text-slate-900">Henüz kayıtlı belgeniz yok</p>
            <p className="text-xs text-slate-500">
              Yukarıdan ekleyin; süresi dolmadan önce haber verelim.
            </p>
          </div>
        )}

        {!loading && credentials && credentials.length > 0 && (
          <ul className="divide-y divide-border">
            {credentials.map(credential => {
              const state = urgency(credential);
              return (
                <li key={credential.id} className="px-5 py-3 flex items-center gap-3">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-slate-900 truncate">{credential.name}</span>
                    {credential.valid_until && (
                      <span className="block text-xs text-slate-500">
                        Bitiş: {credential.valid_until}
                      </span>
                    )}
                  </span>
                  <span
                    className={`px-2.5 py-1 rounded-full border text-xs shrink-0 ${TONE_CLASSES[state.tone]}`}
                  >
                    {state.label}
                  </span>
                  <button
                    onClick={() => void remove(credential)}
                    aria-label={`${credential.name} kaydını sil`}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
