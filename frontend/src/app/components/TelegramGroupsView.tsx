import { MessageSquare, AlertTriangle, CheckCircle, FileText, Clock, Settings, ChevronRight } from "lucide-react";

type TelegramGroup = {
  id: string;
  name: string;
  branch: string | null;
  org: string | null;
  tenderId: string | null;
  docCount: number;
  lastActivity: string;
  status: "active" | "needs-setup" | "inactive";
};

const groups: TelegramGroup[] = [
  {
    id: "g1",
    name: "MOBIT İhale Grubu",
    branch: "MOBIT",
    org: "BEDAŞ",
    tenderId: "BEDAŞ-2026-001",
    docCount: 124,
    lastActivity: "2 min ago",
    status: "active",
  },
  {
    id: "g2",
    name: "ENCON Teknik",
    branch: "ENCON",
    org: "TEİAŞ",
    tenderId: "TEİAŞ-2026-005",
    docCount: 87,
    lastActivity: "1h ago",
    status: "active",
  },
  {
    id: "g3",
    name: "MOBIT AYEDAŞ Koordinasyon",
    branch: "MOBIT",
    org: "AYEDAŞ",
    tenderId: "AYEDAŞ-2026-001",
    docCount: 43,
    lastActivity: "3h ago",
    status: "active",
  },
  {
    id: "g4",
    name: "Genel Döküman Paylaşım",
    branch: null,
    org: null,
    tenderId: null,
    docCount: 17,
    lastActivity: "5h ago",
    status: "needs-setup",
  },
  {
    id: "g5",
    name: "TEİAŞ Çizim Grubu",
    branch: "ENCON",
    org: "TEİAŞ",
    tenderId: null,
    docCount: 31,
    lastActivity: "1d ago",
    status: "needs-setup",
  },
  {
    id: "g6",
    name: "Eski TEDAŞ Arşiv",
    branch: "MOBIT",
    org: "TEDAŞ",
    tenderId: "TEDAŞ-2025-003",
    docCount: 208,
    lastActivity: "12d ago",
    status: "inactive",
  },
  {
    id: "g7",
    name: "Yeni İhale Bildirimleri",
    branch: null,
    org: null,
    tenderId: null,
    docCount: 0,
    lastActivity: "Never",
    status: "needs-setup",
  },
  {
    id: "g8",
    name: "ENERJI Sözleşme Grubu",
    branch: "ENERJI A.Ş.",
    org: "BEDAŞ",
    tenderId: "BEDAŞ-2026-003",
    docCount: 55,
    lastActivity: "6h ago",
    status: "active",
  },
];

const statusConfig = {
  active: { label: "Active", bg: "var(--success-bg)", color: "var(--success)", border: "#a7f3d0", icon: <CheckCircle size={11} /> },
  "needs-setup": { label: "Needs setup", bg: "var(--warning-bg)", color: "var(--warning)", border: "var(--warning-border)", icon: <AlertTriangle size={11} /> },
  inactive: { label: "Inactive", bg: "var(--muted)", color: "var(--muted-foreground)", border: "var(--border)", icon: null },
};

export function TelegramGroupsView() {
  const needsSetup = groups.filter((g) => g.status === "needs-setup");

  return (
    <div className="p-5 flex flex-col gap-5" style={{ fontFamily: "Inter, sans-serif" }}>
      <div>
        <h1 style={{ fontSize: 16, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Telegram Group Bindings</h1>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>
          {groups.length} connected groups · {groups.filter((g) => g.status === "active").length} active
        </p>
      </div>

      {/* Warning banner */}
      {needsSetup.length > 0 && (
        <div className="flex items-start gap-3 px-4 py-3 rounded" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
          <AlertTriangle size={16} style={{ color: "var(--warning)", marginTop: 1, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--warning)" }}>
              {needsSetup.length} group{needsSetup.length !== 1 ? "s" : ""} require setup
            </div>
            <div style={{ fontSize: 12, color: "#92400e", marginTop: 1 }}>
              Documents from unbound groups are stored as unclassified. Assign a branch and tender to begin automatic classification.
            </div>
          </div>
        </div>
      )}

      {/* Groups table */}
      <div className="rounded overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ background: "var(--muted)" }}>
              {["Group", "Branch", "Organization", "Tender ID", "Documents", "Last Activity", "Status", ""].map((h) => (
                <th
                  key={h}
                  style={{
                    textAlign: "left",
                    padding: "9px 16px",
                    fontSize: 11,
                    fontWeight: 600,
                    color: "var(--muted-foreground)",
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    whiteSpace: "nowrap",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((g, i) => {
              const cfg = statusConfig[g.status];
              return (
                <tr
                  key={g.id}
                  style={{
                    background: i % 2 === 0 ? "var(--card)" : "var(--background)",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <td style={{ padding: "11px 16px" }}>
                    <div className="flex items-center gap-2">
                      <div
                        className="flex items-center justify-center rounded"
                        style={{ width: 28, height: 28, background: "var(--secondary)", flexShrink: 0 }}
                      >
                        <MessageSquare size={13} style={{ color: "var(--primary)" }} />
                      </div>
                      <span style={{ fontWeight: 500, color: "var(--foreground)" }}>{g.name}</span>
                    </div>
                  </td>
                  <td style={{ padding: "11px 16px" }}>
                    {g.branch ? (
                      <span className="px-2 py-0.5 rounded" style={{ background: "var(--secondary)", color: "var(--primary)", fontSize: 11 }}>
                        {g.branch}
                      </span>
                    ) : (
                      <span style={{ color: "var(--muted-foreground)", fontStyle: "italic", fontSize: 11 }}>Not set</span>
                    )}
                  </td>
                  <td style={{ padding: "11px 16px", color: g.org ? "var(--foreground)" : "var(--muted-foreground)", fontStyle: g.org ? "normal" : "italic", fontSize: g.org ? 12 : 11 }}>
                    {g.org || "Not set"}
                  </td>
                  <td style={{ padding: "11px 16px" }}>
                    {g.tenderId ? (
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--foreground)" }}>{g.tenderId}</span>
                    ) : (
                      <span style={{ color: "var(--muted-foreground)", fontStyle: "italic", fontSize: 11 }}>Not assigned</span>
                    )}
                  </td>
                  <td style={{ padding: "11px 16px" }}>
                    <div className="flex items-center gap-1.5">
                      <FileText size={12} style={{ color: "var(--muted-foreground)" }} />
                      <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 12, color: "var(--foreground)", fontWeight: 500 }}>{g.docCount}</span>
                    </div>
                  </td>
                  <td style={{ padding: "11px 16px" }}>
                    <div className="flex items-center gap-1.5">
                      <Clock size={11} style={{ color: "var(--muted-foreground)" }} />
                      <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>{g.lastActivity}</span>
                    </div>
                  </td>
                  <td style={{ padding: "11px 16px" }}>
                    <span
                      className="flex items-center gap-1 px-2 py-0.5 rounded"
                      style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, fontSize: 11, display: "inline-flex" }}
                    >
                      {cfg.icon}
                      {cfg.label}
                    </span>
                  </td>
                  <td style={{ padding: "11px 16px" }}>
                    <button
                      className="flex items-center gap-1 px-2.5 py-1 rounded"
                      style={{
                        background: g.status === "needs-setup" ? "var(--primary)" : "var(--muted)",
                        color: g.status === "needs-setup" ? "#fff" : "var(--muted-foreground)",
                        border: "none",
                        fontSize: 11,
                        cursor: "pointer",
                        fontFamily: "Inter, sans-serif",
                        fontWeight: 500,
                      }}
                    >
                      {g.status === "needs-setup" ? (
                        <>Configure <ChevronRight size={10} /></>
                      ) : (
                        <Settings size={12} />
                      )}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
