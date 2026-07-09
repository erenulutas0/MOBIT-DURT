import { useState } from "react";
import { MessageSquare, FileText, CheckCircle2, XCircle, Download, Eye } from "lucide-react";
import {
  approveERPTaskCompletion,
  rejectERPTaskCompletion,
} from "../api";
import type { LiveData } from "../lib/types";
import { formatDateShort, relativeTime, getAssignee } from "../lib/helpers";
import { Badge } from "../components/Badge";

// ─── APPROVALS ────────────────────────────────────────────────────────────────
export function ApprovalsPage({ live }: { live: LiveData }) {
  const [selected, setSelected] = useState<number | null>(0);
  const [busyTaskId, setBusyTaskId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const overview = live.overview;
  const approvals = (overview?.tasks || [])
    .filter((task) => task.status === "pending_approval")
    .map((task) => {
      const assignee = getAssignee(task, overview);
      return {
        id: task.id,
        task: task.title,
        person: assignee?.name || "Atanmamış",
        due: formatDateShort(task.deadline_at),
        submitted: relativeTime(task.created_at),
        note: (overview?.help_messages || []).find((message) => message.task_id === task.id)?.body || "Çalışan tamamlama onayı istedi.",
        docs: (overview?.documents || []).filter((doc) => doc.task_id === task.id).map((doc) => doc.original_filename || doc.file_path || "Belge"),
        activity: (overview?.help_messages || [])
          .filter((message) => message.task_id === task.id)
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
      };
    });
  const sel = selected !== null ? approvals[selected] : null;
  return (
    <div className="p-6 flex gap-4 h-[calc(100vh-112px)]">
      <div className="w-80 bg-white border border-border rounded overflow-hidden flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-border bg-slate-50">
          <h3 className="text-xs font-semibold text-foreground">Bekleyen Onaylar ({approvals.length})</h3>
        </div>
        <div className="overflow-y-auto flex-1">
          {approvals.length === 0 ? (
            <div className="px-4 py-6 text-xs text-center text-muted-foreground">Bekleyen onay yok.</div>
          ) : approvals.map((a, i) => (
            <button
              key={i}
              onClick={() => setSelected(i)}
              className={`w-full text-left px-4 py-3 border-b border-border transition-colors ${selected === i ? "bg-teal-50 border-l-2 border-l-teal-500" : "hover:bg-slate-50"}`}
            >
              <p className="text-xs font-medium text-foreground truncate">{a.task}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{a.person} · {a.submitted}</p>
              <div className="mt-1.5"><Badge label="Tamamlama Talep" /></div>
            </button>
          ))}
        </div>
      </div>

      {sel ? (
        <div className="flex-1 bg-white border border-border rounded overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{sel.task}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{sel.person} · Son tarih: {sel.due} · Gönderildi: {sel.submitted}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                disabled={busyTaskId === sel.id}
                onClick={async () => {
                  setBusyTaskId(sel.id);
                  setActionError("");
                  try {
                    await approveERPTaskCompletion(sel.id, "admin");
                    setSelected(0);
                    live.refresh();
                  } catch (error) {
                    setActionError(error instanceof Error ? error.message : "Görev onaylanamadı");
                  } finally {
                    setBusyTaskId(null);
                  }
                }}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors flex items-center gap-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Onayla
              </button>
              <button
                disabled={busyTaskId === sel.id}
                onClick={async () => {
                  setBusyTaskId(sel.id);
                  setActionError("");
                  try {
                    await rejectERPTaskCompletion(
                      sel.id,
                      "admin",
                      "Görev yönetici incelemesinden sonra tekrar çalışmaya gönderildi.",
                    );
                    setSelected(0);
                    live.refresh();
                  } catch (error) {
                    setActionError(error instanceof Error ? error.message : "Görev reddedilemedi");
                  } finally {
                    setBusyTaskId(null);
                  }
                }}
                className="px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-medium rounded transition-colors flex items-center gap-1.5"
              >
                <XCircle className="w-3.5 h-3.5" /> Reddet
              </button>
              <button className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-xs font-medium rounded text-slate-600 transition-colors flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Mesaj Gönder
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {actionError && (
              <div className="bg-red-50 border border-red-100 rounded px-3 py-2 text-xs text-red-700">
                {actionError}
              </div>
            )}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Çalışan Notu</p>
              <div className="bg-slate-50 border border-border rounded p-3 text-xs text-foreground">{sel.note}</div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Ekli Dosyalar</p>
              <div className="space-y-2">
                {sel.docs.map((d, i) => (
                  <div key={i} className="flex items-center gap-2.5 bg-slate-50 border border-border rounded p-2.5">
                    <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                    <span className="text-xs font-medium text-foreground flex-1">{d}</span>
                    <button className="text-slate-400 hover:text-teal-600 transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                    <button className="text-slate-400 hover:text-teal-600 transition-colors"><Download className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Aktivite Günlüğü</p>
              <div className="space-y-2">
                {sel.activity.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Henüz görev aktivitesi yok.</p>
                ) : sel.activity.map((entry) => {
                  const author = overview?.users.find((user) => user.id === entry.author_user_id);
                  return (
                  <div key={entry.id} className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0" />
                    <div>
                      <p className="text-xs text-foreground">{entry.body}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {author?.name || "Admin"} · {relativeTime(entry.created_at)}
                      </p>
                    </div>
                  </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 bg-white border border-border rounded flex items-center justify-center text-muted-foreground text-xs">
          Sol taraftan bir onay seçin
        </div>
      )}
    </div>
  );
}

