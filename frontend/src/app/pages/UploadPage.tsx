import { useMemo, useRef, useState } from "react";
import { Upload, Search, Loader2 } from "lucide-react";
import {
  formatBytes,
  uploadTenderDocument,
} from "../api";
import type { LiveData } from "../lib/types";

// ─── UPLOAD ───────────────────────────────────────────────────────────────────
export function UploadPage({ live }: { live: LiveData }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [branch, setBranch] = useState("");
  const [organization, setOrganization] = useState("");
  const [year, setYear] = useState(new Date().getFullYear());
  const [tenderId, setTenderId] = useState("");
  const [caption, setCaption] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const branches = [
    { value: "MOBIT", label: "Mobit" },
    { value: "STOK_ENERJI", label: "Stok Enerji" },
    { value: "DEPART", label: "Depart" },
    { value: "AREA", label: "Area" },
    { value: "MOBISER", label: "Mobiser" },
  ];
  const organizations = useMemo(
    () => [...new Set([
      ...live.tenders.map((tender) => tender.organization),
      ...live.documents.map((document) => document.organization).filter(Boolean) as string[],
    ])].sort(),
    [live.tenders, live.documents],
  );
  const matchingTenders = useMemo(
    () => live.tenders.filter((tender) =>
      (!branch || tender.internal_unit === branch)
      && (!organization || tender.organization === organization.trim().toUpperCase())
      && tender.year === year),
    [live.tenders, branch, organization, year],
  );

  function chooseFile(selected: File | null) {
    setError("");
    setSuccess("");
    setFile(selected);
  }

  async function submitUpload() {
    if (!file || !branch || !organization.trim()) {
      setError("Dosya, dahili şube ve ihale şirketi zorunludur.");
      return;
    }
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const uploaded = await uploadTenderDocument(file, {
        internal_unit: branch,
        organization: organization.trim(),
        year,
        tender_id: tenderId || undefined,
        caption: caption.trim() || undefined,
      });
      setSuccess(`${uploaded.stored_filename || uploaded.original_filename} kaydedildi. İhale: ${uploaded.tender_id}`);
      setFile(null);
      setCaption("");
      setTenderId(uploaded.tender_id);
      if (fileInput.current) fileInput.current.value = "";
      await live.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Belge yüklenemedi.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-5">
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>}
      {success && <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{success}</div>}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault();
          setDragging(false);
          chooseFile(e.dataTransfer.files.item(0));
        }}
        className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${dragging ? "border-teal-400 bg-teal-50" : "border-slate-200 bg-white hover:border-teal-300"}`}
      >
        <Upload className={`w-8 h-8 mx-auto mb-3 ${dragging ? "text-teal-500" : "text-slate-300"}`} />
        <p className="text-sm font-medium text-foreground">{file ? file.name : "Belgeyi buraya sürükleyin"}</p>
        {file && <p className="mt-1 text-[10px] text-teal-700">{formatBytes(file.size)}</p>}
        <p className="text-xs text-muted-foreground mt-1">veya</p>
        <input
          ref={fileInput}
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={event => chooseFile(event.target.files?.item(0) || null)}
        />
        <button type="button" onClick={() => fileInput.current?.click()} className="mt-3 px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded transition-colors">
          Dosya Seç
        </button>
        <p className="text-[10px] text-muted-foreground mt-3">PDF, Office, metin ve görsel dosyaları · Maks. 25 MB</p>
      </div>

      <div className="bg-white border border-border rounded p-4 space-y-4">
        <h3 className="text-xs font-semibold text-foreground">Sınıflandırma Bilgileri</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Dahili Şube *</label>
            <select value={branch} onChange={e => setBranch(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-border rounded px-2.5 py-2 outline-none focus:ring-1 focus:ring-teal-400">
              <option value="">Şube seçin...</option>
              {branches.map(b => <option key={b.value} value={b.value}>{b.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">İhale Şirketi *</label>
            <div className="flex items-center gap-1.5 bg-slate-50 border border-border rounded px-2.5 py-2">
              <Search className="w-3 h-3 text-slate-400 shrink-0" />
              <input
                list="tender-upload-organizations"
                value={organization}
                onChange={e => {
                  setOrganization(e.target.value);
                  setTenderId("");
                }}
                placeholder="Şirket ara veya yaz..."
                className="text-xs bg-transparent outline-none flex-1"
              />
              <datalist id="tender-upload-organizations">
                {organizations.map(value => <option key={value} value={value} />)}
              </datalist>
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Yıl *</label>
            <input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={e => {
                setYear(Number(e.target.value));
                setTenderId("");
              }}
              className="w-full text-xs font-mono bg-slate-50 border border-border rounded px-2.5 py-2 outline-none focus:ring-1 focus:ring-teal-400"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Mevcut İhale</label>
            <select
              value={tenderId}
              onChange={e => setTenderId(e.target.value)}
              className="w-full text-xs font-mono bg-slate-50 border border-border rounded px-2.5 py-2 outline-none focus:ring-1 focus:ring-teal-400"
            >
              <option value="">Yeni ihale oluştur</option>
              {matchingTenders.map(tender => <option key={tender.tender_id} value={tender.tender_id}>{tender.tender_id}</option>)}
            </select>
          </div>
          <div className="col-span-2">
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Notlar</label>
            <input value={caption} onChange={e => setCaption(e.target.value)} placeholder="İsteğe bağlı açıklama..." className="w-full text-xs bg-slate-50 border border-border rounded px-2.5 py-2 outline-none focus:ring-1 focus:ring-teal-400" />
          </div>
        </div>
        <div className="pt-2 flex items-center gap-3">
          <button disabled={saving} onClick={submitUpload} className="px-5 py-2 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors flex items-center gap-1.5">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Yükle ve Sınıflandır
          </button>
          <button onClick={() => {
            chooseFile(null);
            setCaption("");
            if (fileInput.current) fileInput.current.value = "";
          }} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-xs font-medium rounded text-slate-600 transition-colors">Temizle</button>
        </div>
      </div>
    </div>
  );
}

