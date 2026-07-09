import { Cpu, AlertTriangle, Plus, ExternalLink, FileSearch } from "lucide-react";
import { Badge } from "../components/Badge";

// ─── AI EXTRACTION ────────────────────────────────────────────────────────────
export function AIExtractionPage() {
  return (
    <div className="p-6 space-y-5">
      <div className="bg-violet-50 border border-violet-200 rounded px-4 py-3 flex items-center gap-3">
        <Cpu className="w-4 h-4 text-violet-500 shrink-0" />
        <p className="text-xs text-violet-700">Bu sayfa planlanan AI özelliklerini önizlemektedir. Bazı işlevler henüz aktif değildir.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <div className="bg-white border border-border rounded">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Çıkarılan Alanlar — BEDAS-2026-20260601-001</h3>
              <Badge label="Aktif" />
            </div>
            <div className="p-4 space-y-3">
              {[
                { field: "Tahmini Bedel", value: "₺4.850.000", confidence: 87, missing: false },
                { field: "İhale Tarihi", value: "15 Temmuz 2026", confidence: 96, missing: false },
                { field: "Son Teklif Tarihi", value: "10 Temmuz 2026", confidence: 91, missing: false },
                { field: "Teminat Mektubu", value: "%3 geçici teminat", confidence: 78, missing: false },
                { field: "Teknik Kapasite", value: "—", confidence: 0, missing: true },
                { field: "Adet / Miktar", value: "—", confidence: 0, missing: true },
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-36 shrink-0">
                    <p className="text-[10px] font-medium text-muted-foreground">{f.field}</p>
                  </div>
                  <div className="flex-1">
                    {f.missing ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Eksik</span>
                        <input placeholder="Manuel girin..." className="text-xs bg-red-50 border border-red-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-red-300 flex-1" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{f.value}</span>
                        <div className="flex items-center gap-1 ml-auto">
                          <div className="h-1.5 w-20 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${f.confidence}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground">%{f.confidence}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-border rounded">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-xs font-semibold">İhale Karşılaştırma</h3>
              <button className="text-xs text-teal-600 hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> İhale Ekle
              </button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="font-medium text-muted-foreground">Alan</div>
                <div className="font-medium text-foreground">BEDAS-2026-001</div>
                <div className="font-medium text-muted-foreground text-slate-400">Karşılaştırılacak ihale seç...</div>
                {[
                  ["Tahmini Bedel", "₺4.850.000", "—"],
                  ["İhale Tarihi", "15 Tem 2026", "—"],
                  ["Teminat", "%3", "—"],
                ].map(([k, v1, v2], i) => (
                  <>
                    <div key={`k${i}`} className="text-[10px] text-muted-foreground py-1.5 border-t border-border">{k}</div>
                    <div key={`v1${i}`} className="text-[10px] text-foreground py-1.5 border-t border-border font-medium">{v1}</div>
                    <div key={`v2${i}`} className="text-[10px] text-slate-400 py-1.5 border-t border-border">{v2}</div>
                  </>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-border rounded">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Belgeye Soru Sor</h3>
            </div>
            <div className="p-3 space-y-2">
              <textarea rows={3} placeholder="Örn: Teknik garantinin kapsamı nedir?" className="w-full text-xs bg-slate-50 border border-border rounded px-2.5 py-2 resize-none outline-none focus:ring-1 focus:ring-teal-400" />
              <button className="w-full bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium py-1.5 rounded transition-colors flex items-center justify-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" /> Soru Sor
              </button>
              <div className="bg-slate-50 border border-border rounded p-2.5 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Yanıt:</p>
                <p>Teknik garanti süresi, sözleşme imzalanmasından itibaren 24 ay olarak belirtilmiştir (Madde 7.3).</p>
                <p className="text-[10px] text-slate-400 mt-1">Kaynak: teknik-sartname.pdf, sayfa 12</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-border rounded">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Özet Rapor Oluştur</h3>
            </div>
            <div className="p-3 space-y-2">
              <button className="w-full bg-slate-50 hover:bg-slate-100 border border-border text-xs font-medium py-2 rounded transition-colors flex items-center justify-center gap-1.5 text-foreground">
                <FileSearch className="w-3.5 h-3.5 text-teal-600" /> Özet Oluştur
              </button>
              <button className="w-full bg-slate-50 hover:bg-slate-100 border border-border text-xs font-medium py-2 rounded transition-colors flex items-center justify-center gap-1.5 text-foreground">
                <ExternalLink className="w-3.5 h-3.5 text-teal-600" /> Word'e Aktar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
