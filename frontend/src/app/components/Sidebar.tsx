import { LayoutDashboard, Users, ClipboardList, CheckSquare, MessageSquare, Bell, UserPlus, FileText, Send, FolderOpen, Upload, BookOpen, Cpu, TrendingUp, Package, PanelLeftClose, PanelLeftOpen, Settings, BarChart2, Zap, Megaphone, Gavel, Swords, Trophy } from "lucide-react";
import {
  ERPSession,
} from "../api";
import type { Page, LiveData } from "../lib/types";
import { isAdmin, userTaskIds, shortName } from "../lib/helpers";

export const navItems = [
  {
    label: "Ana Sayfa",
    icon: LayoutDashboard,
    page: "home" as Page,
  },
  {
    group: "ERP-TAKIP",
    items: [
      { label: "Genel Bakış", icon: BarChart2, page: "erp-overview" as Page },
      { label: "Çalışanlar", icon: Users, page: "employees" as Page },
      { label: "Görevler", icon: ClipboardList, page: "tasks" as Page },
      { label: "Tamamlama Onayları", icon: CheckSquare, page: "approvals" as Page },
      { label: "Mesajlar", icon: MessageSquare, page: "messages" as Page, badge: 3 },
      { label: "Şirket Geneli", icon: Megaphone, page: "company-chat" as Page },
      { label: "Bildirimler", icon: Bell, page: "notifications" as Page, badge: 7 },
      { label: "Hesap Talepleri", icon: UserPlus, page: "account-requests" as Page, badge: 2 },
      { label: "Şirket Özeti", icon: TrendingUp, page: "company-briefing" as Page },
      { label: "Dönütler & Duyuru", icon: Zap, page: "feedback" as Page },
    ],
  },
  {
    group: "TENDER HUB",
    items: [
      { label: "Dashboard", icon: TrendingUp, page: "tender-dashboard" as Page },
      { label: "Kamu İhale Bülteni", icon: Megaphone, page: "tender-bulletin" as Page },
      { label: "Sonuçlanan İhaleler", icon: Gavel, page: "tender-results" as Page },
      { label: "Tekliflerimiz", icon: Swords, page: "bid-memory" as Page },
      { label: "Yeterlik Bilgileri", icon: Trophy, page: "company-qualification" as Page },
      { label: "Telegram Grupları", icon: Send, page: "telegram-groups" as Page },
      { label: "Belgeler", icon: FileText, page: "documents" as Page },
      { label: "Klasör Ağacı", icon: FolderOpen, page: "folder-tree" as Page },
      { label: "Yükleme", icon: Upload, page: "upload" as Page },
      { label: "Obsidian Demo", icon: BookOpen, page: "obsidian" as Page },
      { label: "İhale Detayı", icon: Package, page: "tender-detail" as Page },
      { label: "AI Çıkarımı", icon: Cpu, page: "ai-extraction" as Page },
    ],
  },
];

export function visibleNavItems(session: ERPSession) {
  if (isAdmin(session)) return navItems;
  return navItems.filter((item) => !("group" in item && item.group === "TENDER HUB")).map((item) => {
    if ("page" in item) return item;
    if (item.group === "ERP-TAKIP") {
      return {
        ...item,
        items: item.items
          .filter((sub) => !["approvals", "account-requests", "feedback"].includes(sub.page))
          .map((sub) => sub.page === "employees" ? { ...sub, label: "Profil" } : { ...sub, badge: undefined }),
      };
    }
    return item;
  });
}

export function Sidebar({ current, setPage, collapsed, setCollapsed, session, live }: {
  current: Page; setPage: (p: Page) => void; collapsed: boolean; setCollapsed: (v: boolean) => void; session: ERPSession; live: LiveData;
}) {
  const unreadNotifications = live.notifications.filter((item) => !item.read_at).length;
  const messageBadge = isAdmin(session)
    ? live.overview?.help_messages.filter((item) => item.author_user_id !== null).length || 0
    : live.overview?.help_messages.filter((item) => {
        const ids = userTaskIds(live.overview, session.user_id);
        return ids.has(item.task_id) && item.author_user_id === null;
      }).length || 0;
  const accountRequestsBadge = isAdmin(session) ? live.accountRequests.length : 0;
  return (
    <aside
      className="flex flex-col h-full bg-[#0F172A] border-r border-white/5 transition-all duration-200"
      style={{ width: collapsed ? 56 : 220 }}
    >
      <div className="flex items-center gap-2.5 px-4 h-12 border-b border-white/5 shrink-0">
        {!collapsed && (
          <span className="text-sm font-bold tracking-tight text-white">DocsBot <span className="text-teal-400">Ops</span></span>
        )}
        {collapsed && <Zap className="w-4 h-4 text-teal-400 mx-auto" />}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="ml-auto text-slate-500 hover:text-slate-300 transition-colors"
        >
          {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5 scrollbar-hide">
        {visibleNavItems(session).map((item, i) => {
          if ("page" in item) {
            const Icon = item.icon;
            const active = current === item.page;
            return (
              <button
                key={i}
                onClick={() => setPage(item.page)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium transition-colors rounded-sm mx-1 ${active
                  ? "bg-teal-600/20 text-teal-400"
                  : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                  }`}
                style={{ width: "calc(100% - 8px)" }}
                title={collapsed ? item.label : undefined}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </button>
            );
          }
          return (
            <div key={i} className="pt-3">
              {!collapsed && (
                <div className="px-3 pb-1.5">
                  <span className="text-[10px] font-semibold tracking-widest text-slate-600 uppercase">{item.group}</span>
                </div>
              )}
              {collapsed && <div className="h-px bg-white/5 mx-2 mb-2" />}
              {item.items!.map((sub, j) => {
                const Icon = sub.icon;
                const active = current === sub.page;
                return (
                  <button
                    key={j}
                    onClick={() => setPage(sub.page)}
                    className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-xs font-medium transition-colors rounded-sm mx-1 relative ${active
                      ? "bg-teal-600/20 text-teal-400"
                      : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                      }`}
                    style={{ width: "calc(100% - 8px)" }}
                    title={collapsed ? sub.label : undefined}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {!collapsed && <span className="flex-1 text-left">{sub.label}</span>}
                    {!collapsed && sub.page === "messages" && messageBadge > 0 && (
                      <span className="bg-teal-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                        {messageBadge > 9 ? "9+" : messageBadge}
                      </span>
                    )}
                    {!collapsed && sub.page === "notifications" && unreadNotifications > 0 && (
                      <span className="bg-teal-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                        {unreadNotifications > 9 ? "9+" : unreadNotifications}
                      </span>
                    )}
                    {!collapsed && sub.page === "account-requests" && accountRequestsBadge > 0 && (
                      <span className="bg-teal-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                        {accountRequestsBadge > 9 ? "9+" : accountRequestsBadge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-white/5 p-3 shrink-0">
        {!collapsed ? (
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold shrink-0">{shortName(session.name)}</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate">{session.name}</p>
              <p className="text-[10px] text-slate-500 truncate">{isAdmin(session) ? "Admin" : "Çalışan"}</p>
            </div>
            <Settings className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 cursor-pointer" />
          </div>
        ) : (
          <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold mx-auto">{shortName(session.name)}</div>
        )}
      </div>
    </aside>
  );
}
