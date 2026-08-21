import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, Trophy } from "lucide-react";

import {
  getCompanyQualification, saveCompanyQualification, type CompanyQualification,
} from "../api";
import { formatTurkishNumber, parseTurkishNumber } from "../lib/turkishNumber";

/**
 * "Yeterlik Bilgileriniz" — the figures an idare asks a company to prove, entered once instead of
 * remembered by whoever is preparing the file at midnight.
 *
 * <p>On the web rather than only on the phone because of where the numbers come from. Cari oran and
 * öz kaynak oranı are read off a balance sheet and the iş deneyim belgesi is a document on a desk;
 * this is a sit-down job with paperwork open, and asking for it on a phone keyboard is how it stays
 * un-entered — which leaves the yeterlik checklist answering "bilinmiyor" on every tender and
 * looking broken rather than uninformed.
 *
 * <p>Everything is optional and nothing is pre-filled with a zero. A blank field means "not
 * entered"; a zero means "we have none", which is a different and usually false statement. That
 * distinction is the whole reason this screen refuses to be helpful with defaults.
 */

type Field = {
  key: keyof CompanyQualification;
  label: string;
  hint?: string;
  kind: "money" | "ratio" | "date" | "text";
};

/** The same order and wording as the phone's sheet: one set of figures, one way to talk about it. */
const FIELDS: Field[] = [
  {
    key: "experience_amount", kind: "money", label: "İş deneyim belgesi tutarı",
    hint: "En güçlü belgeniz — ihalede sunacağınız olan.",
  },
  {
    key: "experience_date", kind: "date", label: "Belgenin tarihi",
    hint: "Yapımda son 15, hizmette son 5 yıl içinde olmalı.",
  },
  { key: "experience_subject", kind: "text", label: "İşin konusu" },
  { key: "turnover_last_year", kind: "money", label: "Son yıl cirosu" },
  {
    key: "turnover_previous_year", kind: "money", label: "Önceki yıl cirosu",
    hint: "Son yıl yetmezse ikisinin ortalaması kullanılabilir.",
  },
  { key: "sector_turnover", kind: "money", label: "İş kolunuza ait ciro" },
  { key: "current_ratio", kind: "ratio", label: "Cari oran" },
  { key: "equity_ratio", kind: "ratio", label: "Öz kaynak oranı" },
  { key: "bank_debt_ratio", kind: "ratio", label: "Kısa vadeli banka borcu / öz kaynak" },
  { key: "bank_reference_limit", kind: "money", label: "Banka referans limiti" },
];

function updatedLine(value: CompanyQualification | null): string {
  if (!value?.updated_at) return "Henüz girilmedi";
  const date = new Date(value.updated_at);
  const when = Number.isNaN(date.getTime())
    ? value.updated_at
    : date.toLocaleDateString("tr-TR", { day: "numeric", month: "long", year: "numeric" });
  return value.updated_by ? `Son güncelleme: ${when} · ${value.updated_by}` : `Son güncelleme: ${when}`;
}

export function CompanyQualificationPage() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState<CompanyQualification | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const record = await getCompanyQualification();
      const next: Record<string, string> = {};
      for (const field of FIELDS) {
        const raw = record[field.key];
        // Written in the same Turkish format the box is read back in. Writing the server's own
        // "0.85" here instead is what turned an untouched cari oran into 85 on the next save.
        next[field.key] = field.kind === "money" || field.kind === "ratio"
          ? formatTurkishNumber(raw)
          : (raw === null || raw === undefined ? "" : String(raw));
      }
      setValues(next);
      setCurrent(record);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Bilgiler alınamadı.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const record = await saveCompanyQualification({
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
      setCurrent(record);
      setSaved(true);
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Kaydedilemedi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start gap-3">
        <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
          <Trophy className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-slate-900">Yeterlik Bilgileriniz</h1>
          <p className="text-sm text-slate-500">
            İhalelerde sizden istenen rakamlar — bir kez girin, her ihalede girebilir misiniz
            söyleyelim
          </p>
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" /> Yükleniyor…
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-3">
          <span className="flex-1">{error}</span>
          {!current && (
            <button
              onClick={() => void load()}
              className="h-8 px-3 rounded-lg border border-red-300 text-xs font-medium text-red-700 hover:bg-red-100 transition-colors"
            >
              Tekrar dene
            </button>
          )}
        </div>
      )}

      {/* The form appears only once the current figures are in hand. Rendering it on a failed load
          would put a Kaydet button above ten blank fields, and pressing it would overwrite whatever
          the company had already entered with nulls. */}
      {!loading && current && (
        <>
          {/* Said before the first field, because the temptation is to type a zero into anything
              you do not know — and a zero is a claim, while a blank is not. */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Bilmediğiniz alanı boş bırakın. Boş alan "girilmedi" demektir; sıfır yazmak
            "hiç yok" demektir ve kontrol listesi ikisini farklı okur.
          </div>

          <div className="rounded-xl border border-border bg-white">
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 p-5">
              {FIELDS.map(field => (
                <div key={field.key}>
                  <label
                    htmlFor={`qualification-${field.key}`}
                    className="block text-xs font-medium text-slate-700 mb-1"
                  >
                    {field.label}
                  </label>
                  <input
                    id={`qualification-${field.key}`}
                    value={values[field.key] ?? ""}
                    onChange={event => {
                      setSaved(false);
                      setValues(state => ({ ...state, [field.key]: event.target.value }));
                    }}
                    type={field.kind === "date" ? "date" : "text"}
                    inputMode={
                      field.kind === "money" || field.kind === "ratio" ? "decimal" : undefined
                    }
                    placeholder={
                      field.kind === "money" ? "örn. 6.200.000"
                        : field.kind === "ratio" ? "örn. 0,85" : ""
                    }
                    className="w-full h-9 px-3 rounded-lg border border-border text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-teal-400"
                  />
                  {field.hint && <p className="text-[11px] text-slate-500 mt-1">{field.hint}</p>}
                </div>
              ))}
            </div>

            <div className="border-t border-border px-5 py-3 flex items-center gap-3">
              <button
                onClick={() => void save()}
                disabled={saving}
                className="h-9 px-4 rounded-lg bg-teal-600 text-white text-sm font-medium hover:bg-teal-700 disabled:opacity-60 transition-colors"
              >
                {saving ? "Kaydediliyor…" : "Kaydet"}
              </button>
              {/* Cleared the moment a field changes, so it can never sit next to unsaved edits. */}
              {saved && (
                <span className="flex items-center gap-1.5 text-sm text-emerald-700">
                  <Check className="w-4 h-4" /> Kaydedildi
                </span>
              )}
              <span className="ml-auto text-xs text-slate-500">{updatedLine(current)}</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
