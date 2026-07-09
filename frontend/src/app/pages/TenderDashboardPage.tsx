import { FileText, Send, FolderOpen, Upload, BookOpen, ChevronRight, Bot, AlertTriangle, TrendingUp, Package } from "lucide-react";
import {
  displayStatus,
} from "../api";
import type { Page, LiveData } from "../lib/types";
import { Badge } from "../components/Badge";
import { KPICard } from "../components/KPICard";

// ─── TENDER DASHBOARD ─────────────────────────────────────────────────────────
export function TenderDashboardPage({ setPage, live }: { setPage: (p: Page) => void; live: LiveData }) {
  const docs = live.documents;
  const today = new Date().toLocaleDateString("tr-TR");
  const todayDocs = docs.filter((doc) => new Date(doc.timestamp).toLocaleDateString("tr-TR") === today);
  const unclassified = docs.filter((doc) => doc.document_type === "unknown" || displayStatus(doc.status) === "unclassified");
  const telegramGroups = new Set(docs.filter((doc) => doc.source === "telegram").map((doc) => doc.tender_id));
  const recentDocs = docs.slice(0, 5);
  const groupRows = Array.from(telegramGroups).slice(0, 5).map((tenderId) => {
    const groupDocs = docs.filter((doc) => doc.tender_id === tenderId);
    const first = groupDocs[0];
    return {
      name: tenderId,
      branch: first?.internal_unit || "-",
      docs: groupDocs.length,
      bot: true,
    };
  });
  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: "Toplam İhale", value: live.tenders.length, icon: Package, color: "bg-slate-50" },
          { label: "Toplam Belge", value: docs.length, icon: FileText, color: "bg-teal-50" },
          { label: "Bugün Alınan", value: todayDocs.length, icon: TrendingUp, color: "bg-blue-50" },
          { label: "Sınıflandırılmamış", value: unclassified.length, icon: AlertTriangle, color: "bg-amber-50" },
          { label: "Telegram Grubu", value: telegramGroups.size, icon: Send, color: "bg-violet-50" },
          { label: "Obsidian Notu", value: live.vaultNotes.length, icon: BookOpen, color: "bg-emerald-50" },
        ].map((k, i) => <KPICard key={i} label={k.label} value={k.value} icon={k.icon} color={k.color} />)}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white border border-border rounded">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-xs font-semibold">Son Yüklenen Belgeler</h3>
            <button onClick={() => setPage("documents")} className="text-xs text-teal-600 hover:underline flex items-center gap-1">Tümü <ChevronRight className="w-3 h-3" /></button>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-border text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">Dosya Adı</th>
                <th className="text-left px-4 py-2 font-medium">İhale Şirketi</th>
                <th className="text-left px-4 py-2 font-medium">Şube</th>
                <th className="text-left px-4 py-2 font-medium">Tarih</th>
                <th className="text-left px-4 py-2 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {recentDocs.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Canlı veride belge yok.</td></tr>
              ) : recentDocs.map((d) => (
                <tr key={d.id} className="hover:bg-slate-50 transition-colors cursor-pointer">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                      <span className="font-mono text-[11px] text-foreground truncate max-w-[200px]">{d.stored_filename || d.original_filename || `Belge #${d.id}`}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{d.organization || "-"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{d.internal_unit || "-"}</td>
                  <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{new Date(d.timestamp).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="px-4 py-2.5"><Badge label={displayStatus(d.status) === "classified" ? "Sınıflandırıldı" : "Sınıflandırılmamış"} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-border rounded">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Aktif Telegram Grupları</h3>
            </div>
            <div className="divide-y divide-border">
              {groupRows.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">Telegram kaynaklı belge yok.</div>
              ) : groupRows.map((g) => (
                <div key={g.name} className="flex items-center gap-2.5 px-4 py-2.5">
                  <div className="w-6 h-6 rounded bg-teal-100 flex items-center justify-center shrink-0">
                    <Send className="w-3 h-3 text-teal-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{g.name}</p>
                    <p className="text-[10px] text-muted-foreground">{g.branch} · {g.docs} belge</p>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${g.bot ? "bg-emerald-500" : "bg-red-400"}`} title={g.bot ? "Bot aktif" : "Bot kapalı"} />
                </div>
              ))}
            </div>
            <div className="p-3">
              <button onClick={() => setPage("telegram-groups")} className="w-full text-xs text-teal-600 hover:underline">Grupları Yönet</button>
            </div>
          </div>

          <div className="bg-white border border-border rounded">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Hızlı İşlemler</h3>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
              {[
                { label: "Klasör Ağacı", icon: FolderOpen, page: "folder-tree" as Page },
                { label: "Belge Yükle", icon: Upload, page: "upload" as Page },
                { label: "Obsidian Demo", icon: BookOpen, page: "obsidian" as Page },
                { label: "Grupları Gör", icon: Send, page: "telegram-groups" as Page },
              ].map((a, i) => (
                <button key={i} onClick={() => setPage(a.page)}
                  className="flex flex-col items-center gap-1.5 p-2.5 bg-slate-50 hover:bg-slate-100 rounded border border-border transition-colors">
                  <a.icon className="w-4 h-4 text-teal-600" />
                  <span className="text-[10px] font-medium text-foreground">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

