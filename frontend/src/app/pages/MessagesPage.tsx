import { useEffect, useState } from "react";
import { FileText, MoreHorizontal, Paperclip, PanelLeftOpen, X } from "lucide-react";
import {
  ApiDocument,
  ERPSession,
  createERPTaskComment,
  displayStatus,
} from "../api";
import type { LiveData } from "../lib/types";
import { isAdmin, userTaskIds, shortName, formatDateShort, relativeTime, taskLabel, getAssignee } from "../lib/helpers";
import { Badge } from "../components/Badge";

// ─── MESSAGES ─────────────────────────────────────────────────────────────────
export function MessagesPage({ live, session }: { live: LiveData; session: ERPSession }) {
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(true);
  const overview = live.overview;
  const comments = overview?.help_messages || [];
  const allowedTaskIds = userTaskIds(overview, session.user_id);
  const visibleTasks = (overview?.tasks || []).filter((task) => (
    isAdmin(session) ? comments.some((message) => message.task_id === task.id) : allowedTaskIds.has(task.id)
  ));
  const threads = visibleTasks.map((task) => {
    const taskComments = comments
      .filter((message) => message.task_id === task.id)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const lastMessage = taskComments[taskComments.length - 1];
    const assignee = getAssignee(task, overview);
    return {
      taskId: task.id,
      person: isAdmin(session) ? (assignee?.name || "Atanmamış") : "Admin",
      last: lastMessage?.body || "Henüz mesaj yok.",
      time: relativeTime(lastMessage?.created_at || task.created_at),
      unread: isAdmin(session)
        ? taskComments.filter((message) => message.author_user_id !== null).length
        : taskComments.filter((message) => message.author_user_id === null).length,
      task: task.title,
    };
  });
  useEffect(() => {
    if (threads.length === 0) {
      setSelectedTaskId(null);
      return;
    }
    if (!selectedTaskId || !threads.some((thread) => thread.taskId === selectedTaskId)) {
      setSelectedTaskId(threads[0].taskId);
    }
  }, [threads.length, selectedTaskId]);
  const selectedThread = threads.find((thread) => thread.taskId === selectedTaskId) || threads[0];
  const selectedTask = selectedThread
    ? visibleTasks.find((task) => task.id === selectedThread.taskId) || null
    : null;
  const selectedAssignee = selectedTask ? getAssignee(selectedTask, overview) : null;
  const selectedDocuments = (overview?.documents || []).filter((document) => document.task_id === selectedThread?.taskId);
  const linkedTenderDocuments = selectedDocuments
    .map((document) => document.document_id
      ? live.documents.find((item) => item.id === document.document_id) || null
      : null)
    .filter((document): document is ApiDocument => Boolean(document));
  const messages = comments
    .filter((message) => selectedThread && message.task_id === selectedThread.taskId)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
    .map((message) => {
      const user = overview?.users.find((item) => item.id === message.author_user_id);
      return {
        from: user?.name || "Admin",
        text: message.body,
        time: new Date(message.created_at).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" }),
        date: new Date(message.created_at).toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" }),
        kind: message.kind,
        own: isAdmin(session) ? message.author_user_id === null : message.author_user_id === session.user_id,
      };
    });
  const sendMessage = async () => {
    if (!selectedThread || draft.trim().length < 2) return;
    setSending(true);
    setSendError("");
    try {
      await createERPTaskComment(selectedThread.taskId, {
        author_user_id: isAdmin(session) ? null : session.user_id,
        body: draft,
        kind: isAdmin(session) ? "reply" : "help",
      });
      setDraft("");
      live.refresh();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Mesaj gönderilemedi");
    } finally {
      setSending(false);
    }
  };
  return (
    <div className="p-6 flex gap-4 h-[calc(100vh-112px)]">
      <div className="w-72 bg-white border border-border rounded overflow-hidden flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-border bg-slate-50">
          <h3 className="text-xs font-semibold">Konuşmalar</h3>
        </div>
        <div className="overflow-y-auto flex-1">
          {threads.length === 0 ? (
            <div className="px-4 py-6 text-xs text-center text-muted-foreground">Canlı veride mesaj yok.</div>
          ) : threads.map((t, i) => (
            <button
              key={t.taskId}
              onClick={() => setSelectedTaskId(t.taskId)}
              className={`w-full text-left px-4 py-3 border-b border-border transition-colors ${selectedThread?.taskId === t.taskId ? "bg-teal-50 border-l-2 border-l-teal-500" : "hover:bg-slate-50"}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">{t.person}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">{t.time}</span>
                  {t.unread > 0 && (
                    <span className="bg-teal-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{t.unread}</span>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-teal-600 truncate mt-0.5">{t.task}</p>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">{t.last}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-w-0 bg-white border border-border rounded flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p className="text-xs font-semibold text-foreground">{selectedThread?.person || "Mesaj yok"}</p>
            <p className="text-[10px] text-teal-600">{selectedThread?.task || "-"}</p>
          </div>
          <div className="flex items-center gap-2">
            {selectedTask && <Badge label={taskLabel(selectedTask.status)} />}
            <button
              type="button"
              onClick={() => setDetailsOpen((value) => !value)}
              className="text-xs px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-border rounded text-muted-foreground flex items-center gap-1"
            >
              <PanelLeftOpen className="w-3 h-3" /> Detay
            </button>
            <button className="text-slate-400 hover:text-slate-600"><MoreHorizontal className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.length === 0 ? (
            <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
              Bu görev için henüz mesaj yok.
            </div>
          ) : messages.map((m, i) => (
            <div key={i} className={`flex ${m.own ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-sm rounded px-3 py-2 ${m.own ? "bg-teal-600 text-white" : "bg-slate-100 text-foreground"}`}>
                <div className={`mb-1 flex items-center gap-2 text-[10px] ${m.own ? "text-teal-100" : "text-muted-foreground"}`}>
                  <span className="font-semibold">{m.from}</span>
                  <span>{m.date}</span>
                  <span>{m.kind}</span>
                </div>
                <p className="text-xs whitespace-pre-wrap">{m.text}</p>
                <p className={`text-[10px] mt-1 ${m.own ? "text-teal-200" : "text-muted-foreground"}`}>{m.time}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-border p-3 flex items-end gap-2">
          <textarea
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Yanıtınızı yazın..."
            className="flex-1 text-xs bg-slate-50 border border-border rounded px-3 py-2 resize-none outline-none focus:ring-1 focus:ring-teal-400"
          />
          <div className="flex flex-col gap-1.5">
            <button className="p-1.5 text-slate-400 hover:text-teal-600 transition-colors"><Paperclip className="w-4 h-4" /></button>
            <button
              onClick={sendMessage}
              disabled={!selectedThread || sending || draft.trim().length < 2}
              className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors"
            >
              {sending ? "Gönderiliyor" : "Gönder"}
            </button>
          </div>
        </div>
        {sendError && <div className="px-3 pb-3 text-xs text-red-600">{sendError}</div>}
      </div>
      {detailsOpen && selectedTask && (
        <aside className="w-80 shrink-0 bg-white border border-border rounded flex flex-col overflow-hidden">
          <div className="flex items-center justify-between border-b border-border bg-slate-50 px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-foreground">Thread Detayı</p>
              <p className="text-[10px] text-muted-foreground">{messages.length} mesaj</p>
            </div>
            <button type="button" onClick={() => setDetailsOpen(false)} className="rounded p-1 text-slate-400 hover:bg-white hover:text-slate-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Görev</p>
              <div className="space-y-2 rounded border border-border bg-slate-50 p-3">
                <p className="text-xs font-semibold text-foreground">{selectedTask.title}</p>
                {selectedTask.description && <p className="text-xs text-muted-foreground">{selectedTask.description}</p>}
                <div className="grid grid-cols-2 gap-2 text-[10px] text-muted-foreground">
                  <div>
                    <span className="block font-semibold text-slate-500">Durum</span>
                    <Badge label={taskLabel(selectedTask.status)} />
                  </div>
                  <div>
                    <span className="block font-semibold text-slate-500">Son Tarih</span>
                    <span className="font-mono">{formatDateShort(selectedTask.deadline_at)}</span>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Katılımcılar</p>
              <div className="space-y-2">
                {["Admin", selectedAssignee?.name || "Atanmamış"].map((name) => (
                  <div key={name} className="flex items-center gap-2 rounded border border-border px-3 py-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
                      {shortName(name)}
                    </div>
                    <span className="text-xs font-medium text-foreground">{name}</span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Dokümanlar</p>
              {selectedDocuments.length === 0 ? (
                <p className="rounded border border-dashed border-border px-3 py-4 text-center text-xs text-muted-foreground">Doküman eklenmemiş.</p>
              ) : (
                <div className="space-y-2">
                  {selectedDocuments.map((document) => {
                    const linked = document.document_id
                      ? linkedTenderDocuments.find((item) => item.id === document.document_id)
                      : null;
                    return (
                      <div key={document.id} className="rounded border border-border px-3 py-2">
                        <div className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 shrink-0 text-teal-600" />
                          <span className="truncate text-xs font-medium text-foreground">{document.original_filename || linked?.original_filename || "Doküman"}</span>
                        </div>
                        <p className="mt-1 truncate text-[10px] text-muted-foreground">
                          {linked ? `${linked.organization || "Tender Hub"} · ${displayStatus(linked.status)}` : document.visibility}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section>
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Konuşma Özeti</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border border-border bg-slate-50 p-3">
                  <p className="text-lg font-bold font-mono text-foreground">{messages.length}</p>
                  <p className="text-[10px] text-muted-foreground">Toplam mesaj</p>
                </div>
                <div className="rounded border border-border bg-slate-50 p-3">
                  <p className="text-lg font-bold font-mono text-foreground">{selectedDocuments.length}</p>
                  <p className="text-[10px] text-muted-foreground">Ek</p>
                </div>
              </div>
            </section>
          </div>
        </aside>
      )}
    </div>
  );
}

