import { useState } from "react";
import { FileText, Upload, MoreHorizontal, Filter, Download, Eye, Paperclip, Package, Pencil, X, Plus } from "lucide-react";
import {
  ApiDocument,
  ERPSession,
  createERPTask,
  deleteERPTaskDocument,
  fileType,
  formatBytes,
  getERPTaskDocumentBlob,
  requestERPTaskCompletion,
  updateERPTaskDetails,
  updateERPTaskStatus,
  uploadERPTaskDocument,
} from "../api";
import type { LiveData } from "../lib/types";
import { isAdmin, userTaskIds, formatDateShort, relativeTime, taskLabel, getAssignee } from "../lib/helpers";
import { Badge } from "../components/Badge";

// ─── TASKS ────────────────────────────────────────────────────────────────────
export function TasksPage({ live, session }: { live: LiveData; session: ERPSession }) {
  const [statusFilter, setStatusFilter] = useState("Tümü");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: "", description: "", assigneeUserId: "", priority: "normal", deadlineAt: "" });
  const [formError, setFormError] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [documentBusy, setDocumentBusy] = useState(false);
  const [documentError, setDocumentError] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", description: "", priority: "normal", deadlineAt: "", clearDeadline: false });
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState("");

  const isoToLocalInput = (iso: string | null | undefined) => {
    if (!iso) return "";
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return "";
    const pad = (value: number) => String(value).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  };
  const overview = live.overview;
  const allowedTaskIds = userTaskIds(overview, session.user_id);
  const visibleTasks = isAdmin(session)
    ? (overview?.tasks || [])
    : (overview?.tasks || []).filter((task) => allowedTaskIds.has(task.id));
  const tasks = visibleTasks.map((task) => {
    const assignment = overview?.assignments.find((item) => item.task_id === task.id);
    const assignee = getAssignee(task, overview);
    return {
      id: task.id,
      title: task.title,
      assignee: assignee?.name || "Atanmamış",
      type: assignment?.assignee_team_id ? "Grup" : "Bireysel",
      due: formatDateShort(task.deadline_at),
      status: taskLabel(task.status),
      docs: overview?.documents.filter((doc) => doc.task_id === task.id).length || 0,
      created: task.assigned_by_user_id ? "Kullanıcı" : "Admin",
    };
  });
  const statuses = ["Tümü", "Yapılacak", "Devam Ediyor", "Tamamlama Talep", "Tamamlandı", "Gecikmiş", "İptal"];
  const filtered = statusFilter === "Tümü" ? tasks : tasks.filter(t => t.status === statusFilter);
  const selectedTask = visibleTasks.find((task) => task.id === selectedTaskId) || null;
  const selectedDocuments = (overview?.documents || []).filter(
    (document) => document.task_id === selectedTaskId,
  );
  const selectedAssignee = selectedTask ? getAssignee(selectedTask, overview) : null;
  const selectedComments = (overview?.help_messages || [])
    .filter((message) => message.task_id === selectedTaskId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(-4);
  const linkedTenderDocuments = selectedDocuments
    .map((document) => document.document_id
      ? live.documents.find((item) => item.id === document.document_id) || null
      : null)
    .filter((document): document is ApiDocument => Boolean(document));
  const openTaskDocument = async (documentId: number) => {
    setDocumentError("");
    const preview = window.open("about:blank", "_blank");
    if (preview) preview.opener = null;
    try {
      const blob = await getERPTaskDocumentBlob(documentId);
      const url = URL.createObjectURL(blob);
      if (preview) {
        preview.location.href = url;
      } else {
        throw new Error("Tarayıcı önizleme penceresini engelledi");
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      preview?.close();
      setDocumentError(error instanceof Error ? error.message : "Doküman açılamadı");
    }
  };
  const downloadTaskDocument = async (documentId: number, filename: string) => {
    setDocumentError("");
    try {
      const blob = await getERPTaskDocumentBlob(documentId, true);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setDocumentError(error instanceof Error ? error.message : "Doküman indirilemedi");
    }
  };
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {statuses.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${statusFilter === s ? "bg-teal-600 text-white border-teal-600" : "bg-white border-border text-muted-foreground hover:bg-slate-50"}`}>
            {s}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button className="flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 border border-border text-xs px-3 py-1.5 rounded">
            <Filter className="w-3.5 h-3.5" /> Filtrele
          </button>
          {isAdmin(session) && <button onClick={() => setShowForm((value) => !value)} className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-3 py-1.5 rounded">
            <Plus className="w-3.5 h-3.5" /> Görev Oluştur
          </button>}
        </div>
      </div>
      {isAdmin(session) && showForm && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setFormError("");
            try {
              await createERPTask({
                title: form.title,
                description: form.description || null,
                assignee_user_ids: form.assigneeUserId ? [Number(form.assigneeUserId)] : [],
                assignee_team_ids: [],
                priority: form.priority,
                deadline_at: form.deadlineAt ? new Date(form.deadlineAt).toISOString() : null,
              });
              setForm({ title: "", description: "", assigneeUserId: "", priority: "normal", deadlineAt: "" });
              setShowForm(false);
              live.refresh();
            } catch (error) {
              setFormError(error instanceof Error ? error.message : "Görev oluşturulamadı");
            }
          }}
          className="grid grid-cols-[1fr_220px_160px_200px_auto] gap-2 bg-white border border-border rounded p-3"
        >
          <input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" placeholder="Görev başlığı" />
          <select value={form.assigneeUserId} onChange={(event) => setForm({ ...form, assigneeUserId: event.target.value })} className="text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none">
            <option value="">Atanan kişi yok</option>
            {(overview?.users || []).map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
          <select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value })} className="text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none">
            <option value="low">Düşük</option>
            <option value="normal">Normal</option>
            <option value="high">Yüksek</option>
            <option value="urgent">Acil</option>
          </select>
          <input type="datetime-local" value={form.deadlineAt} onChange={(event) => setForm({ ...form, deadlineAt: event.target.value })} className="text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none" />
          <button className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded px-4">Oluştur</button>
          <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="col-span-full text-xs bg-slate-50 border border-border rounded px-3 py-2 outline-none resize-y min-h-16" placeholder="Görev açıklaması" />
          {formError && <div className="col-span-full text-xs text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2">{formError}</div>}
        </form>
      )}
      <div className="bg-white border border-border rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-border text-muted-foreground">
              <th className="text-left px-4 py-2.5 font-medium">Görev Başlığı</th>
              <th className="text-left px-4 py-2.5 font-medium">Atanan</th>
              <th className="text-left px-4 py-2.5 font-medium">Tür</th>
              <th className="text-left px-4 py-2.5 font-medium">Son Tarih</th>
              <th className="text-left px-4 py-2.5 font-medium">Durum</th>
              <th className="text-center px-4 py-2.5 font-medium">Belge</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Canlı veride görev bulunamadı.</td></tr>
            ) : filtered.map((t) => (
              <tr
                key={t.id}
                onClick={() => {
                  setSelectedTaskId(t.id);
                  setDocumentError("");
                  setEditMode(false);
                }}
                className={`hover:bg-slate-50 transition-colors cursor-pointer ${
                  selectedTaskId === t.id ? "bg-teal-50/50" : ""
                }`}
              >
                <td className="px-4 py-3 font-medium text-foreground max-w-xs">
                  <span className="block truncate">{t.title}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{t.assignee}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${t.type === "Grup" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{t.type}</span>
                </td>
                <td className="px-4 py-3 font-mono text-muted-foreground">{t.due}</td>
                <td className="px-4 py-3"><Badge label={t.status} /></td>
                <td className="px-4 py-3 text-center">
                  {t.docs > 0 ? (
                    <div className="flex items-center justify-center gap-1 text-muted-foreground">
                      <Paperclip className="w-3 h-3" />{t.docs}
                    </div>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  {!isAdmin(session) && (t.status === "Yapılacak" || t.status === "Beklemede") ? (
                    <button
                      onClick={async () => {
                        await updateERPTaskStatus(t.id, "in_progress");
                        live.refresh();
                      }}
                      className="text-[10px] font-medium text-teal-700 hover:text-teal-900"
                    >
                      Başlat
                    </button>
                  ) : !isAdmin(session) && ["Devam Ediyor", "Gecikmiş"].includes(t.status) ? (
                    <button
                      onClick={async () => {
                        setFormError("");
                        try {
                          await requestERPTaskCompletion(
                            t.id,
                            session.user_id,
                            "Görev tamamlandı, yönetici kontrolüne sunuldu.",
                          );
                          live.refresh();
                        } catch (error) {
                          setFormError(error instanceof Error ? error.message : "Tamamlama isteği gönderilemedi");
                        }
                      }}
                      className="text-[10px] font-medium text-violet-700 hover:text-violet-900"
                    >
                      Tamamlandı bildir
                    </button>
                  ) : <MoreHorizontal className="w-4 h-4 text-slate-400" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedTask && (
        <aside className="fixed right-0 top-12 bottom-0 z-30 flex w-[420px] flex-col border-l border-border bg-white shadow-xl">
          <div className="flex items-start justify-between border-b border-border bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-teal-700">Görev Detayı</p>
              <h3 className="mt-1 truncate text-sm font-semibold text-foreground">{selectedTask.title}</h3>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                {selectedAssignee?.name || "Atanmamış"} · {taskLabel(selectedTask.status)}
              </p>
            </div>
            <button
              title="Kapat"
              onClick={() => setSelectedTaskId(null)}
              className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded border border-border bg-slate-50 p-2">
                <p className="text-[10px] text-muted-foreground">Durum</p>
                <div className="mt-1"><Badge label={taskLabel(selectedTask.status)} /></div>
              </div>
              <div className="rounded border border-border bg-slate-50 p-2">
                <p className="text-[10px] text-muted-foreground">Son tarih</p>
                <p className="mt-1 font-mono text-foreground">{formatDateShort(selectedTask.deadline_at)}</p>
              </div>
              <div className="rounded border border-border bg-slate-50 p-2">
                <p className="text-[10px] text-muted-foreground">Öncelik</p>
                <p className="mt-1 font-medium capitalize text-foreground">{selectedTask.priority}</p>
              </div>
              <div className="rounded border border-border bg-slate-50 p-2">
                <p className="text-[10px] text-muted-foreground">Belge</p>
                <p className="mt-1 font-medium text-foreground">{selectedDocuments.length}</p>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Açıklama</p>
                {isAdmin(session) && !editMode && !["done", "cancelled"].includes(selectedTask.status) && (
                  <button
                    onClick={() => {
                      setEditForm({
                        title: selectedTask.title,
                        description: selectedTask.description || "",
                        priority: (selectedTask.priority || "normal").toLowerCase(),
                        deadlineAt: isoToLocalInput(selectedTask.deadline_at),
                        clearDeadline: false,
                      });
                      setEditError("");
                      setEditMode(true);
                    }}
                    className="flex items-center gap-1 text-[10px] font-medium text-teal-700 hover:text-teal-900"
                  >
                    <Pencil className="h-3 w-3" /> Düzenle
                  </button>
                )}
              </div>
              {!editMode ? (
                <div className="rounded border border-border bg-slate-50 p-3 text-xs text-foreground">
                  {selectedTask.description || "Bu görev için açıklama girilmemiş."}
                </div>
              ) : (
                <div className="space-y-2 rounded border border-teal-200 bg-teal-50/40 p-3">
                  <input
                    value={editForm.title}
                    onChange={(e) => setEditForm((f) => ({ ...f, title: e.target.value }))}
                    placeholder="Görev başlığı"
                    className="w-full rounded border border-border bg-white px-2.5 py-2 text-xs text-foreground outline-none focus:border-teal-400"
                  />
                  <textarea
                    value={editForm.description}
                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                    rows={3}
                    placeholder="Açıklama"
                    className="w-full resize-none rounded border border-border bg-white px-2.5 py-2 text-xs text-foreground outline-none focus:border-teal-400"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={editForm.priority}
                      onChange={(e) => setEditForm((f) => ({ ...f, priority: e.target.value }))}
                      className="rounded border border-border bg-white px-2 py-2 text-xs text-foreground outline-none"
                    >
                      <option value="low">Düşük</option>
                      <option value="normal">Normal</option>
                      <option value="high">Yüksek</option>
                      <option value="urgent">Acil</option>
                    </select>
                    <input
                      type="datetime-local"
                      value={editForm.deadlineAt}
                      disabled={editForm.clearDeadline}
                      onChange={(e) => setEditForm((f) => ({ ...f, deadlineAt: e.target.value }))}
                      className={`rounded border border-border bg-white px-2 py-2 text-xs text-foreground outline-none ${editForm.clearDeadline ? "opacity-40" : ""}`}
                    />
                  </div>
                  <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={editForm.clearDeadline}
                      onChange={(e) => setEditForm((f) => ({ ...f, clearDeadline: e.target.checked }))}
                    />
                    Deadline'ı kaldır
                  </label>
                  <p className="text-[10px] text-muted-foreground">
                    Deadline değişirse yaklaşan-teslim uyarıları yeni tarihe göre yeniden kurulur.
                  </p>
                  {editError && <p className="text-[10px] text-red-600">{editError}</p>}
                  <div className="flex items-center gap-2">
                    <button
                      disabled={editBusy}
                      onClick={async () => {
                        if (editForm.title.trim().length < 3) {
                          setEditError("Görev başlığı en az 3 karakter olmalıdır.");
                          return;
                        }
                        setEditError("");
                        setEditBusy(true);
                        try {
                          await updateERPTaskDetails(selectedTask.id, {
                            title: editForm.title.trim(),
                            description: editForm.description,
                            priority: editForm.priority,
                            ...(editForm.clearDeadline
                              ? { clear_deadline: true }
                              : editForm.deadlineAt
                                ? { deadline_at: new Date(editForm.deadlineAt).toISOString() }
                                : {}),
                          });
                          live.refresh();
                          setEditMode(false);
                        } catch (error) {
                          setEditError(error instanceof Error ? error.message : "Görev güncellenemedi.");
                        } finally {
                          setEditBusy(false);
                        }
                      }}
                      className="rounded bg-teal-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-teal-700 disabled:opacity-50"
                    >
                      {editBusy ? "Kaydediliyor…" : "Kaydet"}
                    </button>
                    <button
                      disabled={editBusy}
                      onClick={() => setEditMode(false)}
                      className="rounded border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:bg-slate-50"
                    >
                      Vazgeç
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Bağlı Tender Belgesi</p>
              {linkedTenderDocuments.length === 0 ? (
                <div className="rounded border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                  Bu görev henüz Tender Hub belgesine bağlı değil.
                </div>
              ) : (
                <div className="space-y-2">
                  {linkedTenderDocuments.map((document) => (
                    <div key={document.id} className="rounded border border-border p-3">
                      <div className="flex items-start gap-2">
                        <Package className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-foreground">
                            {document.original_filename || document.stored_filename || "Tender belgesi"}
                          </p>
                          <p className="mt-1 text-[10px] text-muted-foreground">
                            {document.organization || "Sınıflandırılmamış"} · {document.tender_id}
                          </p>
                          <p className="mt-1 text-[10px] text-slate-400">
                            {document.internal_unit || "-"} · {fileType(document)} · {formatBytes(document.file_size)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Görev Dokümanları</p>
                <label className="flex cursor-pointer items-center gap-1.5 rounded bg-teal-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-teal-700">
                  <Upload className="h-3.5 w-3.5" />
                  {documentBusy ? "Yükleniyor" : "Yükle"}
                  <input
                    type="file"
                    className="hidden"
                    disabled={documentBusy}
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,.jpg,.jpeg,.png,.webp"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      setDocumentBusy(true);
                      setDocumentError("");
                      try {
                        await uploadERPTaskDocument(selectedTask.id, file);
                        live.refresh();
                      } catch (error) {
                        setDocumentError(error instanceof Error ? error.message : "Doküman yüklenemedi");
                      } finally {
                        setDocumentBusy(false);
                      }
                    }}
                  />
                </label>
              </div>
              {documentError && (
                <div className="mb-2 rounded border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {documentError}
                </div>
              )}
              <div className="divide-y divide-border rounded border border-border">
                {selectedDocuments.length === 0 ? (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">Bu göreve henüz doküman eklenmedi.</div>
                ) : selectedDocuments.map((document) => {
                  const sourceDocument = document.document_id
                    ? live.documents.find((item) => item.id === document.document_id) || null
                    : null;
                  const filename = sourceDocument?.original_filename || document.original_filename || "Doküman";
                  return (
                    <div key={document.id} className="flex items-center gap-2 px-3 py-2.5">
                      <FileText className="h-4 w-4 shrink-0 text-teal-600" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-medium text-foreground">{filename}</p>
                        <p className="truncate text-[10px] text-muted-foreground">
                          {sourceDocument ? `${sourceDocument.tender_id} · Tender Hub` : "ERP dokümanı"}
                        </p>
                      </div>
                      <button title="Görüntüle" onClick={() => openTaskDocument(document.id)} className="p-1.5 text-slate-400 hover:text-teal-600">
                        <Eye className="h-4 w-4" />
                      </button>
                      <button title="İndir" onClick={() => downloadTaskDocument(document.id, filename)} className="p-1.5 text-slate-400 hover:text-teal-600">
                        <Download className="h-4 w-4" />
                      </button>
                      {isAdmin(session) && (
                        <button
                          title="Sil"
                          onClick={async () => {
                            setDocumentError("");
                            try {
                              await deleteERPTaskDocument(document.id);
                              live.refresh();
                            } catch (error) {
                              setDocumentError(error instanceof Error ? error.message : "Doküman silinemedi");
                            }
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Son Mesajlar</p>
              <div className="space-y-2">
                {selectedComments.length === 0 ? (
                  <div className="rounded border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">
                    Bu görevde henüz mesaj yok.
                  </div>
                ) : selectedComments.map((comment) => {
                  const author = overview?.users.find((user) => user.id === comment.author_user_id);
                  return (
                    <div key={comment.id} className="rounded border border-border p-2.5">
                      <p className="text-xs text-foreground">{comment.body}</p>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {author?.name || "Admin"} · {relativeTime(comment.created_at)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

