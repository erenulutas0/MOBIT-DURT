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
} from "lucide-react";

type NavItem = {
  id: string;
  label: string;
  icon: React.ReactNode;
};

const navItems: NavItem[] = [
  { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard size={16} /> },
  { id: "tenders", label: "Tenders", icon: <Briefcase size={16} /> },
  { id: "documents", label: "Documents", icon: <FileText size={16} /> },
  { id: "folder-tree", label: "Folder Tree", icon: <FolderTree size={16} /> },
  { id: "upload", label: "Upload", icon: <Upload size={16} /> },
  { id: "telegram", label: "Telegram Groups", icon: <MessageSquare size={16} /> },
  { id: "obsidian", label: "Obsidian Vault", icon: <BookOpen size={16} /> },
  { id: "settings", label: "Settings", icon: <Settings size={16} /> },
];

interface SidebarProps {
  activeView: string;
  onNavigate: (id: string) => void;
}

export function Sidebar({ activeView, onNavigate }: SidebarProps) {
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
        className="flex items-center gap-2 px-5 py-4"
        style={{ borderBottom: "1px solid var(--sidebar-border)" }}
      >
        <div
          className="flex items-center justify-center rounded"
          style={{
            width: 30,
            height: 30,
            background: "var(--primary)",
            flexShrink: 0,
          }}
        >
          <FileText size={15} color="#fff" />
        </div>
        <div>
          <div
            style={{
              color: "#f1f5f9",
              fontSize: 13,
              fontWeight: 600,
              lineHeight: 1.2,
              fontFamily: "Inter, sans-serif",
            }}
          >
            DocsBot
          </div>
          <div style={{ color: "#64748b", fontSize: 10, fontFamily: "Inter, sans-serif" }}>
            Tender Hub
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto">
        <div style={{ color: "#4b5563", fontSize: 10, fontWeight: 600, padding: "4px 8px 6px", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "Inter, sans-serif" }}>
          Navigation
        </div>
        {navItems.map((item) => {
          const active = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className="flex items-center gap-2.5 w-full rounded px-3 py-2 text-left transition-colors"
              style={{
                background: active ? "var(--sidebar-accent)" : "transparent",
                color: active ? "var(--sidebar-accent-foreground)" : "var(--sidebar-foreground)",
                fontSize: 13,
                fontFamily: "Inter, sans-serif",
                fontWeight: active ? 500 : 400,
                border: "none",
                cursor: "pointer",
                marginBottom: 1,
              }}
            >
              <span style={{ opacity: active ? 1 : 0.65 }}>{item.icon}</span>
              <span className="flex-1">{item.label}</span>
              {active && <ChevronRight size={12} style={{ opacity: 0.5 }} />}
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div
        className="px-4 py-3"
        style={{ borderTop: "1px solid var(--sidebar-border)" }}
      >
        <div style={{ fontSize: 11, color: "#4b5563", fontFamily: "Inter, sans-serif" }}>
          v1.4.2 · Workspace: MOBIT
        </div>
      </div>
    </aside>
  );
}
