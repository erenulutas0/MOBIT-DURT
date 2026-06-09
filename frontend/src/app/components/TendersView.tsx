import { useState } from "react";
import { Briefcase, FileText, Calendar, ChevronRight, Search } from "lucide-react";

type Tender = {
  id: string;
  displayId: string;
  branch: string;
  org: string;
  year: number;
  docCount: number;
  status: "active" | "archived" | "draft";
  created: string;
  lastUpdate: string;
  description: string;
};

const tenders: Tender[] = [
  { id: "t1", displayId: "BEDAŞ-2026-20260609-001", branch: "MOBIT", org: "BEDAŞ", year: 2026, docCount: 7, status: "active", created: "2026-06-09", lastUpdate: "2026-06-09", description: "Elektrik dağıtım altyapısı yenileme ihalesi — BEDAŞ bölgesi Q3 2026" },
  { id: "t2", displayId: "BEDAŞ-2026-20260505-002", branch: "MOBIT", org: "BEDAŞ", year: 2026, docCount: 11, status: "active", created: "2026-05-05", lastUpdate: "2026-06-01", description: "OG/AG şebeke kablolaması yenileme projesi" },
  { id: "t3", displayId: "TEİAŞ-2026-20260512-005", branch: "ENCON", org: "TEİAŞ", year: 2026, docCount: 18, status: "active", created: "2026-05-12", lastUpdate: "2026-06-07", description: "380kV GIS kesici temin ve montajı" },
  { id: "t4", displayId: "AYEDAŞ-2026-20260420-001", branch: "MOBIT", org: "AYEDAŞ", year: 2026, docCount: 5, status: "active", created: "2026-04-20", lastUpdate: "2026-05-18", description: "Sayaç okuma sistemi altyapısı modernizasyonu" },
  { id: "t5", displayId: "BEDAŞ-2025-20251203-002", branch: "MOBIT", org: "BEDAŞ", year: 2025, docCount: 9, status: "archived", created: "2025-12-03", lastUpdate: "2026-01-15", description: "Trafo merkezi bakım-onarım ihalesi" },
  { id: "t6", displayId: "TEİAŞ-2025-20251018-001", branch: "ENCON", org: "TEİAŞ", year: 2025, docCount: 22, status: "archived", created: "2025-10-18", lastUpdate: "2026-02-10", description: "Yüksek gerilim hat yenileme ve genişletme" },
  { id: "t7", displayId: "BEDAŞ-2025-20251112-001", branch: "MOBIT", org: "BEDAŞ", year: 2025, docCount: 14, status: "archived", created: "2025-11-12", lastUpdate: "2025-12-30", description: "Yeraltı kablo hattı tesis projesi" },
];

const statusCfg = {
  active: { label: "Active", bg: "var(--success-bg)", color: "var(--success)", border: "#a7f3d0" },
  archived: { label: "Archived", bg: "var(--muted)", color: "var(--muted-foreground)", border: "var(--border)" },
  draft: { label: "Draft", bg: "var(--info-bg)", color: "var(--info)", border: "#bfdbfe" },
};

export function TendersView() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");

  const filtered = tenders.filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (search && !t.displayId.toLowerCase().includes(search.toLowerCase()) && !t.description.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-5 flex flex-col gap-5" style={{ fontFamily: "Inter, sans-serif" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Tenders</h1>
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>
            {tenders.filter((t) => t.status === "active").length} active · {tenders.filter((t) => t.status === "archived").length} archived
          </p>
        </div>
        <button className="flex items-center gap-1.5 px-4 py-2 rounded" style={{ background: "var(--primary)", color: "#fff", border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer" }}>
          + New Tender
        </button>
      </div>

      {/* Tabs + search */}
      <div className="flex items-center gap-3">
        {["active", "archived"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className="px-3 py-1.5 rounded capitalize"
            style={{
              background: statusFilter === s ? "var(--primary)" : "var(--card)",
              color: statusFilter === s ? "#fff" : "var(--muted-foreground)",
              border: `1px solid ${statusFilter === s ? "var(--primary)" : "var(--border)"}`,
              fontSize: 12,
              cursor: "pointer",
              fontFamily: "Inter, sans-serif",
            }}
          >
            {s}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <Search size={12} style={{ color: "var(--muted-foreground)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search tenders…"
            style={{ background: "transparent", border: "none", outline: "none", fontSize: 12, fontFamily: "Inter, sans-serif", width: 180, color: "var(--foreground)" }}
          />
        </div>
      </div>

      {/* Tender cards */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <div className="rounded p-10 flex flex-col items-center gap-2" style={{ background: "var(--card)", border: "1px solid var(--border)", color: "var(--muted-foreground)" }}>
            <Briefcase size={32} style={{ opacity: 0.3 }} />
            <span style={{ fontSize: 13 }}>No tenders match the current filter.</span>
          </div>
        ) : (
          filtered.map((t) => {
            const badge = statusCfg[t.status];
            return (
              <div
                key={t.id}
                className="rounded px-4 py-3 flex items-center gap-4 cursor-pointer"
                style={{ background: "var(--card)", border: "1px solid var(--border)" }}
              >
                <div className="flex items-center justify-center rounded" style={{ width: 36, height: 36, background: "var(--secondary)", flexShrink: 0 }}>
                  <Briefcase size={16} style={{ color: "var(--primary)" }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "JetBrains Mono, monospace", color: "var(--foreground)" }}>{t.displayId}</span>
                    <span className="px-1.5 py-0.5 rounded" style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, fontSize: 10 }}>{badge.label}</span>
                  </div>
                  <p style={{ fontSize: 12, color: "var(--muted-foreground)", margin: "2px 0 0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description}</p>
                </div>
                <div className="flex items-center gap-5 flex-shrink-0">
                  <div className="text-right">
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Branch</div>
                    <span className="px-1.5 py-0.5 rounded" style={{ background: "var(--secondary)", color: "var(--primary)", fontSize: 11 }}>{t.branch}</span>
                  </div>
                  <div className="text-right">
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Org</div>
                    <span style={{ fontSize: 12, color: "var(--foreground)" }}>{t.org}</span>
                  </div>
                  <div className="text-right">
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Documents</div>
                    <div className="flex items-center gap-1 justify-end">
                      <FileText size={11} style={{ color: "var(--muted-foreground)" }} />
                      <span style={{ fontSize: 13, fontWeight: 600, fontFamily: "JetBrains Mono, monospace", color: "var(--foreground)" }}>{t.docCount}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>Updated</div>
                    <span style={{ fontSize: 11, fontFamily: "JetBrains Mono, monospace", color: "var(--muted-foreground)" }}>{t.lastUpdate}</span>
                  </div>
                  <ChevronRight size={15} style={{ color: "var(--muted-foreground)" }} />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
