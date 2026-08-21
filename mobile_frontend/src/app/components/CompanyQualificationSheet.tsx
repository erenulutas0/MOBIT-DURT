import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

import {
  getCompanyQualification, saveCompanyQualification, type CompanyQualification,
} from "../api";
import { formatTurkishNumber, parseTurkishNumber } from "../utils/turkishNumber";

/**
 * The company's own yeterlik figures — entered once, instead of remembered by whoever is preparing
 * the file at midnight.
 *
 * <p>Everything is optional and nothing is pre-filled with a zero. A blank field means "not entered"
 * and the checklist says so; a zero would mean "we have none", which is a different and usually
 * false statement. That distinction is the whole reason this screen refuses to be helpful with
 * defaults.
 */

type Field = {
  key: keyof CompanyQualification;
  label: string;
  hint?: string;
  kind: "money" | "ratio" | "date" | "text";
};

const FIELDS: Field[] = [
  {
    key: "experience_amount", kind: "money", label: "İş deneyim belgesi tutarı",
    hint: "En güçlü belgeniz — ihalede sunacağınız olan.",
  },
  { key: "experience_date", kind: "date", label: "Belgenin tarihi",
    hint: "Yapımda son 15, hizmette son 5 yıl içinde olmalı." },
  { key: "experience_subject", kind: "text", label: "İşin konusu" },
  { key: "turnover_last_year", kind: "money", label: "Son yıl cirosu" },
  { key: "turnover_previous_year", kind: "money", label: "Önceki yıl cirosu",
    hint: "Son yıl yetmezse ikisinin ortalaması kullanılabilir." },
  { key: "sector_turnover", kind: "money", label: "İş kolunuza ait ciro" },
  { key: "current_ratio", kind: "ratio", label: "Cari oran" },
  { key: "equity_ratio", kind: "ratio", label: "Öz kaynak oranı" },
  { key: "bank_debt_ratio", kind: "ratio", label: "Kısa vadeli banka borcu / öz kaynak" },
  { key: "bank_reference_limit", kind: "money", label: "Banka referans limiti" },
];

export function CompanyQualificationSheet({ onClose, onSaved }: {
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void getCompanyQualification()
      .then(current => {
        if (cancelled) return;
        const next: Record<string, string> = {};
        for (const field of FIELDS) {
          const raw = current[field.key];
          // Written in the same Turkish format the box is read back in. Writing the server's own
          // "0.85" here instead is what turned an untouched cari oran into 85 on the next save.
          next[field.key] = field.kind === "money" || field.kind === "ratio"
            ? formatTurkishNumber(raw)
            : (raw === null || raw === undefined ? "" : String(raw));
        }
        setValues(next);
      })
      .catch(exception => {
        if (!cancelled) {
          setError(exception instanceof Error ? exception.message : "Bilgiler alınamadı.");
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      await saveCompanyQualification({
        experience_amount: parseTurkishNumber(values.experience_amount || ""),
        experience_date: values.experience_date?.trim() || null,
        experience_subject: values.experience_subject?.trim() || null,
        turnover_last_year: parseTurkishNumber(values.turnover_last_year || ""),
        turnover_previous_year: parseTurkishNumber(values.turnover_previous_year || ""),
        sector_turnover: parseTurkishNumber(values.sector_turnover || ""),
        current_ratio: parseTurkishNumber(values.current_ratio || ""),
        equity_ratio: parseTurkishNumber(values.equity_ratio || ""),
        bank_debt_ratio: parseTurkishNumber(values.bank_debt_ratio || ""),
        bank_reference_limit: parseTurkishNumber(values.bank_reference_limit || ""),
      });
      onSaved?.();
      onClose();
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-background flex flex-col">
      <div className="px-4 pt-12 pb-3 border-b border-border flex items-start gap-3">
        <button onClick={onClose} className="p-2 -ml-2 text-muted-foreground active:scale-95"
          aria-label="Kapat">
          <X className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-foreground">Yeterlik bilgileriniz</p>
          <p className="text-xs text-muted-foreground">
            İhalelerde sizden istenen rakamlar — bir kez girin
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Yükleniyor…
          </div>
        ) : (
          <>
            {/* Said before the first field, because the temptation is to type a zero into anything
                you do not know — and a zero is a claim, while a blank is not. */}
            <p className="text-[11px] text-muted-foreground leading-relaxed px-0.5">
              Bilmediğiniz alanı boş bırakın. Boş alan "girilmedi" demektir; sıfır yazmak
              "hiç yok" demektir ve kontrol listesi ikisini farklı okur.
            </p>
            {FIELDS.map(field => (
              <div key={field.key}>
                <label className="block text-xs text-foreground mb-1">{field.label}</label>
                <input
                  value={values[field.key] ?? ""}
                  onChange={event =>
                    setValues(current => ({ ...current, [field.key]: event.target.value }))}
                  type={field.kind === "date" ? "date" : "text"}
                  inputMode={field.kind === "money" || field.kind === "ratio" ? "decimal" : undefined}
                  placeholder={field.kind === "money" ? "örn. 6.200.000"
                    : field.kind === "ratio" ? "örn. 0,85" : ""}
                  className="w-full h-10 px-3 rounded-xl bg-black/30 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
                />
                {field.hint && (
                  <p className="text-[11px] text-muted-foreground mt-1">{field.hint}</p>
                )}
              </div>
            ))}
            <button
              onClick={() => void save()}
              disabled={saving}
              className="w-full h-11 rounded-xl bg-primary text-white text-sm font-semibold active:scale-95 disabled:opacity-40"
            >
              {saving ? "Kaydediliyor…" : "Kaydet"}
            </button>
            <div className="h-4" />
          </>
        )}
      </div>
    </div>
  );
}
