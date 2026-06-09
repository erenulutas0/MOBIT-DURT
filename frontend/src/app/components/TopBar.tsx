import { Search, ChevronDown, Wifi, Bell, User } from "lucide-react";

interface TopBarProps {
  onSearch?: (q: string) => void;
}

const branches = ["MOBIT", "ENCON", "ENERJI A.Ş.", "TEKNOPARK"];

export function TopBar({ onSearch }: TopBarProps) {
  return (
    <header
      className="flex items-center gap-3 px-5"
      style={{
        height: 52,
        background: "var(--card)",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}
    >
      {/* Search */}
      <div className="flex items-center gap-2 flex-1 max-w-sm rounded px-3 py-1.5" style={{ background: "var(--input-background)", border: "1px solid var(--border)" }}>
        <Search size={14} style={{ color: "var(--muted-foreground)" }} />
        <input
          type="text"
          placeholder="Search tenders, companies, documents…"
          onChange={(e) => onSearch?.(e.target.value)}
          style={{
            background: "transparent",
            border: "none",
            outline: "none",
            fontSize: 13,
            color: "var(--foreground)",
            width: "100%",
            fontFamily: "Inter, sans-serif",
          }}
        />
      </div>

      <div className="flex-1" />

      {/* Branch selector */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer" style={{ border: "1px solid var(--border)", background: "var(--card)", fontSize: 13, fontFamily: "Inter, sans-serif", color: "var(--foreground)" }}>
        <div className="w-2 h-2 rounded-full" style={{ background: "var(--primary)", flexShrink: 0 }} />
        <span style={{ fontWeight: 500 }}>MOBIT</span>
        <ChevronDown size={12} style={{ color: "var(--muted-foreground)" }} />
      </div>

      {/* Bot status */}
      <div className="flex items-center gap-1.5 px-3 py-1 rounded" style={{ background: "var(--success-bg)", border: "1px solid #a7f3d0", fontSize: 12, fontFamily: "Inter, sans-serif" }}>
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--success)" }} />
        <span style={{ color: "var(--success)", fontWeight: 500 }}>Bot online</span>
      </div>

      {/* Notifications */}
      <button
        className="flex items-center justify-center rounded p-1.5"
        style={{ background: "transparent", border: "1px solid var(--border)", cursor: "pointer", color: "var(--muted-foreground)" }}
      >
        <Bell size={15} />
      </button>

      {/* User */}
      <div className="flex items-center gap-2 px-2 py-1 rounded cursor-pointer" style={{ border: "1px solid var(--border)" }}>
        <div className="flex items-center justify-center rounded-full" style={{ width: 24, height: 24, background: "var(--primary)", color: "#fff", fontSize: 11, fontWeight: 600 }}>
          A
        </div>
        <span style={{ fontSize: 13, fontFamily: "Inter, sans-serif", fontWeight: 500, color: "var(--foreground)" }}>Admin</span>
      </div>
    </header>
  );
}
