import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, Search, Building2, AlertTriangle, CheckCircle2, LogOut, Inbox } from "lucide-react";
import {
  ERPNotification,
  ERPSession,
  markERPNotificationRead,
  markAllERPNotificationsRead,
} from "../api";
import type { Page, LiveData } from "../lib/types";
import { URGENCY_ICON_CLASSES, URGENCY_DOT_CLASSES, URGENCY_UNREAD_ROW_CLASSES } from "../lib/constants";
import { isAdmin, notificationUrgency, shortName, relativeTime } from "../lib/helpers";

export function TopBar({ title, setPage, session, live, onLogout }: { title: string; setPage: (p: Page) => void; session: ERPSession; live: LiveData; onLogout: () => void }) {
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationRef = useRef<HTMLDivElement | null>(null);
  const unreadNotifications = live.notifications.filter((item) => !item.read_at).length;
  const hasUnreadCritical = live.notifications.some(
    (item) => !item.read_at && notificationUrgency(item.priority) === "critical"
  );
  const latestNotifications = live.notifications.slice(0, 6);

  useEffect(() => {
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!notificationRef.current?.contains(event.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, []);

  const markNotificationRead = async (notification: ERPNotification) => {
    if (!notification.read_at) {
      await markERPNotificationRead(notification.id);
      live.refresh();
    }
    setPage("notifications");
    setNotificationsOpen(false);
  };

  return (
    <header className="h-12 bg-white border-b border-border flex items-center px-4 gap-3 shrink-0">
      <h1 className="text-sm font-semibold text-foreground">{title}</h1>
      <div className="flex-1" />
      <div className="flex items-center gap-1.5 bg-slate-50 border border-border rounded px-2.5 py-1.5 w-56">
        <Search className="w-3.5 h-3.5 text-slate-400" />
        <input placeholder="Ara... (Ctrl+K)" className="text-xs bg-transparent outline-none flex-1 text-slate-600 placeholder:text-slate-400" />
      </div>
      <div className="flex items-center gap-1.5 text-xs text-slate-600 border border-border rounded px-2.5 py-1.5 bg-slate-50">
        <Building2 className="w-3.5 h-3.5 text-slate-400" />
        <span>Mobit</span>
        <ChevronDown className="w-3 h-3 text-slate-400" />
      </div>
      <div ref={notificationRef} className="relative">
        <button
          title="Bildirimler"
          onClick={() => setNotificationsOpen((value) => !value)}
          className="relative w-8 h-8 flex items-center justify-center rounded hover:bg-slate-100 text-slate-500"
        >
          <Bell className="w-4 h-4" />
          {unreadNotifications > 0 && (
            <span className={`absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center ${
              hasUnreadCritical ? "animate-pulse ring-2 ring-red-300" : ""
            }`}>
              {unreadNotifications > 9 ? "9+" : unreadNotifications}
            </span>
          )}
        </button>
        {notificationsOpen && (
          <div className="absolute right-0 top-9 z-40 w-80 overflow-hidden rounded border border-border bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-border bg-slate-50 px-3 py-2">
              <div>
                <p className="text-xs font-semibold text-foreground">Bildirimler</p>
                <p className="text-[10px] text-muted-foreground">{unreadNotifications} okunmamış</p>
              </div>
              <button
                title="Tümünü okundu işaretle"
                disabled={unreadNotifications === 0}
                onClick={async () => {
                  await markAllERPNotificationsRead();
                  live.refresh();
                }}
                className="rounded p-1 text-slate-400 hover:bg-white hover:text-teal-600 disabled:opacity-40"
              >
                <CheckCircle2 className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-80 overflow-y-auto divide-y divide-border">
              {latestNotifications.length === 0 ? (
                <div className="px-3 py-6 text-center text-xs text-muted-foreground">Bildirim yok.</div>
              ) : latestNotifications.map((notification) => {
                const urgency = notificationUrgency(notification.priority);
                return (
                  <button
                    key={notification.id}
                    onClick={() => markNotificationRead(notification)}
                    className={`flex w-full items-start gap-2 px-3 py-2.5 text-left hover:bg-slate-50 ${
                      notification.read_at ? "" : URGENCY_UNREAD_ROW_CLASSES[urgency]
                    }`}
                  >
                    <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded ${URGENCY_ICON_CLASSES[urgency]}`}>
                      {urgency === "critical" ? <AlertTriangle className="h-3.5 w-3.5" /> : <Bell className="h-3.5 w-3.5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">
                        {urgency === "critical" && (
                          <span className="mr-1 rounded bg-red-100 px-1 py-px text-[9px] font-bold uppercase text-red-700">Kritik</span>
                        )}
                        {notification.title}
                      </p>
                      {notification.body && <p className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground">{notification.body}</p>}
                      <p className="mt-1 text-[10px] text-slate-400">{relativeTime(notification.created_at)}</p>
                    </div>
                    {!notification.read_at && (
                      <span className={`mt-2 h-2 w-2 shrink-0 rounded-full ${URGENCY_DOT_CLASSES[urgency]}`} />
                    )}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => {
                setPage("notifications");
                setNotificationsOpen(false);
              }}
              className="flex w-full items-center justify-center gap-1.5 border-t border-border px-3 py-2 text-xs font-medium text-teal-700 hover:bg-slate-50"
            >
              <Inbox className="h-3.5 w-3.5" />
              Tüm bildirimler
            </button>
          </div>
        )}
      </div>
      <button onClick={onLogout} className="flex items-center gap-2 border border-border rounded px-2 py-1 hover:bg-slate-50">
        <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold">{shortName(session.name)}</div>
        <div className="leading-tight">
          <p className="text-xs font-semibold text-foreground">{session.name}</p>
          <p className="text-[10px] text-muted-foreground">{isAdmin(session) ? "Admin" : "Çalışan"}</p>
        </div>
        <LogOut className="w-3.5 h-3.5 text-slate-400" />
      </button>
    </header>
  );
}
