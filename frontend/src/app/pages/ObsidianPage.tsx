import { useEffect, useMemo, useState } from "react";
import { FileText, Cpu, ChevronRight, ChevronDown, Search, Download, Eye, Link, GitBranch } from "lucide-react";
import {
  ApiDocument,
  formatBytes,
  getTenderDocumentBlob,
  getVaultNote,
  openBlob,
} from "../api";
import type { LiveData } from "../lib/types";
import { formatDateShort, documentsForTender } from "../lib/helpers";
import { buildKnowledgeGraphData } from "../lib/knowledgeGraph";
import { KnowledgeGraphPanel } from "../components/KnowledgeGraphPanel";

// ─── OBSIDIAN DEMO ────────────────────────────────────────────────────────────
export function ObsidianPage({ live }: { live: LiveData }) {
  const firstNote = live.vaultNotes[0];
  const [activeNote, setActiveNote] = useState(firstNote?.path || "");
  const [noteContent, setNoteContent] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ "2026": true, "MOBIT": true });
  const toggle = (k: string) => setExpanded(p => ({ ...p, [k]: !p[k] }));
  const selectedNote = live.vaultNotes.find((note) => note.path === activeNote) || firstNote;
  const selectedTenderId = selectedNote?.name.replace(/\.md$/i, "") || live.tenders[0]?.tender_id || "Henüz not yok";
  const selectedTender = live.tenders.find((tender) => selectedTenderId.includes(tender.tender_id)) || live.tenders[0];
  const relatedDocuments = selectedTender ? documentsForTender(selectedTender.tender_id, live.documents) : live.documents.slice(0, 5);
  const noteTags = selectedNote?.tags?.length ? selectedNote.tags : [selectedTender?.organization, selectedTender?.year?.toString(), selectedTender?.internal_unit].filter(Boolean) as string[];
  const linkedNoteNames = useMemo(() => {
    const names = Array.from(noteContent.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g))
      .map((match) => match[1].trim())
      .filter(Boolean);
    return Array.from(new Set(names)).slice(0, 10);
  }, [noteContent]);

  useEffect(() => {
    if (!selectedNote) {
      setNoteContent("");
      return;
    }
    getVaultNote(selectedNote.path)
      .then((note) => setNoteContent(note.content))
      .catch(() => setNoteContent(""));
  }, [selectedNote?.path]);

  async function openTenderDocument(document: ApiDocument) {
    const blob = await getTenderDocumentBlob(document.id, false);
    openBlob(blob);
  }

  const graphData = useMemo(
    () => buildKnowledgeGraphData({
      documents: live.documents,
      tenders: live.tenders,
      vaultNotes: live.vaultNotes,
      documentGroups: [],
    }),
    [live.documents, live.tenders, live.vaultNotes]
  );
  return (
    <div className="flex h-[calc(100vh-48px)] bg-[#1e1e2e] text-slate-200 font-mono text-xs">
      {/* Left: Vault Tree */}
      <aside className="w-56 border-r border-white/5 flex flex-col shrink-0 bg-[#181825]">
        <div className="px-3 py-2 border-b border-white/5">
          <div className="flex items-center gap-1.5 bg-white/5 rounded px-2 py-1">
            <Search className="w-3 h-3 text-slate-500" />
            <input placeholder="⌘K arama..." className="bg-transparent outline-none text-[10px] text-slate-400 flex-1 placeholder:text-slate-600" />
          </div>
        </div>
        <div className="px-2 py-1 border-b border-white/5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 px-1 py-1">VAULT: DocsBot</p>
        </div>
        <div className="flex-1 overflow-y-auto p-1 scrollbar-hide">
          {live.vaultNotes.length === 0 && <div className="px-2 py-3 text-[10px] text-slate-500">Henüz Obsidian notu yok.</div>}
          {[
            { key: "2026", label: "📅 2026", depth: 0, has: true },
            ...live.vaultNotes.map((note) => ({ key: note.path, label: note.name.replace(/\.md$/i, ""), depth: 1, has: false, par: "2026" })),
          ].filter(item => !item.par || expanded[item.par]).map((item, i) => (
            <div key={i}
              style={{ paddingLeft: item.depth * 12 + 4 }}
              onClick={() => !item.has && setActiveNote(item.key)}
              className={`flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer transition-colors text-[10px] ${item.key === activeNote ? "bg-teal-600/20 text-teal-400" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"}`}
            >
              {item.has ? (
                <button onClick={e => { e.stopPropagation(); toggle(item.key); }}>
                  {expanded[item.key] ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                </button>
              ) : <div className="w-2.5" />}
              <span className="truncate">{item.label}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* Center: Note Editor */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-[#1e1e2e]">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span>vault</span><ChevronRight className="w-2.5 h-2.5" /><span className="text-teal-400">{selectedNote?.name || selectedTenderId}</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="text-[10px] px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-slate-400 transition-colors flex items-center gap-1">
              <Download className="w-2.5 h-2.5" /> İndir
            </button>
            <button className="text-[10px] px-2 py-1 bg-teal-600/20 hover:bg-teal-600/30 rounded text-teal-400 transition-colors flex items-center gap-1">
              <Link className="w-2.5 h-2.5" /> ERP Görevine Ekle
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          {/* YAML Frontmatter */}
          <div className="bg-[#181825] border border-white/10 rounded mb-5 overflow-hidden">
            <div className="px-3 py-1.5 bg-white/5 border-b border-white/5">
              <span className="text-[9px] text-slate-600 uppercase tracking-widest">YAML Frontmatter</span>
            </div>
            <pre className="text-[11px] text-slate-400 p-4 leading-relaxed overflow-auto">
{`---
ihale_id: ${selectedTender?.tender_id || selectedTenderId}
ihale_sirketi: ${selectedTender?.organization || "-"}
dahili_sube: ${selectedTender?.internal_unit || "-"}
yil: ${selectedTender?.year || "-"}
tarih: ${selectedTender ? formatDateShort(selectedTender.created_at) : "-"}
belge_sayisi: ${relatedDocuments.length}
durum: ${selectedTender?.status || "unknown"}
etiketler: [${noteTags.join(", ")}]
---`}
            </pre>
          </div>

          {/* Note Content */}
          <div className="space-y-4">
            <h1 className="text-lg font-bold text-slate-100">{selectedNote?.name?.replace(/\.md$/i, "") || selectedTenderId}</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              Bu görünüm gerçek Obsidian vault notlarından ve Tender Hub belgelerinden beslenir.{" "}
              <span className="text-teal-400 cursor-pointer hover:underline">[[{selectedTender?.organization || "ihale"}]]</span>{" "}
              kayıtları ile ilişkili dosyalar aşağıda listelenir.
            </p>

            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-300 border-b border-white/10 pb-1">Belgeler</h2>
              {relatedDocuments.length === 0 && <div className="text-[11px] text-slate-500">Bu nota bağlı belge bulunamadı.</div>}
              {relatedDocuments.map((d, i) => (
                <div key={i} onClick={() => openTenderDocument(d)} className="flex items-center gap-2.5 bg-white/5 rounded px-3 py-2 hover:bg-white/8 cursor-pointer transition-colors">
                  <FileText className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <span className="text-slate-300 flex-1">{d.original_filename || d.stored_filename || `Belge #${d.id}`}</span>
                  <span className="text-slate-600 text-[10px]">{formatBytes(d.file_size)}</span>
                  <span className="text-slate-600 text-[10px]">{formatDateShort(d.timestamp)}</span>
                  <Eye className="w-3 h-3 text-slate-600 hover:text-teal-400" />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-300 border-b border-white/10 pb-1">Bağlantılı Notlar</h2>
              <div className="flex flex-wrap gap-2">
                {linkedNoteNames.length === 0 && <span className="text-[11px] text-slate-500">Bağlantılı not bulunamadı.</span>}
                {linkedNoteNames.map((name) => `[[${name}]]`).map((l, i) => (
                  <span key={i} className="text-teal-400 hover:text-teal-300 cursor-pointer text-[11px] hover:underline">{l}</span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-300 border-b border-white/10 pb-1">Etiketler</h2>
              <div className="flex flex-wrap gap-1.5">
                {noteTags.map((t, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-600/20 text-violet-400 border border-violet-600/20"># {t}</span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-300 border-b border-white/10 pb-1">Markdown İçeriği</h2>
              <pre className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-xs text-slate-300 whitespace-pre-wrap break-words min-h-20">
                {noteContent || "Seçili notta içerik bulunamadı."}
              </pre>
            </div>
          </div>
        </div>
        {/* Bottom toolbar */}
        <div className="border-t border-white/5 px-4 py-2 flex items-center gap-3 bg-[#181825]">
          <button className="text-[10px] px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-slate-400 flex items-center gap-1 transition-colors">
            <Eye className="w-2.5 h-2.5" /> Belge Önizle
          </button>
          <button className="text-[10px] px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-slate-400 flex items-center gap-1 transition-colors">
            <Download className="w-2.5 h-2.5" /> Tümünü İndir
          </button>
          <button className="text-[10px] px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-slate-400 flex items-center gap-1 transition-colors">
            <GitBranch className="w-2.5 h-2.5" /> Karşılaştır
          </button>
          <button className="text-[10px] px-2 py-1 bg-teal-600/20 hover:bg-teal-600/30 rounded text-teal-400 flex items-center gap-1 transition-colors">
            <Cpu className="w-2.5 h-2.5" /> Özet Oluştur
          </button>
        </div>
      </main>

      {/* Right: Graph + Metadata */}
      <aside className="w-60 border-l border-white/5 flex flex-col bg-[#181825] shrink-0">
        <div className="px-3 py-2 border-b border-white/5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Graf Görünümü</p>
        </div>
        <div className="bg-[#13131f] m-2 rounded border border-white/5 overflow-hidden">
          <KnowledgeGraphPanel graphData={graphData} />
        </div>

        <div className="px-3 py-2 border-b border-white/5 border-t border-white/5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Bağlantılı Notlar ({linkedNoteNames.length})</p>
        </div>
        <div className="px-2 py-1 space-y-0.5">
          {linkedNoteNames.length === 0 && <div className="text-[10px] text-slate-600 px-1 py-1">Henüz bağlantı yok.</div>}
          {linkedNoteNames.map((l, i) => (
            <div key={i} className="text-[10px] text-teal-400 hover:text-teal-300 cursor-pointer px-1 py-0.5 hover:bg-white/5 rounded">
              [[{l}]]
            </div>
          ))}
        </div>

        <div className="px-3 py-2 border-b border-white/5 border-t border-white/5 mt-1">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Meta Veri</p>
        </div>
        <div className="px-3 py-2 space-y-1.5 text-[10px]">
          {[
            ["İhale ID", selectedTender?.tender_id || selectedTenderId],
            ["Şirket", selectedTender?.organization || "-"],
            ["Şube", selectedTender?.internal_unit || "-"],
            ["Yıl", selectedTender?.year?.toString() || "-"],
            ["Belge", relatedDocuments.length.toString()],
            ["Not", live.vaultNotes.length.toString()],
          ].map(([k, v], i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-slate-600">{k}</span>
              <span className="text-slate-300">{v}</span>
            </div>
          ))}
        </div>

        <div className="px-3 py-2 border-t border-white/5 mt-auto">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">AI Önerileri</p>
          <div className="bg-teal-600/10 border border-teal-600/20 rounded p-2 text-[10px] text-teal-300">
            <Cpu className="w-3 h-3 mb-1 text-teal-500" />
Kural tabanlı özet/risk çıkarımı çalıştırıldığında ilgili belge notuna otomatik yazılır (bkz. AUTO:EXTRACTION bölümü). Henüz bir büyük dil modeli bağlı değil.
          </div>
        </div>
      </aside>
    </div>
  );
}

