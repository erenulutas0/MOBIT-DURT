import { ClipboardList, FileText, BookOpen, AlertTriangle, Download, Eye, Link } from "lucide-react";
import { Badge } from "../components/Badge";

// ─── TENDER DETAIL ────────────────────────────────────────────────────────────
export function TenderDetailPage() {
  return (
    <div className="p-6 flex gap-4">
      <div className="flex-1 space-y-4">
        <div className="bg-white border border-border rounded p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-foreground">BEDAS-2026-20260601-001</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Transformatör bakım ve onarım ihalesi</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="text-xs px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-border rounded flex items-center gap-1.5 text-muted-foreground transition-colors">
                <Download className="w-3.5 h-3.5" /> Tümünü İndir
              </button>
              <button className="text-xs px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded flex items-center gap-1.5 transition-colors">
                <BookOpen className="w-3.5 h-3.5" /> Obsidian'da Aç
              </button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 p-4 bg-slate-50 rounded border border-border">
            {[
              ["İhale Şirketi", "BEDAŞ"],
              ["Dahili Şube", "Mobit"],
              ["İhale ID", "BEDAS-2026-001"],
              ["Tarih", "1 Haz 2026"],
            ].map(([k, v], i) => (
              <div key={i}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{k}</p>
                <p className="text-xs font-semibold text-foreground mt-0.5">{v}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-border rounded">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-xs font-semibold">Belgeler (3)</h3>
          </div>
          <div className="divide-y divide-border">
            {[
              { name: "BEDAS-2026-001-teknik-sartname.pdf", size: "2.4 MB", date: "1 Haz 2026", type: "PDF" },
              { name: "BEDAS-2026-001-sozlesme-taslagi.pdf", size: "1.1 MB", date: "1 Haz 2026", type: "PDF" },
              { name: "BEDAS-2026-002-malzeme-listesi.xlsx", size: "340 KB", date: "11 Haz 2026", type: "XLSX" },
            ].map((d, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <FileText className="w-4 h-4 text-teal-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-mono font-medium text-foreground">{d.name}</p>
                  <p className="text-[10px] text-muted-foreground">{d.type} · {d.size} · {d.date}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button className="text-slate-400 hover:text-teal-600 transition-colors p-1"><Eye className="w-3.5 h-3.5" /></button>
                  <button className="text-slate-400 hover:text-teal-600 transition-colors p-1"><Download className="w-3.5 h-3.5" /></button>
                  <button className="text-slate-400 hover:text-teal-600 transition-colors p-1"><Link className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-border rounded">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-xs font-semibold">İlgili ERP Görevleri</h3>
          </div>
          <div className="divide-y divide-border">
            {[
              { title: "BEDAS transformatör bakım raporu hazırlama", assignee: "Mehmet Kaya", status: "Devam Ediyor" },
              { title: "Kablo malzeme listesi hazırlama", assignee: "Ayşe Demir", status: "Tamamlama Talep" },
            ].map((t, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <ClipboardList className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-foreground">{t.title}</p>
                  <p className="text-[10px] text-muted-foreground">{t.assignee}</p>
                </div>
                <Badge label={t.status} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="w-64 space-y-4 shrink-0">
        <div className="bg-amber-50 border border-amber-200 rounded p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <p className="text-xs font-semibold text-amber-700">Eksik Bilgiler</p>
          </div>
          <ul className="text-[10px] text-amber-600 space-y-1 list-disc list-inside">
            <li>Tahmini birim fiyat girilmedi</li>
            <li>Teknik gereksinimlerin tamamı yüklenmedi</li>
          </ul>
        </div>

        <div className="bg-white border border-border rounded">
          <div className="px-3 py-2.5 border-b border-border">
            <h3 className="text-xs font-semibold">Aktivite Zaman Çizelgesi</h3>
          </div>
          <div className="p-3 space-y-3">
            {[
              { text: "3. belge eklendi", time: "11 Haz" },
              { text: "ERP görevi oluşturuldu", time: "5 Haz" },
              { text: "İhale sınıflandırıldı", time: "1 Haz" },
              { text: "Telegram'dan alındı", time: "1 Haz" },
            ].map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-medium text-foreground">{a.text}</p>
                  <p className="text-[9px] text-muted-foreground">{a.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

