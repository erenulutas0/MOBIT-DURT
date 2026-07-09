import { useEffect, useMemo, useState } from "react";
import { FileText, Briefcase, MessageSquare, AlertTriangle, ArrowUpRight, Clock, CheckCircle, Loader } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { ApiDocument, ApiTender, getDocuments, getTenders } from "../api";

const chartColors = ["#0d7377", "#14a085", "#3b82f6", "#8b5cf6", "#e2e8f0"];

function KpiCard({ label, value, change, icon, color }: { label: string; value: string; change: string; icon: React.ReactNode; color: string }) {
  return (
    <div
      className="rounded p-4 flex flex-col gap-3"
      style={{ background: "var(--card)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-start justify-between">
        <div
          className="flex items-center justify-center rounded"
          style={{ width: 34, height: 34, background: `${color}18`, color }}
        >
          {icon}
        </div>
        <ArrowUpRight size={13} style={{ color: "var(--muted-foreground)", marginTop: 2 }} />
      </div>
      <div>
        <div style={{ fontSize: 24, fontWeight: 600, lineHeight: 1, color: "var(--foreground)", fontFamily: "Inter, sans-serif" }}>
          {value}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 3, fontFamily: "Inter, sans-serif" }}>
          {label}
        </div>
      </div>
      <div style={{ fontSize: 11, color, fontFamily: "Inter, sans-serif" }}>
        {change}
      </div>
    </div>
  );
}

const customTooltipStyle = {
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  fontSize: 12,
  fontFamily: "Inter, sans-serif",
  padding: "6px 10px",
};

export function DashboardView() {
  const [documents, setDocuments] = useState<ApiDocument[]>([]);
  const [tenders, setTenders] = useState<ApiTender[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([getDocuments(), getTenders()])
      .then(([docs, tenderList]) => {
        setDocuments(docs);
        setTenders(tenderList);
      })
      .catch((err) => setError(err.message));
  }, []);

  const unclassified = documents.filter((doc) => doc.status === "failed" || doc.document_type === "unknown").length;
  const telegramGroups = new Set(documents.filter((doc) => doc.source === "telegram").map((doc) => doc.tender_id)).size;
  const kpiCards = [
    { label: "Total Documents", value: String(documents.length), change: "Live from backend", icon: <FileText size={18} />, color: "var(--primary)" },
    { label: "Active Tenders", value: String(tenders.length), change: "Created workspaces", icon: <Briefcase size={18} />, color: "#2563eb" },
    { label: "Telegram Groups", value: String(telegramGroups), change: "Bound by tender", icon: <MessageSquare size={18} />, color: "#7c3aed" },
    { label: "Unclassified Files", value: String(unclassified), change: "Needs review", icon: <AlertTriangle size={18} />, color: "var(--warning)" },
  ];

  const branchData = useMemo(() => {
    const grouped = new Map<string, { name: string; docs: number; tenders: Set<string> }>();
    documents.forEach((doc) => {
      const name = doc.internal_unit || "UNASSIGNED";
      const row = grouped.get(name) || { name, docs: 0, tenders: new Set<string>() };
      row.docs += 1;
      row.tenders.add(doc.tender_id);
      grouped.set(name, row);
    });
    return Array.from(grouped.values()).map((row) => ({ name: row.name, docs: row.docs, tenders: row.tenders.size })).slice(0, 6);
  }, [documents]);

  const orgData = useMemo(() => {
    const grouped = new Map<string, number>();
    documents.forEach((doc) => grouped.set(doc.organization || "Unknown", (grouped.get(doc.organization || "Unknown") || 0) + 1));
    return Array.from(grouped.entries()).slice(0, 5).map(([name, value], index) => ({ name, value, color: chartColors[index] || "#94a3b8" }));
  }, [documents]);

  const statusData = useMemo(() => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((name) => ({ name, classified: 0, unclassified: 0, processing: 0 }));
    documents.forEach((doc) => {
      const day = new Date(doc.timestamp).getDay();
      const index = day === 0 ? 6 : day - 1;
      if (doc.status === "received") days[index].processing += 1;
      else if (doc.status === "failed" || doc.document_type === "unknown") days[index].unclassified += 1;
      else days[index].classified += 1;
    });
    return days;
  }, [documents]);

  const activityFeed = documents.slice(0, 7).map((doc) => ({
    id: doc.id,
    text: `${doc.tender_id} - ${doc.stored_filename || doc.original_filename || "document"} stored from ${doc.source}`,
    time: new Date(doc.timestamp).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
    icon: doc.status === "received" ? <Loader size={13} /> : <CheckCircle size={13} />,
    color: doc.status === "failed" ? "var(--warning)" : "var(--primary)",
  }));

  return (
    <div className="flex flex-col gap-5 p-5" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Page title */}
      <div>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Overview</h1>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginTop: 2 }}>
          DocsBot Tender Hub · Live workspace · {new Date().toLocaleDateString("tr-TR", { day: "2-digit", month: "short", year: "numeric" })}
        </p>
        {error && <p style={{ fontSize: 12, color: "var(--warning)", marginTop: 4 }}>{error}</p>}
      </div>

      {/* KPI Cards */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
        {kpiCards.map((card) => (
          <KpiCard key={card.label} {...card} />
        ))}
      </div>

      {/* Main row */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 320px" }}>
        {/* Processing status chart */}
        <div className="rounded p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: "var(--foreground)" }}>
            Document Processing — Last 7 Days
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={statusData} barSize={10} barGap={2}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "Inter, sans-serif", fill: "#6b7280" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fontFamily: "Inter, sans-serif", fill: "#6b7280" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={customTooltipStyle} cursor={{ fill: "#f0f1f4" }} />
              <Bar dataKey="classified" stackId="a" fill="#0d7377" name="Classified" radius={[0, 0, 0, 0]} />
              <Bar dataKey="processing" stackId="a" fill="#14a085" name="Processing" radius={[0, 0, 0, 0]} />
              <Bar dataKey="unclassified" stackId="a" fill="#fcd34d" name="Unclassified" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          <div className="flex items-center gap-4 mt-2">
            {[["#0d7377", "Classified"], ["#14a085", "Processing"], ["#fcd34d", "Unclassified"]].map(([color, label]) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Activity feed */}
        <div className="rounded p-4 flex flex-col" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: "var(--foreground)" }}>
            Recent Activity
          </div>
          <div className="flex flex-col gap-0" style={{ overflowY: "auto", maxHeight: 240 }}>
            {(activityFeed.length ? activityFeed : [{ id: 0, text: "No recent documents yet", time: "-", icon: <FileText size={13} />, color: "var(--muted-foreground)" }]).map((item, i) => (
              <div
                key={item.id}
                className="flex items-start gap-2.5 py-2"
                style={{ borderBottom: i < activityFeed.length - 1 ? "1px solid var(--border)" : "none" }}
              >
                <div
                  className="flex items-center justify-center rounded-full mt-0.5"
                  style={{ width: 22, height: 22, background: `${item.color}18`, color: item.color, flexShrink: 0 }}
                >
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 12, color: "var(--foreground)", lineHeight: 1.4 }}>{item.text}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <Clock size={10} style={{ color: "var(--muted-foreground)" }} />
                    <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{item.time}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Second row */}
      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {/* Documents by branch */}
        <div className="rounded p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: "var(--foreground)" }}>
            Documents by Company Branch
          </div>
          <div className="flex flex-col gap-3">
            {branchData.map((b) => {
              const pct = Math.round((b.docs / 2841) * 100);
              return (
                <div key={b.name}>
                  <div className="flex justify-between items-center mb-1">
                    <span style={{ fontSize: 12, fontWeight: 500, color: "var(--foreground)" }}>{b.name}</span>
                    <div className="flex items-center gap-3">
                      <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{b.tenders} tenders</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--foreground)", fontFamily: "JetBrains Mono, monospace", width: 36, textAlign: "right" }}>{b.docs.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="rounded-full overflow-hidden" style={{ height: 6, background: "var(--muted)" }}>
                    <div
                      className="rounded-full"
                      style={{ width: `${pct}%`, height: "100%", background: "var(--primary)", transition: "width 0.6s ease" }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Documents by tender org */}
        <div className="rounded p-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14, color: "var(--foreground)" }}>
            Documents by Tender Organization
          </div>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={140} height={140}>
              <PieChart>
                <Pie data={orgData} cx={65} cy={65} innerRadius={42} outerRadius={65} dataKey="value" strokeWidth={0}>
                  {orgData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2 flex-1">
              {orgData.map((d) => (
                <div key={d.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                    <span style={{ fontSize: 12, color: "var(--foreground)" }}>{d.name}</span>
                  </div>
                  <span style={{ fontSize: 12, fontFamily: "JetBrains Mono, monospace", color: "var(--muted-foreground)" }}>
                    {d.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
