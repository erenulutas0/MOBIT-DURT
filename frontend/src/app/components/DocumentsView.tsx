import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  ChevronDown,
  ClipboardPlus,
  Download,
  Eye,
  Filter,
  Info,
  Search,
  X,
} from "lucide-react";
import {
  ApiDocument,
  ERPTeam,
  ERPUser,
  createTaskFromTenderDocument,
  displayStatus,
  downloadBlob,
  fileType,
  formatBytes,
  getDocuments,
  getERPOverview,
  getTenderDocumentBlob,
  openBlob,
} from "../api";

type Doc = {
  id: string;
  apiId: number;
  filename: string;
  type: string;
  size: string;
  branch: string;
  org: string;
  tenderId: string;
  year: number;
  status: "classified" | "processing" | "unclassified";
  source: string;
  uploaded: string;
};

const statusBadge = {
  classified: { label: "Classified", bg: "var(--success-bg)", color: "var(--success)", border: "#a7f3d0" },
  processing: { label: "Processing", bg: "#fffbeb", color: "#d97706", border: "#fde68a" },
  unclassified: { label: "Unclassified", bg: "#fff1f2", color: "#e11d48", border: "#fecdd3" },
};

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer" style={{ border: "1px solid var(--border)", background: "var(--card)", position: "relative" }}>
      <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "Inter, sans-serif" }}>{label}:</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          background: "transparent",
          border: "none",
          outline: "none",
          fontSize: 12,
          fontFamily: "Inter, sans-serif",
          color: "var(--foreground)",
          cursor: "pointer",
          appearance: "none",
          paddingRight: 16,
        }}
      >
        <option value="">All</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
      <ChevronDown size={11} style={{ color: "var(--muted-foreground)", position: "absolute", right: 8, pointerEvents: "none" }} />
    </div>
  );
}

export function DocumentsView() {
  const [apiDocs, setApiDocs] = useState<ApiDocument[]>([]);
  const [error, setError] = useState("");
  const [yearFilter, setYearFilter] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [fileActionId, setFileActionId] = useState<number | null>(null);
  const [taskDocument, setTaskDocument] = useState<Doc | null>(null);
  const [users, setUsers] = useState<ERPUser[]>([]);
  const [teams, setTeams] = useState<ERPTeam[]>([]);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskPriority, setTaskPriority] = useState("normal");
  const [taskDeadline, setTaskDeadline] = useState("");
  const [assigneeUserId, setAssigneeUserId] = useState("");
  const [assigneeTeamId, setAssigneeTeamId] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);

  useEffect(() => {
    getDocuments().then(setApiDocs).catch((err) => setError(err.message));
  }, []);

  const allDocs = useMemo<Doc[]>(() => apiDocs.map((doc) => ({
    id: String(doc.id),
    apiId: doc.id,
    filename: doc.stored_filename || doc.original_filename || `document-${doc.id}`,
    type: fileType(doc),
    size: formatBytes(doc.file_size),
    branch: doc.internal_unit || "-",
    org: doc.organization || "-",
    tenderId: doc.tender_id,
    year: doc.year || new Date(doc.timestamp).getFullYear(),
    status: displayStatus(doc.status),
    source: doc.source,
    uploaded: new Date(doc.timestamp).toLocaleDateString("tr-TR"),
  })), [apiDocs]);

  const years = Array.from(new Set(allDocs.map((doc) => String(doc.year)))).sort();
  const branches = Array.from(new Set(allDocs.map((doc) => doc.branch))).sort();
  const orgs = Array.from(new Set(allDocs.map((doc) => doc.org))).sort();

  const filtered = allDocs.filter((d) => {
    if (yearFilter && d.year.toString() !== yearFilter) return false;
    if (branchFilter && d.branch !== branchFilter) return false;
    if (orgFilter && d.org !== orgFilter) return false;
    if (statusFilter && d.status !== statusFilter) return false;
    if (search && !d.filename.toLowerCase().includes(search.toLowerCase()) && !d.tenderId.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  async function handleFile(doc: Doc, download: boolean) {
    setError("");
    setFileActionId(doc.apiId);
    try {
      const blob = await getTenderDocumentBlob(doc.apiId, download);
      if (download) downloadBlob(blob, doc.filename);
      else openBlob(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "File could not be opened");
    } finally {
      setFileActionId(null);
    }
  }

  async function openTaskDialog(doc: Doc) {
    setError("");
    setTaskDocument(doc);
    setTaskTitle(`${doc.tenderId} - ${doc.filename}`);
    setTaskDescription("");
    setTaskPriority("normal");
    setTaskDeadline("");
    setAssigneeUserId("");
    setAssigneeTeamId("");
    try {
      const overview = await getERPOverview();
      setUsers(overview.users.filter((user) => user.role !== "admin"));
      setTeams(overview.teams);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ERP assignees could not be loaded");
    }
  }

  async function submitTask() {
    if (!taskDocument) return;
    setError("");
    setTaskSaving(true);
    try {
      await createTaskFromTenderDocument(taskDocument.apiId, {
        title: taskTitle,
        description: taskDescription || null,
        assignee_user_ids: assigneeUserId ? [Number(assigneeUserId)] : [],
        assignee_team_ids: assigneeTeamId ? [Number(assigneeTeamId)] : [],
        priority: taskPriority,
        deadline_at: taskDeadline ? new Date(taskDeadline).toISOString() : null,
      });
      setTaskDocument(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Task could not be created");
    } finally {
      setTaskSaving(false);
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", background: "var(--card)", flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Documents</h1>
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 1 }}>
            {filtered.length} of {allDocs.length} documents
          </p>
          {error && <p style={{ fontSize: 12, color: "var(--warning)", marginTop: 2 }}>{error}</p>}
        </div>
      </div>

      {/* Filters */}
      <div
        className="px-5 py-3 flex items-center gap-2 flex-wrap"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--card)", flexShrink: 0 }}
      >
        <Filter size={13} style={{ color: "var(--muted-foreground)" }} />
        <FilterSelect label="Year" value={yearFilter} options={years} onChange={setYearFilter} />
        <FilterSelect label="Branch" value={branchFilter} options={branches} onChange={setBranchFilter} />
        <FilterSelect label="Org" value={orgFilter} options={orgs} onChange={setOrgFilter} />
        <FilterSelect label="Status" value={statusFilter} options={["classified", "processing", "unclassified"]} onChange={setStatusFilter} />

        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded ml-auto" style={{ border: "1px solid var(--border)", background: "var(--input-background)" }}>
          <Search size={12} style={{ color: "var(--muted-foreground)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search filename / tender ID…"
            style={{ background: "transparent", border: "none", outline: "none", fontSize: 12, fontFamily: "Inter, sans-serif", width: 200, color: "var(--foreground)" }}
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto flex-1">
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--muted)" }}>
              {["Filename", "Type", "Size", "Branch", "Organization", "Tender ID", "Status", "Source", "Uploaded", "Actions"].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "8px 14px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--muted-foreground)",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                    position: "sticky",
                    top: 0,
                    background: "var(--muted)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={10} style={{ textAlign: "center", padding: "40px 0", color: "var(--muted-foreground)", fontSize: 13 }}>
                  No documents match the current filters.
                </td>
              </tr>
            ) : (
              filtered.map((doc, i) => {
                const badge = statusBadge[doc.status];
                return (
                  <tr
                    key={doc.id}
                    style={{
                      background: i % 2 === 0 ? "var(--card)" : "var(--background)",
                      borderBottom: "1px solid var(--border)",
                    }}
                  >
                    <td style={{ padding: "9px 14px", maxWidth: 220 }}>
                      <span style={{ fontWeight: 500, color: "var(--foreground)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {doc.filename}
                      </span>
                    </td>
                    <td style={{ padding: "9px 14px", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--muted-foreground)" }}>{doc.type}</td>
                    <td style={{ padding: "9px 14px", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--muted-foreground)" }}>{doc.size}</td>
                    <td style={{ padding: "9px 14px" }}>
                      <span className="px-2 py-0.5 rounded" style={{ background: "var(--secondary)", color: "var(--primary)", fontSize: 11 }}>{doc.branch}</span>
                    </td>
                    <td style={{ padding: "9px 14px", color: "var(--foreground)" }}>{doc.org}</td>
                    <td style={{ padding: "9px 14px", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--foreground)" }}>{doc.tenderId}</td>
                    <td style={{ padding: "9px 14px" }}>
                      <span
                        className="px-2 py-0.5 rounded"
                        style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, fontSize: 11 }}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td style={{ padding: "9px 14px", color: "var(--muted-foreground)" }}>{doc.source}</td>
                    <td style={{ padding: "9px 14px", fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{doc.uploaded}</td>
                    <td style={{ padding: "9px 14px" }}>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={fileActionId === doc.apiId}
                          onClick={() => handleFile(doc, true)}
                          title="Download"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 2 }}
                        >
                          <Download size={14} />
                        </button>
                        <button
                          type="button"
                          disabled={fileActionId === doc.apiId}
                          onClick={() => handleFile(doc, false)}
                          title="Open / Preview"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 2 }}
                        >
                          <Eye size={14} />
                        </button>
                        <button title="Metadata" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 2 }}>
                          <Info size={14} />
                        </button>
                        <button title="Open Obsidian" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 2 }}>
                          <BookOpen size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openTaskDialog(doc)}
                          title="Create ERP task from document"
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--primary)", padding: 2 }}
                        >
                          <ClipboardPlus size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {taskDocument && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: "rgba(15, 23, 42, 0.48)", zIndex: 80 }}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setTaskDocument(null);
          }}
        >
          <div style={{ width: 520, maxWidth: "calc(100vw - 32px)", background: "var(--card)", border: "1px solid var(--border)", borderRadius: 6 }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600 }}>Create ERP task</div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>{taskDocument.filename}</div>
              </div>
              <button type="button" onClick={() => setTaskDocument(null)} title="Close" style={{ background: "none", border: "none", cursor: "pointer" }}>
                <X size={17} />
              </button>
            </div>
            <div className="p-5 grid gap-3">
              <label style={{ fontSize: 12 }}>
                Task title
                <input className="w-full mt-1 px-3 py-2" value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} style={{ border: "1px solid var(--border)", borderRadius: 4 }} />
              </label>
              <label style={{ fontSize: 12 }}>
                Description
                <textarea className="w-full mt-1 px-3 py-2" rows={3} value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} style={{ border: "1px solid var(--border)", borderRadius: 4, resize: "vertical" }} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label style={{ fontSize: 12 }}>
                  Employee
                  <select className="w-full mt-1 px-3 py-2" value={assigneeUserId} onChange={(event) => setAssigneeUserId(event.target.value)} style={{ border: "1px solid var(--border)", borderRadius: 4 }}>
                    <option value="">Unassigned</option>
                    {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 12 }}>
                  Team
                  <select className="w-full mt-1 px-3 py-2" value={assigneeTeamId} onChange={(event) => setAssigneeTeamId(event.target.value)} style={{ border: "1px solid var(--border)", borderRadius: 4 }}>
                    <option value="">No team</option>
                    {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label style={{ fontSize: 12 }}>
                  Priority
                  <select className="w-full mt-1 px-3 py-2" value={taskPriority} onChange={(event) => setTaskPriority(event.target.value)} style={{ border: "1px solid var(--border)", borderRadius: 4 }}>
                    <option value="low">Low</option>
                    <option value="normal">Normal</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </label>
                <label style={{ fontSize: 12 }}>
                  Deadline
                  <input className="w-full mt-1 px-3 py-2" type="datetime-local" value={taskDeadline} onChange={(event) => setTaskDeadline(event.target.value)} style={{ border: "1px solid var(--border)", borderRadius: 4 }} />
                </label>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4" style={{ borderTop: "1px solid var(--border)" }}>
              <button type="button" onClick={() => setTaskDocument(null)} className="px-4 py-2" style={{ border: "1px solid var(--border)", borderRadius: 4, background: "var(--card)" }}>Cancel</button>
              <button type="button" disabled={taskSaving || taskTitle.trim().length < 3} onClick={submitTask} className="px-4 py-2" style={{ border: 0, borderRadius: 4, background: "var(--primary)", color: "white" }}>
                {taskSaving ? "Creating..." : "Create task"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
