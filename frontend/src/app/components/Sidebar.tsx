import {
  LayoutDashboard,
  FileText,
  FolderTree,
  Upload,
  MessageSquare,
  BookOpen,
  Settings,
  Briefcase,
  ChevronRight,
  Home,
  UserRound,
  ListChecks,
  Cpu,
  Send,
} from "lucide-react";

type NavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
};

const erpItems: NavItem[] = [
  { id: "erp", label: "Genel Bakış", icon: <LayoutDashboard size={15} /> },
  { id: "erp-people", label: "Çalışanlar", icon: <UserRound size={15} /> },
  { id: "erp-tasks", label: "Görevler", icon: <ListChecks size={15} /> },
  { id: "erp-help", label: "Mesajlar", icon: <MessageSquare size={15} /> },
];

const tenderItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={15} /> },
  { id: "telegram", label: "Telegram Grupları", icon: <Send size={15} /> },
  { id: "documents", label: "Belgeler", icon: <FileText size={15} /> },
  { id: "folder-tree", label: "Klasör Ağacı", icon: <FolderTree size={15} /> },
  { id: "upload", label: "Yükleme", icon: <Upload size={15} /> },
  { id: "obsidian", label: "Obsidian Demo", icon: <BookOpen size={15} /> },
  { id: "tenders", label: "İhale Detayı", icon: <Briefcase size={15} /> },
  { id: "settings", label: "AI Çıkarımı", icon: <Cpu size={15} /> },
];

interface SidebarProps {
  activeView: string;
  activeModule: "home" | "erp" | "tender";
  sessionRole: "admin" | "user";
  onHome: () => void;
  onNavigate: (id: string) => void;
}

export function Sidebar({ activeView, activeModule, sessionRole, onHome, onNavigate }: SidebarProps) {
  const effectiveErpItems = sessionRole === "admin"
    ? erpItems
    : erpItems.map((item) => item.id === "erp-people" ? { ...item, label: "Profil" } : item);
  const navSections = activeModule === "erp"
    ? [{ title: "ERP-TAKIP", items: effectiveErpItems }]
    : activeModule === "tender"
      ? [{ title: "Tender Hub", items: tenderItems }]
      : [];

  return (
    <aside
      className="flex flex-col h-full"
      style={{
        width: 220,
        minWidth: 220,
        background: "var(--sidebar)",
        borderRight: "1px solid var(--sidebar-border)",
      }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2 px-3"
        style={{ borderBottom: "1px solid var(--sidebar-border)" }}
      >
        <div style={{ height: 40, display: "flex", alignItems: "center", minWidth: 0 }}>
          <div
            style={{
              color: "#f1f5f9",
              fontSize: 13,
              fontWeight: 800,
              lineHeight: 1.2,
              fontFamily: "Inter, sans-serif",
            }}
          >
            DocsBot <span style={{ color: "#2dd4bf" }}>Ops</span>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        <button
          onClick={onHome}
          className="flex items-center gap-2.5 w-full rounded px-3 py-2 text-left transition-colors"
          style={{
            background: activeView === "home" ? "var(--sidebar-accent)" : "transparent",
            color: activeView === "home" ? "var(--sidebar-accent-foreground)" : "var(--sidebar-foreground)",
            fontSize: 12,
            fontFamily: "Inter, sans-serif",
            fontWeight: activeView === "home" ? 500 : 400,
            border: "none",
            cursor: "pointer",
            marginBottom: 12,
          }}
        >
          <Home size={14} style={{ opacity: activeView === "home" ? 1 : 0.65 }} />
          <span className="flex-1">Ana Sayfa</span>
          {activeView === "home" && <ChevronRight size={12} style={{ opacity: 0.5 }} />}
        </button>
        {navSections.map((section) => (
          <div key={section.title} style={{ marginBottom: 10 }}>
            <div style={{ color: "#64748b", fontSize: 10, fontWeight: 700, padding: "8px 8px 6px", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "Inter, sans-serif" }}>
              {section.title}
            </div>
            {section.items.map((item) => {
              const active = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className="flex items-center gap-2.5 w-full rounded px-3 py-2 text-left transition-colors"
                  style={{
                    background: active ? "rgba(13, 148, 136, 0.18)" : "transparent",
                    color: active ? "var(--sidebar-accent-foreground)" : "var(--sidebar-foreground)",
                    fontSize: 12,
                    fontFamily: "Inter, sans-serif",
                    fontWeight: active ? 500 : 400,
                    border: "none",
                    cursor: "pointer",
                    marginBottom: 1,
                  }}
                >
                  <span style={{ opacity: active ? 1 : 0.65 }}>{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {item.id === "erp-help" && activeModule === "erp" && (
                    <span style={{ background: "#14b8a6", color: "#fff", fontSize: 10, borderRadius: 999, minWidth: 16, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>3</span>
                  )}
                  {item.id === "settings" && activeModule === "tender" && (
                    <span style={{ background: "#14b8a6", color: "#fff", fontSize: 10, borderRadius: 999, minWidth: 16, height: 16, display: "inline-flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>AI</span>
                  )}
                  {active && <ChevronRight size={12} style={{ opacity: 0.5 }} />}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div
        className="px-4 py-3"
        style={{ borderTop: "1px solid var(--sidebar-border)" }}
      >
        <div className="flex items-center gap-2">
          <div style={{ width: 24, height: 24, borderRadius: 999, background: "#0d9488", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800 }}>AY</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 11, color: "#e2e8f0", fontWeight: 700, fontFamily: "Inter, sans-serif" }}>Ahmet Yılmaz</div>
            <div style={{ fontSize: 10, color: "#64748b", fontFamily: "Inter, sans-serif" }}>v1.5.0 · Admin</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
