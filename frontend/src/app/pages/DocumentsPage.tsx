import { useEffect, useMemo, useState } from "react";
import { FileText, ChevronRight, Search, Download, Eye, Link, ChevronLeft, X } from "lucide-react";
import {
  ApiDocument,
  createTaskFromTenderDocument,
  displayStatus,
  downloadBlob,
  fileType,
  formatBytes,
  getTenderDocumentBlob,
} from "../api";
import type { LiveData, FilePreview } from "../lib/types";
import { createFilePreview } from "../lib/helpers";
import { Badge } from "../components/Badge";
import { FilePreviewModal } from "../components/FilePreviewModal";

// ─── DOCUMENTS ────────────────────────────────────────────────────────────────
export function DocumentFilter({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center gap-1.5 rounded border border-border bg-white px-2.5 py-1.5">
      <span className="text-[10px] text-muted-foreground">{label}:</span>
      <select
        aria-label={`${label} filtresi`}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="max-w-32 bg-transparent text-xs text-foreground outline-none"
      >
        <option value="all">Tümü</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

export function DocumentsPage({ live }: { live: LiveData }) {
  const pageSize = 10;
  const [searchTerm, setSearchTerm] = useState("");
  const [yearFilter, setYearFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [companyFilter, setCompanyFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [taskDocument, setTaskDocument] = useState<ApiDocument | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskPriority, setTaskPriority] = useState("normal");
  const [taskDeadline, setTaskDeadline] = useState("");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [assigneeTeamId, setAssigneeTeamId] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [previewFile, setPreviewFile] = useState<FilePreview | null>(null);
  const docs = useMemo(() => live.documents.map((doc) => ({
    raw: doc,
    id: doc.id,
    name: doc.stored_filename || doc.original_filename || `Belge #${doc.id}`,
    company: doc.organization || "-",
    branch: doc.internal_unit || "-",
    tenderId: doc.tender_id,
    year: String(doc.year || new Date(doc.timestamp).getFullYear()),
    date: new Date(doc.timestamp).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" }),
    type: fileType(doc),
    size: formatBytes(doc.file_size),
    status: displayStatus(doc.status) === "classified" ? "Sınıflandırıldı" : "Sınıflandırılmamış",
  })), [live.documents]);
  const filterOptions = useMemo(() => ({
    years: [...new Set(docs.map((doc) => doc.year))].sort().reverse(),
    branches: [...new Set(docs.map((doc) => doc.branch).filter((value) => value !== "-"))].sort(),
    companies: [...new Set(docs.map((doc) => doc.company).filter((value) => value !== "-"))].sort(),
    types: [...new Set(docs.map((doc) => doc.type))].sort(),
  }), [docs]);
  const filteredDocs = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase("tr-TR");
    return docs.filter((doc) => {
      const matchesQuery = !query || [
        doc.name,
        doc.company,
        doc.branch,
        doc.tenderId,
      ].some((value) => value.toLocaleLowerCase("tr-TR").includes(query));
      return matchesQuery
        && (yearFilter === "all" || doc.year === yearFilter)
        && (branchFilter === "all" || doc.branch === branchFilter)
        && (companyFilter === "all" || doc.company === companyFilter)
        && (typeFilter === "all" || doc.type === typeFilter);
    });
  }, [docs, searchTerm, yearFilter, branchFilter, companyFilter, typeFilter]);
  const pageCount = Math.max(1, Math.ceil(filteredDocs.length / pageSize));
  const visibleDocs = filteredDocs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, yearFilter, branchFilter, companyFilter, typeFilter, live.documents.length]);

  useEffect(() => {
    if (currentPage > pageCount) setCurrentPage(pageCount);
  }, [currentPage, pageCount]);

  useEffect(() => {
    return () => {
      if (previewFile) URL.revokeObjectURL(previewFile.url);
    };
  }, [previewFile]);

  async function handleDocumentFile(document: ApiDocument, download: boolean) {
    setActionError("");
    try {
      const blob = await getTenderDocumentBlob(document.id, download);
      if (download) {
        downloadBlob(blob, document.stored_filename || document.original_filename || `document-${document.id}`);
      } else {
        setPreviewFile((current) => {
          if (current) URL.revokeObjectURL(current.url);
          return createFilePreview(
            blob,
            document.stored_filename || document.original_filename || `document-${document.id}`,
            document.original_filename || document.stored_filename || `Belge #${document.id}`,
          );
        });
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Belge açılamadı.");
    }
  }

  function openTaskDialog(document: ApiDocument) {
    setActionError("");
    setTaskDocument(document);
    setTaskTitle(`${document.tender_id} - ${document.original_filename || document.stored_filename || "Belge inceleme"}`);
    setTaskDescription("");
    setTaskPriority("normal");
    setTaskDeadline("");
    setAssigneeUserId("");
    setAssigneeTeamId("");
  }

  async function submitDocumentTask() {
    if (!taskDocument) return;
    setTaskSaving(true);
    setActionError("");
    try {
      await createTaskFromTenderDocument(taskDocument.id, {
        title: taskTitle,
        description: taskDescription || null,
        assignee_user_ids: assigneeUserId ? [Number(assigneeUserId)] : [],
        assignee_team_ids: assigneeTeamId ? [Number(assigneeTeamId)] : [],
        priority: taskPriority,
        deadline_at: taskDeadline ? new Date(taskDeadline).toISOString() : null,
      });
      setTaskDocument(null);
      await live.refresh();
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Görev oluşturulamadı.");
    } finally {
      setTaskSaving(false);
    }
  }

  return (
    <div className="p-6 space-y-4">
      {actionError && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{actionError}</div>}
      <div className="flex items-center gap-2 flex-wrap">
        <DocumentFilter label="Yıl" value={yearFilter} onChange={setYearFilter} options={filterOptions.years} />
        <DocumentFilter label="Şube" value={branchFilter} onChange={setBranchFilter} options={filterOptions.branches} />
        <DocumentFilter label="Şirket" value={companyFilter} onChange={setCompanyFilter} options={filterOptions.companies} />
        <DocumentFilter label="Tür" value={typeFilter} onChange={setTypeFilter} options={filterOptions.types} />
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white border border-border rounded px-2.5 py-1.5">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Belge ara..."
              className="text-xs bg-transparent outline-none w-36"
            />
          </div>
        </div>
      </div>
      <div className="bg-white border border-border rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-border text-muted-foreground">
              <th className="text-left px-4 py-2.5 font-medium">Dosya Adı</th>
              <th className="text-left px-4 py-2.5 font-medium">İhale Şirketi</th>
              <th className="text-left px-4 py-2.5 font-medium">Şube</th>
              <th className="text-left px-4 py-2.5 font-medium">İhale ID</th>
              <th className="text-left px-4 py-2.5 font-medium">Tarih</th>
              <th className="text-left px-4 py-2.5 font-medium">Tür</th>
              <th className="text-left px-4 py-2.5 font-medium">Boyut</th>
              <th className="text-left px-4 py-2.5 font-medium">Durum</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visibleDocs.length === 0 ? (
              <tr><td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">Filtrelere uygun belge bulunamadı.</td></tr>
            ) : visibleDocs.map((d) => (
              <tr key={d.id} className="hover:bg-slate-50 transition-colors cursor-pointer">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                    <span className="font-mono text-[11px] text-foreground truncate max-w-[180px]">{d.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{d.company}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{d.branch}</td>
                <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{d.tenderId}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{d.date}</td>
                <td className="px-4 py-2.5">
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-100 text-slate-600">{d.type}</span>
                </td>
                <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{d.size}</td>
                <td className="px-4 py-2.5"><Badge label={d.status} /></td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1">
                    <button title="Önizle" onClick={() => handleDocumentFile(d.raw, false)} className="text-slate-400 hover:text-teal-600 transition-colors p-1"><Eye className="w-3.5 h-3.5" /></button>
                    <button title="İndir" onClick={() => handleDocumentFile(d.raw, true)} className="text-slate-400 hover:text-teal-600 transition-colors p-1"><Download className="w-3.5 h-3.5" /></button>
                    <button title="ERP görevi oluştur" onClick={() => openTaskDialog(d.raw)} className="text-slate-400 hover:text-teal-600 transition-colors p-1"><Link className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-slate-50">
          <span className="text-[10px] text-muted-foreground">
            {filteredDocs.length === 0
              ? "0 belge gösteriliyor"
              : `${filteredDocs.length} belgeden ${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, filteredDocs.length)} gösteriliyor`}
          </span>
          <div className="flex items-center gap-1">
            <button
              title="Önceki sayfa"
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="min-w-12 text-center text-[10px] font-medium text-foreground">
              {currentPage} / {pageCount}
            </span>
            <button
              title="Sonraki sayfa"
              disabled={currentPage === pageCount}
              onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
              className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
      {taskDocument && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50" onMouseDown={(event) => event.currentTarget === event.target && setTaskDocument(null)}>
          <div className="w-[520px] max-w-[calc(100vw-32px)] rounded border border-border bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div>
                <h3 className="text-sm font-semibold text-foreground">Belgeden ERP görevi oluştur</h3>
                <p className="mt-1 max-w-[420px] truncate text-[10px] text-muted-foreground">{taskDocument.original_filename || taskDocument.stored_filename}</p>
              </div>
              <button title="Kapat" onClick={() => setTaskDocument(null)} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid gap-3 p-5">
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Görev başlığı
                <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} className="mt-1.5 w-full rounded border border-border bg-slate-50 px-3 py-2 text-xs font-normal normal-case text-foreground outline-none focus:ring-1 focus:ring-teal-400" />
              </label>
              <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Açıklama
                <textarea rows={3} value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} className="mt-1.5 w-full resize-y rounded border border-border bg-slate-50 px-3 py-2 text-xs font-normal normal-case text-foreground outline-none focus:ring-1 focus:ring-teal-400" />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Çalışan
                  <select value={assigneeUserId} onChange={(event) => setAssigneeUserId(event.target.value)} className="mt-1.5 w-full rounded border border-border bg-slate-50 px-2.5 py-2 text-xs font-normal normal-case text-foreground">
                    <option value="">Atanmamış</option>
                    {(live.overview?.users || []).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                </label>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Ekip
                  <select value={assigneeTeamId} onChange={(event) => setAssigneeTeamId(event.target.value)} className="mt-1.5 w-full rounded border border-border bg-slate-50 px-2.5 py-2 text-xs font-normal normal-case text-foreground">
                    <option value="">Ekip yok</option>
                    {(live.overview?.teams || []).map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Öncelik
                  <select value={taskPriority} onChange={(event) => setTaskPriority(event.target.value)} className="mt-1.5 w-full rounded border border-border bg-slate-50 px-2.5 py-2 text-xs font-normal normal-case text-foreground">
                    <option value="low">Düşük</option>
                    <option value="normal">Normal</option>
                    <option value="high">Yüksek</option>
                    <option value="urgent">Acil</option>
                  </select>
                </label>
                <label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Son tarih
                  <input type="datetime-local" value={taskDeadline} onChange={(event) => setTaskDeadline(event.target.value)} className="mt-1.5 w-full rounded border border-border bg-slate-50 px-2.5 py-2 text-xs font-normal normal-case text-foreground" />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button onClick={() => setTaskDocument(null)} className="rounded border border-border px-4 py-2 text-xs text-muted-foreground hover:bg-slate-50">İptal</button>
              <button disabled={taskSaving || taskTitle.trim().length < 3} onClick={submitDocumentTask} className="rounded bg-teal-600 px-4 py-2 text-xs font-medium text-white hover:bg-teal-700 disabled:opacity-40">
                {taskSaving ? "Oluşturuluyor..." : "Görevi oluştur"}
              </button>
            </div>
          </div>
        </div>
      )}
      {previewFile && (
        <FilePreviewModal
          preview={previewFile}
          onClose={() => {
            URL.revokeObjectURL(previewFile.url);
            setPreviewFile(null);
          }}
        />
      )}
    </div>
  );
}

