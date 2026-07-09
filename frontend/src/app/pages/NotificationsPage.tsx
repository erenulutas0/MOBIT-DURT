import { useEffect, useState } from "react";
import { ClipboardList, MessageSquare, Bell, UserPlus, Clock, AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import {
  getERPNotificationPreferences,
  markERPNotificationRead,
  markAllERPNotificationsRead,
  updateERPNotificationPreferences,
} from "../api";
import type { LiveData } from "../lib/types";
import { URGENCY_ICON_CLASSES, URGENCY_DOT_CLASSES, URGENCY_UNREAD_ROW_CLASSES } from "../lib/constants";
import { browserNotificationsSupported, browserNotificationsEnabled, setBrowserNotificationsEnabled, browserNotificationPermission, enableClosedDashboardWebPush, disableClosedDashboardWebPush, notificationUrgency, relativeTime } from "../lib/helpers";

// ─── NOTIFICATIONS ─────────────────────────────────────────────────────────────
export function NotificationsPage({ live }: { live: LiveData }) {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() => browserNotificationPermission());
  const [browserEnabled, setBrowserEnabled] = useState(() => browserNotificationsEnabled());
  const [preferenceMessage, setPreferenceMessage] = useState("");
  const [preferenceSaving, setPreferenceSaving] = useState(false);
  const notifs = live.notifications.map((item) => ({
    id: item.id,
    type: item.type,
    title: item.title,
    desc: item.body || "",
    time: relativeTime(item.created_at),
    read: Boolean(item.read_at),
    urgency: notificationUrgency(item.priority),
  }));
  const icons: Record<string, any> = {
    task: ClipboardList, deadline: Clock, approved: CheckCircle2,
    message: MessageSquare, overdue: AlertTriangle, account: UserPlus, rejected: XCircle
  };
  const colors: Record<string, string> = {
    task: "bg-blue-100 text-blue-600", deadline: "bg-amber-100 text-amber-600",
    approved: "bg-emerald-100 text-emerald-600", message: "bg-teal-100 text-teal-600",
    overdue: "bg-red-100 text-red-600", account: "bg-violet-100 text-violet-600",
    rejected: "bg-slate-100 text-slate-600"
  };

  useEffect(() => {
    let alive = true;
    getERPNotificationPreferences()
      .then((preference) => {
        if (!alive) return;
        setBrowserEnabled(preference.browser_push_enabled);
        setBrowserNotificationsEnabled(preference.browser_push_enabled);
        setPermission(browserNotificationPermission());
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const toggleBrowserNotifications = async () => {
    setPreferenceMessage("");
    if (!browserNotificationsSupported()) {
      setPreferenceMessage("Bu tarayıcı masaüstü bildirimlerini desteklemiyor.");
      return;
    }
    setPreferenceSaving(true);
    try {
      if (browserEnabled) {
        await disableClosedDashboardWebPush();
        await updateERPNotificationPreferences({ browser_push_enabled: false });
        setBrowserNotificationsEnabled(false);
        setBrowserEnabled(false);
        setPermission(browserNotificationPermission());
        setPreferenceMessage("Masaüstü ve Web Push bildirimleri kapatıldı.");
        return;
      }

      let nextPermission = Notification.permission;
      if (nextPermission === "default") {
        nextPermission = await Notification.requestPermission();
      }
      setPermission(nextPermission);

      if (nextPermission !== "granted") {
        await updateERPNotificationPreferences({ browser_push_enabled: false });
        setBrowserNotificationsEnabled(false);
        setBrowserEnabled(false);
        setPreferenceMessage("Tarayıcı bildirim izni verilmedi. Kilit/site ayarlarından izin verebilirsiniz.");
        return;
      }

      await enableClosedDashboardWebPush();
      await updateERPNotificationPreferences({ browser_push_enabled: true });
      setBrowserNotificationsEnabled(true);
      setBrowserEnabled(true);
      setPreferenceMessage("Bildirimler açıldı. Dashboard kapalıyken de Web Push gönderilebilir.");
    } catch (err) {
      setPreferenceMessage(err instanceof Error ? err.message : "Bildirim tercihi güncellenemedi.");
    } finally {
      setPreferenceSaving(false);
    }
  };

  return (
    <div className="p-6">
      <div className="bg-white border border-border rounded overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-slate-50">
          <h3 className="text-xs font-semibold">Tüm Bildirimler</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleBrowserNotifications}
              disabled={preferenceSaving || permission === "unsupported"}
              className="text-xs text-teal-600 hover:underline disabled:text-muted-foreground"
            >
              {browserEnabled ? "Masaüstü bildirimi açık" : permission === "denied" ? "Bildirim izni engelli" : "Masaüstü bildirimi aç"}
            </button>
            <button
              onClick={async () => {
                await markAllERPNotificationsRead();
                live.refresh();
              }}
              className="text-xs text-teal-600 hover:underline"
            >
              Tümünü Okundu İşaretle
            </button>
          </div>
        </div>
        {preferenceMessage && (
          <div className="px-4 py-2 border-b border-border text-[10px] text-muted-foreground bg-white">
            {preferenceMessage}
          </div>
        )}
        <div className="divide-y divide-border">
          {notifs.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">Canlı veride bildirim yok.</div>
          ) : notifs.map((n, i) => {
            const Icon = n.urgency === "critical" ? AlertTriangle : icons[n.type] || Bell;
            return (
              <button
                key={i}
                onClick={async () => {
                  if (!n.read) {
                    await markERPNotificationRead(n.id);
                    live.refresh();
                  }
                }}
                className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 ${
                  !n.read ? URGENCY_UNREAD_ROW_CLASSES[n.urgency] : ""
                }`}
              >
                <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${
                  n.urgency === "normal" ? colors[n.type] || "bg-teal-100 text-teal-700" : URGENCY_ICON_CLASSES[n.urgency]
                }`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">
                    {n.urgency === "critical" && (
                      <span className="mr-1 rounded bg-red-100 px-1 py-px text-[9px] font-bold uppercase text-red-700">Kritik</span>
                    )}
                    {n.urgency === "high" && !n.read && (
                      <span className="mr-1 rounded bg-amber-100 px-1 py-px text-[9px] font-bold uppercase text-amber-700">Önemli</span>
                    )}
                    {n.title}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{n.desc}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-muted-foreground">{n.time}</span>
                  {!n.read && <div className={`w-2 h-2 rounded-full ${URGENCY_DOT_CLASSES[n.urgency]}`} />}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
