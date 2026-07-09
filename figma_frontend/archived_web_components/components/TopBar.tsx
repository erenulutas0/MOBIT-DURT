import { Search, ChevronDown, Bell, Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { getERPNotifications, markERPNotificationRead } from "../api";
import type { ERPNotification, ERPSession } from "../api";

interface TopBarProps {
  title: string;
  onSearch?: (q: string) => void;
  session: ERPSession | null;
  activeModule: "home" | "erp" | "tender";
  onLogout: () => void;
  onHome: () => void;
}

export function TopBar({ title, onSearch, session, activeModule, onLogout, onHome }: TopBarProps) {
  const moduleLabel = activeModule === "erp" ? "ERP-TAKIP" : activeModule === "tender" ? "Tender Hub" : "Ana Sayfa";
  const userLabel = session ? session.name : "Giris yok";
  const roleLabel = session?.role === "admin" ? "A" : session ? "U" : "?";
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<ERPNotification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    if (!session) {
      setUnreadCount(0);
      setNotifications([]);
      setShowNotifications(false);
      return;
    }
    let alive = true;
    const notificationUserId = session.role === "admin" ? 0 : session.user_id;
    const loadNotifications = () => {
      getERPNotifications(notificationUserId)
        .then((items) => {
          if (alive) {
            setNotifications(items);
            setUnreadCount(items.filter((item) => !item.read_at).length);
          }
        })
        .catch(() => {
          if (alive) {
            setNotifications([]);
            setUnreadCount(0);
          }
        });
    };

    loadNotifications();
    const refreshTimer = window.setInterval(loadNotifications, 4000);
    return () => {
      alive = false;
      window.clearInterval(refreshTimer);
    };
  }, [session, activeModule]);

  const handleReadNotification = async (notificationId: number) => {
    await markERPNotificationRead(notificationId);
    setNotifications((items) => items.map((item) => item.id === notificationId ? { ...item, read_at: new Date().toISOString() } : item));
    setUnreadCount((count) => Math.max(0, count - 1));
  };

  const handleReadAll = async () => {
    const unread = notifications.filter((item) => !item.read_at);
    await Promise.all(unread.map((item) => markERPNotificationRead(item.id)));
    const readAt = new Date().toISOString();
    setNotifications((items) => items.map((item) => ({ ...item, read_at: item.read_at || readAt })));
    setUnreadCount(0);
  };

  return (
    <header
      className="flex items-center gap-3 px-4"
      style={{
        height: 40,
        background: "var(--card)",
        borderBottom: "1px solid var(--border)",
        flexShrink: 0,
      }}
    >
      <h1 style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", minWidth: 260, margin: 0 }}>
        {title}
      </h1>

      <div className="flex-1" />
      <div className="flex items-center gap-2 rounded px-3 py-1.5" style={{ width: 260, background: "var(--input-background)", border: "1px solid var(--border)" }}>
        <Search size={14} style={{ color: "var(--muted-foreground)" }} />
        <input
          type="text"
          placeholder="Ara... (Ctrl+K)"
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
      <button
        onClick={onHome}
        className="rounded px-3 py-1.5"
        style={{ border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", fontSize: 12, cursor: "pointer", fontWeight: 700 }}
      >
        {moduleLabel}
      </button>

      <div className="flex items-center gap-1.5 px-3 py-1.5 rounded cursor-pointer" style={{ border: "1px solid var(--border)", background: "var(--input-background)", fontSize: 12, fontFamily: "Inter, sans-serif", color: "var(--foreground)" }}>
        <Building2 size={13} style={{ color: "var(--muted-foreground)" }} />
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
      <div style={{ position: "relative" }}>
        <button
          onClick={() => setShowNotifications((value) => !value)}
          className="flex items-center justify-center rounded p-1.5"
          style={{ background: showNotifications ? "var(--secondary)" : "transparent", border: "1px solid var(--border)", cursor: "pointer", color: "var(--muted-foreground)", position: "relative" }}
          title={`${unreadCount} okunmamis bildirim`}
        >
          <Bell size={15} />
          {unreadCount > 0 && (
            <span className="flex items-center justify-center rounded-full" style={{ position: "absolute", top: -6, right: -6, minWidth: 16, height: 16, padding: "0 4px", background: "var(--destructive)", color: "#fff", fontSize: 10, fontWeight: 700 }}>
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
        {showNotifications && (
          <div
            className="rounded"
            style={{
              position: "absolute",
              right: 0,
              top: 38,
              width: 340,
              maxHeight: 420,
              overflow: "auto",
              background: "var(--card)",
              border: "1px solid var(--border)",
              boxShadow: "0 14px 35px rgba(15, 23, 42, 0.16)",
              zIndex: 20,
            }}
          >
            <div className="flex items-center justify-between px-3 py-2" style={{ borderBottom: "1px solid var(--border)" }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 650, color: "var(--foreground)" }}>Bildirimler</div>
                <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{unreadCount} okunmamis</div>
              </div>
              {unreadCount > 0 && (
                <button onClick={handleReadAll} className="rounded px-2 py-1" style={{ border: "1px solid var(--border)", background: "var(--card)", fontSize: 11, cursor: "pointer" }}>
                  Tumunu okundu yap
                </button>
              )}
            </div>
            {notifications.length === 0 ? (
              <div className="px-3 py-4" style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Bildirim yok.</div>
            ) : notifications.map((item) => (
              <button
                key={item.id}
                onClick={() => !item.read_at && handleReadNotification(item.id)}
                className="w-full text-left px-3 py-3"
                style={{
                  display: "block",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  background: item.read_at ? "var(--card)" : "var(--secondary)",
                  cursor: item.read_at ? "default" : "pointer",
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <span style={{ fontSize: 12, fontWeight: 650, color: "var(--foreground)" }}>{item.title}</span>
                  {!item.read_at && <span className="rounded-full" style={{ width: 7, height: 7, background: "var(--destructive)", flexShrink: 0, marginTop: 4 }} />}
                </div>
                {item.body && <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>{item.body}</div>}
                <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 6 }}>
                  {new Date(item.created_at).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* User */}
      <button
        onClick={session ? onLogout : onHome}
        className="flex items-center gap-2 px-2 py-1 rounded"
        style={{ border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer" }}
        title={session ? "Cikis yap" : "Giris ekranina git"}
      >
        <div className="flex items-center justify-center rounded-full" style={{ width: 24, height: 24, background: "var(--primary)", color: "#fff", fontSize: 11, fontWeight: 600 }}>
          {roleLabel}
        </div>
        <span style={{ fontSize: 13, fontFamily: "Inter, sans-serif", fontWeight: 500, color: "var(--foreground)" }}>{userLabel}</span>
      </button>
    </header>
  );
}
