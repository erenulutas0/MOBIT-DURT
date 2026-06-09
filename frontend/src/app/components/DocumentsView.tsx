import { useEffect, useMemo, useState } from "react";
import { Download, Info, BookOpen, Filter, ChevronDown, Search } from "lucide-react";
import { ApiDocument, displayStatus, fileType, formatBytes, getDocuments } from "../api";

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
                        <a href={`/dashboard/files/${doc.apiId}`} title="Download" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 2 }}>
                          <Download size={14} />
                        </a>
                        <button title="Metadata" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 2 }}>
                          <Info size={14} />
                        </button>
                        <button title="Open Obsidian" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 2 }}>
                          <BookOpen size={14} />
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
    </div>
  );
}
