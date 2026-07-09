import { useState } from "react";
import { Send, ChevronRight, Search, Bot, MoreHorizontal, ChevronLeft, X, Plus } from "lucide-react";
import type { LiveData } from "../lib/types";
import { formatDateShort, relativeTime, documentsForTender } from "../lib/helpers";

// ─── TELEGRAM GROUPS ──────────────────────────────────────────────────────────
export function TelegramGroupsPage({ live }: { live: LiveData }) {
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState(1);
  const [branch, setBranch] = useState("");
  const branches = ["Mobit", "Stok Enerji", "Depart", "Area", "Mobiser"];
  const companies = Array.from(new Set(live.tenders.map((tender) => tender.organization).filter(Boolean))).sort();
  const telegramDocuments = live.documents.filter((document) => document.source === "telegram");
  const groups = Array.from(new Set(telegramDocuments.map((document) => document.tender_id))).map((tenderId) => {
    const docs = documentsForTender(tenderId, telegramDocuments);
    const tender = live.tenders.find((item) => item.tender_id === tenderId);
    const sortedDocs = [...docs].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const firstDoc = sortedDocs[sortedDocs.length - 1];
    const lastDoc = sortedDocs[0];
    return {
      name: tender?.title || tenderId,
      branch: tender?.internal_unit || docs.find((document) => document.internal_unit)?.internal_unit || "-",
      company: tender?.organization || docs.find((document) => document.organization)?.organization || "-",
      created: formatDateShort(tender?.created_at || firstDoc?.timestamp),
      docs: docs.length,
      lastDoc: relativeTime(lastDoc?.timestamp),
      bot: true,
    };
  });
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{groups.length} grup bağlı</p>
        <button
          onClick={() => { setShowModal(true); setStep(1); setBranch(""); }}
          className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Yeni Grup Ekle
        </button>
      </div>

      <div className="bg-white border border-border rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-border text-muted-foreground">
              <th className="text-left px-4 py-2.5 font-medium">Grup Adı</th>
              <th className="text-left px-4 py-2.5 font-medium">Şube</th>
              <th className="text-left px-4 py-2.5 font-medium">İhale Şirketi</th>
              <th className="text-left px-4 py-2.5 font-medium">Oluşturulma</th>
              <th className="text-center px-4 py-2.5 font-medium">Belge</th>
              <th className="text-left px-4 py-2.5 font-medium">Son Belge</th>
              <th className="text-left px-4 py-2.5 font-medium">Bot</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groups.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-xs text-muted-foreground">
                  Henüz Telegram kaynaklı grup/belge yok.
                </td>
              </tr>
            )}
            {groups.map((g, i) => (
              <tr key={i} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-teal-100 flex items-center justify-center shrink-0">
                      <Send className="w-3 h-3 text-teal-600" />
                    </div>
                    <span className="font-medium text-foreground">{g.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{g.branch}</td>
                <td className="px-4 py-3 text-muted-foreground">{g.company}</td>
                <td className="px-4 py-3 font-mono text-muted-foreground">{g.created}</td>
                <td className="px-4 py-3 text-center font-mono font-medium text-foreground">{g.docs}</td>
                <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{g.lastDoc}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${g.bot ? "bg-emerald-500" : "bg-red-400"}`} />
                    <span className="text-muted-foreground">{g.bot ? "Aktif" : "Kapalı"}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button className="text-slate-400 hover:text-slate-600"><MoreHorizontal className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded border border-border w-[480px] shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold">Yeni Telegram Grubu Ekle</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-5">
                {[1, 2].map(s => (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step >= s ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-400"}`}>{s}</div>
                    <span className={`text-xs ${step >= s ? "text-foreground font-medium" : "text-muted-foreground"}`}>{s === 1 ? "Şube Seç" : "İhale Şirketi Seç"}</span>
                    {s < 2 && <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
                  </div>
                ))}
              </div>

              {step === 1 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground mb-3">Dahili şube seçin:</p>
                  {branches.map(b => (
                    <button key={b} onClick={() => setBranch(b)}
                      className={`w-full text-left px-3 py-2.5 rounded border text-xs font-medium transition-colors ${branch === b ? "border-teal-500 bg-teal-50 text-teal-700" : "border-border hover:bg-slate-50 text-foreground"}`}>
                      {b}
                    </button>
                  ))}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 bg-slate-50 border border-border rounded px-2.5 py-1.5">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <input placeholder="İhale şirketi ara..." className="text-xs bg-transparent outline-none flex-1" />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {(companies.length ? companies : ["BEDAS", "AYEDAS", "TEDAS", "IGDAS", "IBB", "EPDK"]).map(c => (
                      <button key={c} className="w-full text-left px-3 py-2 rounded hover:bg-slate-50 text-xs text-foreground border border-transparent hover:border-border transition-colors">
                        {c}
                      </button>
                    ))}
                  </div>
                  <button className="flex items-center gap-1.5 text-xs text-teal-600 hover:underline">
                    <Plus className="w-3.5 h-3.5" /> Yeni şirket ekle
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-t border-border">
              <button onClick={() => step > 1 ? setStep(s => s - 1) : setShowModal(false)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <ChevronLeft className="w-3.5 h-3.5" /> {step > 1 ? "Geri" : "İptal"}
              </button>
              <button
                onClick={() => step < 2 ? (branch && setStep(2)) : setShowModal(false)}
                disabled={step === 1 && !branch}
                className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-xs font-medium rounded transition-colors"
              >
                {step < 2 ? "İleri" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

