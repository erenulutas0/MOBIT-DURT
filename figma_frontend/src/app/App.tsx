import { useState } from "react";
import {
  LayoutDashboard, Users, ClipboardList, CheckSquare, MessageSquare,
  Bell, UserPlus, FileText, Send, FolderOpen, Upload, BookOpen,
  Cpu, ChevronRight, ChevronDown, Search, Building2, Bot,
  Circle, Clock, AlertTriangle, CheckCircle2, XCircle, Loader2,
  MoreHorizontal, Filter, Download, Eye, Link, Tag, ArrowRight,
  Paperclip, Star, Hash, Activity, Database, Wifi, WifiOff,
  CalendarDays, TrendingUp, Package, Layers, PanelLeftClose,
  PanelLeftOpen, Settings, LogOut, ChevronLeft, X, Plus,
  RefreshCw, BarChart2, ExternalLink, GitBranch, FileSearch,
  Folder, File, ChevronUp, Menu, Inbox, HelpCircle, Zap
} from "lucide-react";

type Page =
  | "home"
  | "erp-overview"
  | "employees"
  | "tasks"
  | "approvals"
  | "messages"
  | "notifications"
  | "account-requests"
  | "tender-dashboard"
  | "telegram-groups"
  | "documents"
  | "folder-tree"
  | "upload"
  | "obsidian"
  | "tender-detail"
  | "ai-extraction";

const STATUS_COLORS: Record<string, string> = {
  "Online": "bg-emerald-100 text-emerald-700",
  "Away": "bg-amber-100 text-amber-700",
  "Offline": "bg-slate-100 text-slate-500",
  "Devam Ediyor": "bg-blue-100 text-blue-700",
  "Beklemede": "bg-amber-100 text-amber-700",
  "Tamamlama Talep": "bg-violet-100 text-violet-700",
  "Tamamlandı": "bg-emerald-100 text-emerald-700",
  "Gecikmiş": "bg-red-100 text-red-700",
  "İptal": "bg-slate-100 text-slate-500",
  "Yapılacak": "bg-slate-100 text-slate-600",
  "Aktif": "bg-emerald-100 text-emerald-700",
  "Sınıflandırılmamış": "bg-amber-100 text-amber-700",
  "Sınıflandırıldı": "bg-emerald-100 text-emerald-700",
};

function Badge({ label }: { label: string }) {
  const cls = STATUS_COLORS[label] || "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Online: "bg-emerald-500",
    Away: "bg-amber-400",
    Offline: "bg-slate-300",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] || "bg-slate-300"}`} />;
}

const navItems = [
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
      { label: "Bildirimler", icon: Bell, page: "notifications" as Page, badge: 7 },
      { label: "Hesap Talepleri", icon: UserPlus, page: "account-requests" as Page, badge: 2 },
    ],
  },
  {
    group: "TENDER HUB",
    items: [
      { label: "Dashboard", icon: TrendingUp, page: "tender-dashboard" as Page },
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

function Sidebar({ current, setPage, collapsed, setCollapsed }: {
  current: Page; setPage: (p: Page) => void; collapsed: boolean; setCollapsed: (v: boolean) => void;
}) {
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
        {navItems.map((item, i) => {
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
                    {!collapsed && "badge" in sub && sub.badge && (
                      <span className="bg-teal-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                        {sub.badge}
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
            <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold shrink-0">AY</div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-slate-200 truncate">Ahmet Yılmaz</p>
              <p className="text-[10px] text-slate-500 truncate">Admin</p>
            </div>
            <Settings className="w-3.5 h-3.5 text-slate-500 hover:text-slate-300 cursor-pointer" />
          </div>
        ) : (
          <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold mx-auto">AY</div>
        )}
      </div>
    </aside>
  );
}

function TopBar({ title, setPage }: { title: string; setPage: (p: Page) => void }) {
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
      <button
        onClick={() => setPage("notifications")}
        className="relative w-8 h-8 flex items-center justify-center rounded hover:bg-slate-100 text-slate-500"
      >
        <Bell className="w-4 h-4" />
        <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
      </button>
      <div className="w-7 h-7 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold">AY</div>
    </header>
  );
}

function KPICard({ label, value, sub, icon: Icon, trend, color }: {
  label: string; value: string | number; sub?: string; icon: any; trend?: string; color?: string;
}) {
  return (
    <div className="bg-white border border-border rounded p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <div className={`w-7 h-7 rounded flex items-center justify-center ${color || "bg-slate-100"}`}>
          <Icon className="w-3.5 h-3.5 text-slate-600" />
        </div>
      </div>
      <div className="text-2xl font-bold text-foreground font-mono">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      {trend && <div className="text-xs text-emerald-600 font-medium">{trend}</div>}
    </div>
  );
}

// ─── HOME PAGE ───────────────────────────────────────────────────────────────
function HomePage({ setPage }: { setPage: (p: Page) => void }) {
  return (
    <div className="p-6 space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => setPage("erp-overview")}
          className="bg-white border border-border rounded p-6 text-left hover:border-teal-300 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-blue-50 rounded flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">ERP-TAKIP</h2>
              <p className="text-xs text-muted-foreground">Dahili görev ve çalışan yönetimi</p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-teal-500 ml-auto transition-colors" />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-slate-50 rounded p-2 text-center">
              <p className="text-lg font-bold font-mono text-foreground">24</p>
              <p className="text-[10px] text-muted-foreground">Aktif Görev</p>
            </div>
            <div className="bg-slate-50 rounded p-2 text-center">
              <p className="text-lg font-bold font-mono text-foreground">7</p>
              <p className="text-[10px] text-muted-foreground">Bekleyen Onay</p>
            </div>
            <div className="bg-red-50 rounded p-2 text-center">
              <p className="text-lg font-bold font-mono text-red-600">3</p>
              <p className="text-[10px] text-red-500">Gecikmiş</p>
            </div>
          </div>
        </button>

        <button
          onClick={() => setPage("tender-dashboard")}
          className="bg-white border border-border rounded p-6 text-left hover:border-teal-300 hover:shadow-sm transition-all group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-teal-50 rounded flex items-center justify-center">
              <FileText className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-foreground">Tender Hub</h2>
              <p className="text-xs text-muted-foreground">İhale belgesi zekası & Telegram botu</p>
            </div>
            <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-teal-500 ml-auto transition-colors" />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-4">
            <div className="bg-slate-50 rounded p-2 text-center">
              <p className="text-lg font-bold font-mono text-foreground">142</p>
              <p className="text-[10px] text-muted-foreground">Toplam Belge</p>
            </div>
            <div className="bg-slate-50 rounded p-2 text-center">
              <p className="text-lg font-bold font-mono text-foreground">18</p>
              <p className="text-[10px] text-muted-foreground">Bugün Alınan</p>
            </div>
            <div className="bg-amber-50 rounded p-2 text-center">
              <p className="text-lg font-bold font-mono text-amber-600">5</p>
              <p className="text-[10px] text-amber-600">Sınıflandırılmamış</p>
            </div>
          </div>
        </button>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <KPICard label="Aktif Görevler" value="24" icon={ClipboardList} color="bg-blue-50" sub="8 çalışana atanmış" />
        <KPICard label="Bekleyen Onaylar" value="7" icon={CheckSquare} color="bg-violet-50" sub="2 gün bekliyor (ort.)" />
        <KPICard label="Bugün Alınan Belge" value="18" icon={FileText} color="bg-teal-50" trend="+4 dünden fazla" />
        <KPICard label="Gecikmiş Görevler" value="3" icon={AlertTriangle} color="bg-red-50" sub="Acil eylem gerekli" />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white border border-border rounded">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-xs font-semibold text-foreground">Son Aktiviteler</h3>
            <button className="text-xs text-teal-600 hover:underline">Tümünü gör</button>
          </div>
          <div className="divide-y divide-border">
            {[
              { user: "Mehmet Kaya", action: "BEDAS-2026-001 belgesini yükledi", time: "2 dk önce", type: "upload" },
              { user: "Ayşe Demir", action: "Elektrik tesisatı görevi tamamlandı olarak işaretledi", time: "15 dk önce", type: "task" },
              { user: "Bot", action: "Telegram'dan 3 yeni belge alındı (ÇEAŞ grubu)", time: "23 dk önce", type: "bot" },
              { user: "Admin", action: "Selin Yıldız'ın tamamlama talebi onaylandı", time: "1 sa önce", type: "approve" },
              { user: "Emre Çelik", action: "Kablo malzemesi siparişi görevi başlatıldı", time: "2 sa önce", type: "task" },
              { user: "Bot", action: "BEDAŞ grubundan 6 yeni belge alındı", time: "3 sa önce", type: "bot" },
            ].map((a, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${a.type === "bot" ? "bg-slate-100 text-slate-500" : a.type === "approve" ? "bg-emerald-100 text-emerald-600" : a.type === "upload" ? "bg-teal-100 text-teal-600" : "bg-blue-100 text-blue-600"}`}>
                  {a.type === "bot" ? <Bot className="w-3 h-3" /> : a.user.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate"><span className="font-medium">{a.user}</span> — {a.action}</p>
                </div>
                <span className="text-[10px] text-muted-foreground whitespace-nowrap">{a.time}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-border rounded">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-xs font-semibold text-foreground">Sistem Durumu</h3>
          </div>
          <div className="p-4 space-y-3">
            {[
              { label: "Telegram Botu", status: true, detail: "Son mesaj: 23 dk önce" },
              { label: "Veritabanı", status: true, detail: "PostgreSQL — 98ms" },
              { label: "Vault Sync", status: true, detail: "Obsidian bağlı" },
              { label: "Dosya Depolama", status: true, detail: "124 GB kullanılıyor" },
              { label: "AI Servisi", status: false, detail: "Bağlantı kesildi" },
            ].map((s, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${s.status ? "bg-emerald-500" : "bg-red-500"}`} />
                  <span className="text-xs font-medium text-foreground">{s.label}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">{s.detail}</span>
              </div>
            ))}
          </div>
          <div className="px-4 pb-4 pt-2">
            <button className="w-full bg-slate-50 hover:bg-slate-100 border border-border text-xs font-medium text-foreground rounded py-1.5 transition-colors flex items-center justify-center gap-1.5">
              <RefreshCw className="w-3 h-3" /> Durumu Yenile
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ERP OVERVIEW ─────────────────────────────────────────────────────────────
function ERPOverviewPage({ setPage }: { setPage: (p: Page) => void }) {
  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: "Kayıtlı Kullanıcı", value: "34", icon: Users, color: "bg-slate-50" },
          { label: "Çevrimiçi Çalışan", value: "12", icon: Wifi, color: "bg-emerald-50" },
          { label: "Aktif Görev", value: "24", icon: ClipboardList, color: "bg-blue-50" },
          { label: "Onay Bekleyen", value: "7", icon: CheckSquare, color: "bg-violet-50" },
          { label: "Gecikmiş Görev", value: "3", icon: AlertTriangle, color: "bg-red-50" },
          { label: "Yardım Mesajı", value: "5", icon: HelpCircle, color: "bg-amber-50" },
        ].map((k, i) => (
          <KPICard key={i} label={k.label} value={k.value} icon={k.icon} color={k.color} />
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <div className="bg-white border border-border rounded">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Son Görevler</h3>
              <button onClick={() => setPage("tasks")} className="text-xs text-teal-600 hover:underline flex items-center gap-1">
                Tüm görevler <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-slate-50 text-muted-foreground">
                  <th className="text-left px-4 py-2 font-medium">Görev</th>
                  <th className="text-left px-4 py-2 font-medium">Atanan</th>
                  <th className="text-left px-4 py-2 font-medium">Son Tarih</th>
                  <th className="text-left px-4 py-2 font-medium">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  { title: "BEDAS transformatör bakım raporu", person: "Mehmet K.", due: "14 Haz", status: "Devam Ediyor" },
                  { title: "Kablo malzeme listesi hazırlama", person: "Ayşe D.", due: "13 Haz", status: "Tamamlama Talep" },
                  { title: "Saha ölçüm koordinasyonu", person: "Emre Ç.", due: "10 Haz", status: "Gecikmiş" },
                  { title: "İhale teknik şartname incelemesi", person: "Selin Y.", due: "16 Haz", status: "Yapılacak" },
                  { title: "Güvenlik ekipmanı temin listesi", person: "Can Ö.", due: "15 Haz", status: "Devam Ediyor" },
                ].map((t, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-foreground">{t.title}</td>
                    <td className="px-4 py-2.5 text-muted-foreground">{t.person}</td>
                    <td className="px-4 py-2.5 font-mono text-muted-foreground">{t.due}</td>
                    <td className="px-4 py-2.5"><Badge label={t.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="bg-white border border-border rounded">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Tamamlama Onayı Bekleyenler</h3>
              <button onClick={() => setPage("approvals")} className="text-xs text-teal-600 hover:underline flex items-center gap-1">
                Tümü <ChevronRight className="w-3 h-3" />
              </button>
            </div>
            <div className="divide-y divide-border">
              {[
                { task: "Kablo malzeme listesi hazırlama", person: "Ayşe Demir", submitted: "2 sa önce", due: "13 Haz" },
                { task: "Proje dokümantasyonu güncelleme", person: "Can Öztürk", submitted: "5 sa önce", due: "12 Haz" },
              ].map((r, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3">
                  <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 text-[10px] font-bold shrink-0">
                    {r.person.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{r.task}</p>
                    <p className="text-[10px] text-muted-foreground">{r.person} · {r.submitted} gönderildi · Tarih: {r.due}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-medium rounded transition-colors">Onayla</button>
                    <button className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-medium rounded transition-colors">Reddet</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-border rounded">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Çalışanlar</h3>
              <button onClick={() => setPage("employees")} className="text-xs text-teal-600 hover:underline">Tümü</button>
            </div>
            <div className="divide-y divide-border">
              {[
                { name: "Mehmet Kaya", role: "Saha Mühendisi", status: "Online" },
                { name: "Ayşe Demir", role: "Proje Koordinatörü", status: "Online" },
                { name: "Emre Çelik", role: "Teknik Uzman", status: "Away" },
                { name: "Selin Yıldız", role: "Dokümantasyon", status: "Offline" },
                { name: "Can Öztürk", role: "Satın Alma", status: "Online" },
              ].map((e, i) => (
                <div key={i} className="flex items-center gap-2.5 px-4 py-2">
                  <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">
                    {e.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{e.name}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{e.role}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <StatusDot status={e.status} />
                    <span className="text-[10px] text-muted-foreground">{e.status}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-border rounded">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Hızlı İşlemler</h3>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
              {[
                { label: "Görev Ata", icon: ClipboardList, page: "tasks" as Page },
                { label: "Çalışan Ekle", icon: UserPlus, page: "employees" as Page },
                { label: "Mesajlar", icon: MessageSquare, page: "messages" as Page },
                { label: "Onaylar", icon: CheckSquare, page: "approvals" as Page },
              ].map((a, i) => (
                <button
                  key={i}
                  onClick={() => setPage(a.page)}
                  className="flex flex-col items-center gap-1.5 p-2.5 bg-slate-50 hover:bg-slate-100 rounded border border-border transition-colors"
                >
                  <a.icon className="w-4 h-4 text-teal-600" />
                  <span className="text-[10px] font-medium text-foreground">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── EMPLOYEES ────────────────────────────────────────────────────────────────
function EmployeesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("Tümü");
  const employees = [
    { name: "Mehmet Kaya", role: "Saha Mühendisi", dept: "Teknik", email: "m.kaya@mobit.com.tr", phone: "0532 111 22 33", status: "Online", lastSeen: "Şimdi", active: 4, done: 28, overdue: 0 },
    { name: "Ayşe Demir", role: "Proje Koordinatörü", dept: "Proje", email: "a.demir@mobit.com.tr", phone: "0533 222 33 44", status: "Online", lastSeen: "Şimdi", active: 3, done: 45, overdue: 0 },
    { name: "Emre Çelik", role: "Teknik Uzman", dept: "Teknik", email: "e.celik@mobit.com.tr", phone: "0535 333 44 55", status: "Away", lastSeen: "18 dk önce", active: 5, done: 19, overdue: 1 },
    { name: "Selin Yıldız", role: "Dokümantasyon Uzm.", dept: "İdari", email: "s.yildiz@mobit.com.tr", phone: "0536 444 55 66", status: "Offline", lastSeen: "2 sa önce", active: 2, done: 33, overdue: 0 },
    { name: "Can Öztürk", role: "Satın Alma Uzm.", dept: "Satın Alma", email: "c.ozturk@mobit.com.tr", phone: "0537 555 66 77", status: "Online", lastSeen: "Şimdi", active: 6, done: 21, overdue: 2 },
    { name: "Fatma Arslan", role: "Muhasebe", dept: "Mali", email: "f.arslan@mobit.com.tr", phone: "0538 666 77 88", status: "Offline", lastSeen: "1 gün önce", active: 1, done: 56, overdue: 0 },
    { name: "Burak Şahin", role: "Saha Teknisyeni", dept: "Teknik", email: "b.sahin@mobit.com.tr", phone: "0539 777 88 99", status: "Online", lastSeen: "Şimdi", active: 7, done: 14, overdue: 1 },
  ];
  const filtered = employees.filter(e =>
    (statusFilter === "Tümü" || e.status === statusFilter) &&
    (search === "" || e.name.toLowerCase().includes(search.toLowerCase()) || e.dept.toLowerCase().includes(search.toLowerCase()))
  );
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 bg-white border border-border rounded px-2.5 py-1.5 flex-1 max-w-xs">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="İsim veya departman ara..." className="text-xs bg-transparent outline-none flex-1" />
        </div>
        {["Tümü", "Online", "Away", "Offline"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${statusFilter === s ? "bg-teal-600 text-white border-teal-600" : "bg-white border-border text-muted-foreground hover:bg-slate-50"}`}>
            {s}
          </button>
        ))}
        <div className="ml-auto">
          <button className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors">
            <Plus className="w-3.5 h-3.5" /> Çalışan Ekle
          </button>
        </div>
      </div>
      <div className="bg-white border border-border rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-border text-muted-foreground">
              <th className="text-left px-4 py-2.5 font-medium">Ad Soyad</th>
              <th className="text-left px-4 py-2.5 font-medium">Rol / Departman</th>
              <th className="text-left px-4 py-2.5 font-medium">E-posta</th>
              <th className="text-left px-4 py-2.5 font-medium">Durum</th>
              <th className="text-left px-4 py-2.5 font-medium">Son Görülme</th>
              <th className="text-center px-4 py-2.5 font-medium">Aktif</th>
              <th className="text-center px-4 py-2.5 font-medium">Tamamlanan</th>
              <th className="text-center px-4 py-2.5 font-medium">Gecikmiş</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((e, i) => (
              <tr key={i} className="hover:bg-slate-50 transition-colors cursor-pointer">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">
                      {e.name.slice(0, 2).toUpperCase()}
                    </div>
                    <span className="font-medium text-foreground">{e.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{e.role} <span className="text-slate-400">· {e.dept}</span></td>
                <td className="px-4 py-2.5 text-muted-foreground font-mono">{e.email}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <StatusDot status={e.status} />
                    <span className="text-muted-foreground">{e.status}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{e.lastSeen}</td>
                <td className="px-4 py-2.5 text-center font-mono font-medium text-blue-700">{e.active}</td>
                <td className="px-4 py-2.5 text-center font-mono font-medium text-emerald-700">{e.done}</td>
                <td className="px-4 py-2.5 text-center font-mono font-medium text-red-600">{e.overdue || "—"}</td>
                <td className="px-4 py-2.5">
                  <button className="text-slate-400 hover:text-slate-600">
                    <MoreHorizontal className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── TASKS ────────────────────────────────────────────────────────────────────
function TasksPage() {
  const [statusFilter, setStatusFilter] = useState("Tümü");
  const tasks = [
    { title: "BEDAS transformatör bakım raporu hazırlama", assignee: "Mehmet Kaya", type: "Bireysel", due: "14 Haz 2026", status: "Devam Ediyor", docs: 2, created: "Admin" },
    { title: "Kablo malzeme listesi temin ve hazırlama", assignee: "Ayşe Demir", type: "Grup", due: "13 Haz 2026", status: "Tamamlama Talep", docs: 1, created: "Admin" },
    { title: "Saha ölçüm koordinasyonu — Tuzla bölgesi", assignee: "Emre Çelik", type: "Bireysel", due: "10 Haz 2026", status: "Gecikmiş", docs: 0, created: "Admin" },
    { title: "İhale teknik şartname incelemesi (ÇEAŞ)", assignee: "Selin Yıldız", type: "Bireysel", due: "16 Haz 2026", status: "Yapılacak", docs: 3, created: "Admin" },
    { title: "Güvenlik ekipmanı temin listesi", assignee: "Can Öztürk", type: "Bireysel", due: "15 Haz 2026", status: "Devam Ediyor", docs: 0, created: "Admin" },
    { title: "Aylık fatura mutabakatı", assignee: "Fatma Arslan", type: "Bireysel", due: "30 Haz 2026", status: "Yapılacak", docs: 4, created: "Admin" },
    { title: "Proje dokümantasyonu güncelleme", assignee: "Can Öztürk", type: "Grup", due: "12 Haz 2026", status: "Tamamlama Talep", docs: 2, created: "Admin" },
    { title: "Kablo deşarj testi — Kadıköy trafo merkezi", assignee: "Burak Şahin", type: "Bireysel", due: "18 Haz 2026", status: "Devam Ediyor", docs: 1, created: "Admin" },
  ];
  const statuses = ["Tümü", "Yapılacak", "Devam Ediyor", "Tamamlama Talep", "Tamamlandı", "Gecikmiş", "İptal"];
  const filtered = statusFilter === "Tümü" ? tasks : tasks.filter(t => t.status === statusFilter);
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {statuses.map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-1.5 rounded border transition-colors ${statusFilter === s ? "bg-teal-600 text-white border-teal-600" : "bg-white border-border text-muted-foreground hover:bg-slate-50"}`}>
            {s}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <button className="flex items-center gap-1.5 bg-slate-50 hover:bg-slate-100 border border-border text-xs px-3 py-1.5 rounded">
            <Filter className="w-3.5 h-3.5" /> Filtrele
          </button>
          <button className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-3 py-1.5 rounded">
            <Plus className="w-3.5 h-3.5" /> Görev Oluştur
          </button>
        </div>
      </div>
      <div className="bg-white border border-border rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-border text-muted-foreground">
              <th className="text-left px-4 py-2.5 font-medium">Görev Başlığı</th>
              <th className="text-left px-4 py-2.5 font-medium">Atanan</th>
              <th className="text-left px-4 py-2.5 font-medium">Tür</th>
              <th className="text-left px-4 py-2.5 font-medium">Son Tarih</th>
              <th className="text-left px-4 py-2.5 font-medium">Durum</th>
              <th className="text-center px-4 py-2.5 font-medium">Belge</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {filtered.map((t, i) => (
              <tr key={i} className="hover:bg-slate-50 transition-colors cursor-pointer">
                <td className="px-4 py-3 font-medium text-foreground max-w-xs">
                  <span className="block truncate">{t.title}</span>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{t.assignee}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${t.type === "Grup" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"}`}>{t.type}</span>
                </td>
                <td className="px-4 py-3 font-mono text-muted-foreground">{t.due}</td>
                <td className="px-4 py-3"><Badge label={t.status} /></td>
                <td className="px-4 py-3 text-center">
                  {t.docs > 0 ? (
                    <div className="flex items-center justify-center gap-1 text-muted-foreground">
                      <Paperclip className="w-3 h-3" />{t.docs}
                    </div>
                  ) : <span className="text-slate-300">—</span>}
                </td>
                <td className="px-4 py-3">
                  <button className="text-slate-400 hover:text-slate-600"><MoreHorizontal className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── APPROVALS ────────────────────────────────────────────────────────────────
function ApprovalsPage() {
  const [selected, setSelected] = useState<number | null>(0);
  const approvals = [
    { task: "Kablo malzeme listesi temin ve hazırlama", person: "Ayşe Demir", due: "13 Haz 2026", submitted: "2 sa önce", note: "Malzeme listesi tamamlandı, tedarikçiden onay alındı. Ekteki belgeleri incelemenizi rica ederim.", docs: ["malzeme-listesi-v3.xlsx", "tedarikci-onay.pdf"] },
    { task: "Proje dokümantasyonu güncelleme", person: "Can Öztürk", due: "12 Haz 2026", submitted: "5 sa önce", note: "Tüm sayfa yapısı revize edildi. Yeni şablon formatına geçildi.", docs: ["proje-dok-v2.docx"] },
  ];
  const sel = selected !== null ? approvals[selected] : null;
  return (
    <div className="p-6 flex gap-4 h-[calc(100vh-112px)]">
      <div className="w-80 bg-white border border-border rounded overflow-hidden flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-border bg-slate-50">
          <h3 className="text-xs font-semibold text-foreground">Bekleyen Onaylar ({approvals.length})</h3>
        </div>
        <div className="overflow-y-auto flex-1">
          {approvals.map((a, i) => (
            <button
              key={i}
              onClick={() => setSelected(i)}
              className={`w-full text-left px-4 py-3 border-b border-border transition-colors ${selected === i ? "bg-teal-50 border-l-2 border-l-teal-500" : "hover:bg-slate-50"}`}
            >
              <p className="text-xs font-medium text-foreground truncate">{a.task}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">{a.person} · {a.submitted}</p>
              <div className="mt-1.5"><Badge label="Tamamlama Talep" /></div>
            </button>
          ))}
        </div>
      </div>

      {sel ? (
        <div className="flex-1 bg-white border border-border rounded overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{sel.task}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{sel.person} · Son tarih: {sel.due} · Gönderildi: {sel.submitted}</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded transition-colors flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> Onayla
              </button>
              <button className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded transition-colors flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5" /> Reddet
              </button>
              <button className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-xs font-medium rounded text-slate-600 transition-colors flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" /> Mesaj Gönder
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Çalışan Notu</p>
              <div className="bg-slate-50 border border-border rounded p-3 text-xs text-foreground">{sel.note}</div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Ekli Dosyalar</p>
              <div className="space-y-2">
                {sel.docs.map((d, i) => (
                  <div key={i} className="flex items-center gap-2.5 bg-slate-50 border border-border rounded p-2.5">
                    <FileText className="w-4 h-4 text-teal-600 shrink-0" />
                    <span className="text-xs font-medium text-foreground flex-1">{d}</span>
                    <button className="text-slate-400 hover:text-teal-600 transition-colors"><Eye className="w-3.5 h-3.5" /></button>
                    <button className="text-slate-400 hover:text-teal-600 transition-colors"><Download className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Aktivite Günlüğü</p>
              <div className="space-y-2">
                {[
                  { action: "Tamamlama talebi gönderildi", time: "2 sa önce", by: "Ayşe Demir" },
                  { action: "Görev \"Devam Ediyor\" durumuna geçirildi", time: "1 gün önce", by: "Ayşe Demir" },
                  { action: "Görev oluşturuldu ve atandı", time: "3 gün önce", by: "Admin" },
                ].map((l, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0" />
                    <div>
                      <p className="text-xs text-foreground">{l.action}</p>
                      <p className="text-[10px] text-muted-foreground">{l.by} · {l.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 bg-white border border-border rounded flex items-center justify-center text-muted-foreground text-xs">
          Sol taraftan bir onay seçin
        </div>
      )}
    </div>
  );
}

// ─── MESSAGES ─────────────────────────────────────────────────────────────────
function MessagesPage() {
  const [selected, setSelected] = useState(0);
  const threads = [
    { person: "Emre Çelik", last: "Görevle ilgili sorun yaşıyorum, yardımcı olabilir misiniz?", time: "10 dk önce", unread: 2, task: "Saha ölçüm koordinasyonu" },
    { person: "Burak Şahin", last: "Kadıköy trafosuna erişim izni için ne yapmalıyım?", time: "1 sa önce", unread: 1, task: "Kablo deşarj testi" },
    { person: "Fatma Arslan", last: "Fatura mutabakatı için ek bilgi gerekiyor.", time: "3 sa önce", unread: 0, task: "Aylık fatura mutabakatı" },
  ];
  const messages = [
    { from: "Emre Çelik", text: "Merhaba, saha ölçüm koordinasyonu göreviyle ilgili sorun yaşıyorum.", time: "10:20", own: false },
    { from: "Admin", text: "Merhaba Emre, ne tür bir sorun yaşıyorsunuz?", time: "10:22", own: true },
    { from: "Emre Çelik", text: "Tuzla bölgesinde ölçüm yapabilmek için gerekli ekipmana erişemiyorum. Depo ambarında kayıtlı görünüyor ama fiziksel olarak yok.", time: "10:25", own: false },
    { from: "Emre Çelik", text: "Görevle ilgili sorun yaşıyorum, yardımcı olabilir misiniz?", time: "10:28", own: false },
  ];
  return (
    <div className="p-6 flex gap-4 h-[calc(100vh-112px)]">
      <div className="w-72 bg-white border border-border rounded overflow-hidden flex flex-col shrink-0">
        <div className="px-4 py-3 border-b border-border bg-slate-50">
          <h3 className="text-xs font-semibold">Konuşmalar</h3>
        </div>
        <div className="overflow-y-auto flex-1">
          {threads.map((t, i) => (
            <button
              key={i}
              onClick={() => setSelected(i)}
              className={`w-full text-left px-4 py-3 border-b border-border transition-colors ${selected === i ? "bg-teal-50 border-l-2 border-l-teal-500" : "hover:bg-slate-50"}`}
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-foreground">{t.person}</p>
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] text-muted-foreground">{t.time}</span>
                  {t.unread > 0 && (
                    <span className="bg-teal-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{t.unread}</span>
                  )}
                </div>
              </div>
              <p className="text-[10px] text-teal-600 truncate mt-0.5">{t.task}</p>
              <p className="text-[10px] text-muted-foreground truncate mt-0.5">{t.last}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 bg-white border border-border rounded flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div>
            <p className="text-xs font-semibold text-foreground">{threads[selected].person}</p>
            <p className="text-[10px] text-teal-600">{threads[selected].task}</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="text-xs px-2.5 py-1 bg-slate-50 hover:bg-slate-100 border border-border rounded text-muted-foreground flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Çözüldü
            </button>
            <button className="text-slate-400 hover:text-slate-600"><MoreHorizontal className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.own ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-sm rounded px-3 py-2 ${m.own ? "bg-teal-600 text-white" : "bg-slate-100 text-foreground"}`}>
                <p className="text-xs">{m.text}</p>
                <p className={`text-[10px] mt-1 ${m.own ? "text-teal-200" : "text-muted-foreground"}`}>{m.time}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-border p-3 flex items-end gap-2">
          <textarea
            rows={2}
            placeholder="Yanıtınızı yazın..."
            className="flex-1 text-xs bg-slate-50 border border-border rounded px-3 py-2 resize-none outline-none focus:ring-1 focus:ring-teal-400"
          />
          <div className="flex flex-col gap-1.5">
            <button className="p-1.5 text-slate-400 hover:text-teal-600 transition-colors"><Paperclip className="w-4 h-4" /></button>
            <button className="px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded transition-colors">Gönder</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── NOTIFICATIONS ─────────────────────────────────────────────────────────────
function NotificationsPage() {
  const notifs = [
    { type: "task", title: "Yeni görev atandı", desc: "\"BEDAS transformatör bakım raporu\" görevi size atandı.", time: "5 dk önce", read: false },
    { type: "deadline", title: "Görev son tarihi yaklaşıyor", desc: "\"Kablo malzeme listesi\" — Son tarih: Yarın 18:00", time: "1 sa önce", read: false },
    { type: "approved", title: "Tamamlama onaylandı", desc: "\"Saha ekipman envanteri\" göreviniz Admin tarafından onaylandı.", time: "3 sa önce", read: false },
    { type: "message", title: "Admin mesaj gönderdi", desc: "\"Saha ölçüm koordinasyonu\" görevi hakkında yeni mesaj var.", time: "4 sa önce", read: false },
    { type: "overdue", title: "Görev gecikmiş", desc: "\"Tuzla saha ölçüm koordinasyonu\" görevi süresi geçti.", time: "6 sa önce", read: true },
    { type: "account", title: "Hesap talebi onaylandı", desc: "Hesabınız Admin tarafından onaylandı. Giriş yapabilirsiniz.", time: "1 gün önce", read: true },
    { type: "rejected", title: "Tamamlama reddedildi", desc: "\"Proje şablonu hazırlama\" talebi reddedildi. Neden: Eksik belge.", time: "2 gün önce", read: true },
  ];
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
  return (
    <div className="p-6">
      <div className="bg-white border border-border rounded overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-slate-50">
          <h3 className="text-xs font-semibold">Tüm Bildirimler</h3>
          <button className="text-xs text-teal-600 hover:underline">Tümünü Okundu İşaretle</button>
        </div>
        <div className="divide-y divide-border">
          {notifs.map((n, i) => {
            const Icon = icons[n.type];
            return (
              <div key={i} className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 ${!n.read ? "bg-teal-50/30" : ""}`}>
                <div className={`w-7 h-7 rounded flex items-center justify-center shrink-0 ${colors[n.type]}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">{n.title}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{n.desc}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] text-muted-foreground">{n.time}</span>
                  {!n.read && <div className="w-2 h-2 rounded-full bg-teal-500" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── ACCOUNT REQUESTS ─────────────────────────────────────────────────────────
function AccountRequestsPage() {
  const requests = [
    { name: "Kerem Aydın", email: "k.aydin@mobit.com.tr", phone: "0540 111 22 33", dept: "Teknik", role: "Saha Mühendisi", created: "12 Haz 2026, 09:14" },
    { name: "Zübeyde Karataş", email: "z.karatas@mobit.com.tr", phone: "0541 222 33 44", dept: "İdari", role: "Sekreter", created: "11 Haz 2026, 14:37" },
  ];
  return (
    <div className="p-6 space-y-4">
      <div className="bg-white border border-border rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-slate-50">
          <h3 className="text-xs font-semibold">Bekleyen Hesap Talepleri ({requests.length})</h3>
        </div>
        <div className="divide-y divide-border">
          {requests.map((r, i) => (
            <div key={i} className="px-4 py-4 flex items-center gap-4">
              <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 text-xs font-bold shrink-0">
                {r.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 grid grid-cols-4 gap-4">
                <div>
                  <p className="text-xs font-semibold text-foreground">{r.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{r.email}</p>
                  <p className="text-[10px] text-muted-foreground">{r.phone}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Departman</p>
                  <p className="text-xs font-medium text-foreground">{r.dept}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Talep Edilen Rol</p>
                  <p className="text-xs font-medium text-foreground">{r.role}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Tarih</p>
                  <p className="text-xs font-mono text-muted-foreground">{r.created}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded transition-colors">Onayla</button>
                <button className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded border border-red-200 transition-colors">Reddet</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── TENDER DASHBOARD ─────────────────────────────────────────────────────────
function TenderDashboardPage({ setPage }: { setPage: (p: Page) => void }) {
  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-6 gap-3">
        {[
          { label: "Toplam İhale", value: "87", icon: Package, color: "bg-slate-50" },
          { label: "Toplam Belge", value: "142", icon: FileText, color: "bg-teal-50" },
          { label: "Bugün Alınan", value: "18", icon: TrendingUp, color: "bg-blue-50" },
          { label: "Sınıflandırılmamış", value: "5", icon: AlertTriangle, color: "bg-amber-50" },
          { label: "Telegram Grubu", value: "12", icon: Send, color: "bg-violet-50" },
          { label: "Obsidian Notu", value: "76", icon: BookOpen, color: "bg-emerald-50" },
        ].map((k, i) => <KPICard key={i} label={k.label} value={k.value} icon={k.icon} color={k.color} />)}
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 bg-white border border-border rounded">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="text-xs font-semibold">Son Yüklenen Belgeler</h3>
            <button onClick={() => setPage("documents")} className="text-xs text-teal-600 hover:underline flex items-center gap-1">Tümü <ChevronRight className="w-3 h-3" /></button>
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-border text-muted-foreground">
                <th className="text-left px-4 py-2 font-medium">Dosya Adı</th>
                <th className="text-left px-4 py-2 font-medium">İhale Şirketi</th>
                <th className="text-left px-4 py-2 font-medium">Şube</th>
                <th className="text-left px-4 py-2 font-medium">Tarih</th>
                <th className="text-left px-4 py-2 font-medium">Durum</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[
                { file: "BEDAS-2026-001-teknik-sartname.pdf", company: "BEDAŞ", branch: "Mobit", date: "12 Haz 09:41", status: "Sınıflandırıldı" },
                { file: "CEAS-2026-037-ihale-dokuman.pdf", company: "ÇEAŞ", branch: "Stok Enerji", date: "12 Haz 08:15", status: "Sınıflandırıldı" },
                { file: "TOROSLAR-2026-19-sozlesme.pdf", company: "Toroslar EDAŞ", branch: "Depart", date: "12 Haz 07:58", status: "Sınıflandırılmamış" },
                { file: "ENERJISA-2026-221-teknik.docx", company: "Enerjisa", branch: "Mobit", date: "11 Haz 17:22", status: "Sınıflandırıldı" },
                { file: "BEDAS-2026-002-malzeme-listesi.xlsx", company: "BEDAŞ", branch: "Mobit", date: "11 Haz 16:45", status: "Sınıflandırıldı" },
              ].map((d, i) => (
                <tr key={i} className="hover:bg-slate-50 transition-colors cursor-pointer">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                      <span className="font-mono text-[11px] text-foreground truncate max-w-[200px]">{d.file}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{d.company}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{d.branch}</td>
                  <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{d.date}</td>
                  <td className="px-4 py-2.5"><Badge label={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-border rounded">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Aktif Telegram Grupları</h3>
            </div>
            <div className="divide-y divide-border">
              {[
                { name: "BEDAŞ İhale Grubu", branch: "Mobit", docs: 42, bot: true },
                { name: "ÇEAŞ Teknik Bildirim", branch: "Stok Enerji", docs: 28, bot: true },
                { name: "Toroslar EDAŞ Tender", branch: "Depart", docs: 19, bot: false },
                { name: "Enerjisa Ankara", branch: "Mobit", docs: 31, bot: true },
              ].map((g, i) => (
                <div key={i} className="flex items-center gap-2.5 px-4 py-2.5">
                  <div className="w-6 h-6 rounded bg-teal-100 flex items-center justify-center shrink-0">
                    <Send className="w-3 h-3 text-teal-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">{g.name}</p>
                    <p className="text-[10px] text-muted-foreground">{g.branch} · {g.docs} belge</p>
                  </div>
                  <div className={`w-2 h-2 rounded-full ${g.bot ? "bg-emerald-500" : "bg-red-400"}`} title={g.bot ? "Bot aktif" : "Bot kapalı"} />
                </div>
              ))}
            </div>
            <div className="p-3">
              <button onClick={() => setPage("telegram-groups")} className="w-full text-xs text-teal-600 hover:underline">Grupları Yönet</button>
            </div>
          </div>

          <div className="bg-white border border-border rounded">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Hızlı İşlemler</h3>
            </div>
            <div className="p-3 grid grid-cols-2 gap-2">
              {[
                { label: "Klasör Ağacı", icon: FolderOpen, page: "folder-tree" as Page },
                { label: "Belge Yükle", icon: Upload, page: "upload" as Page },
                { label: "Obsidian Demo", icon: BookOpen, page: "obsidian" as Page },
                { label: "Grupları Gör", icon: Send, page: "telegram-groups" as Page },
              ].map((a, i) => (
                <button key={i} onClick={() => setPage(a.page)}
                  className="flex flex-col items-center gap-1.5 p-2.5 bg-slate-50 hover:bg-slate-100 rounded border border-border transition-colors">
                  <a.icon className="w-4 h-4 text-teal-600" />
                  <span className="text-[10px] font-medium text-foreground">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TELEGRAM GROUPS ──────────────────────────────────────────────────────────
function TelegramGroupsPage() {
  const [showModal, setShowModal] = useState(false);
  const [step, setStep] = useState(1);
  const [branch, setBranch] = useState("");
  const branches = ["Mobit", "Stok Enerji", "Depart", "Area", "Mobiser"];
  const companies = ["BEDAŞ", "ÇEAŞ", "Toroslar EDAŞ", "Enerjisa", "Dicle EDAŞ", "Boğaziçi EDAŞ", "Ayedaş", "Gediz EDAŞ", "Meram EDAŞ", "Uludağ EDAŞ"];
  const groups = [
    { name: "BEDAŞ İhale Grubu", branch: "Mobit", company: "BEDAŞ", created: "3 Oca 2026", docs: 42, lastDoc: "12 Haz 09:41", bot: true },
    { name: "ÇEAŞ Teknik Bildirim", branch: "Stok Enerji", company: "ÇEAŞ", created: "15 Şub 2026", docs: 28, lastDoc: "12 Haz 08:15", bot: true },
    { name: "Toroslar EDAŞ Tender", branch: "Depart", company: "Toroslar EDAŞ", created: "22 Mar 2026", docs: 19, lastDoc: "10 Haz 14:30", bot: false },
    { name: "Enerjisa Ankara Grubu", branch: "Mobit", company: "Enerjisa", created: "5 Nis 2026", docs: 31, lastDoc: "11 Haz 17:22", bot: true },
    { name: "Dicle EDAŞ İhale", branch: "Area", company: "Dicle EDAŞ", created: "18 Nis 2026", docs: 11, lastDoc: "9 Haz 11:00", bot: true },
  ];
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{groups.length} grup bağlı</p>
        <button
          onClick={() => { setShowModal(true); setStep(1); setBranch(""); }}
          className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium px-3 py-1.5 rounded transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Yeni Grup Ekle
        </button>
      </div>

      <div className="bg-white border border-border rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-border text-muted-foreground">
              <th className="text-left px-4 py-2.5 font-medium">Grup Adı</th>
              <th className="text-left px-4 py-2.5 font-medium">Şube</th>
              <th className="text-left px-4 py-2.5 font-medium">İhale Şirketi</th>
              <th className="text-left px-4 py-2.5 font-medium">Oluşturulma</th>
              <th className="text-center px-4 py-2.5 font-medium">Belge</th>
              <th className="text-left px-4 py-2.5 font-medium">Son Belge</th>
              <th className="text-left px-4 py-2.5 font-medium">Bot</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {groups.map((g, i) => (
              <tr key={i} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded bg-teal-100 flex items-center justify-center shrink-0">
                      <Send className="w-3 h-3 text-teal-600" />
                    </div>
                    <span className="font-medium text-foreground">{g.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted-foreground">{g.branch}</td>
                <td className="px-4 py-3 text-muted-foreground">{g.company}</td>
                <td className="px-4 py-3 font-mono text-muted-foreground">{g.created}</td>
                <td className="px-4 py-3 text-center font-mono font-medium text-foreground">{g.docs}</td>
                <td className="px-4 py-3 font-mono text-[10px] text-muted-foreground">{g.lastDoc}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${g.bot ? "bg-emerald-500" : "bg-red-400"}`} />
                    <span className="text-muted-foreground">{g.bot ? "Aktif" : "Kapalı"}</span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <button className="text-slate-400 hover:text-slate-600"><MoreHorizontal className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded border border-border w-[480px] shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold">Yeni Telegram Grubu Ekle</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-5">
                {[1, 2].map(s => (
                  <div key={s} className="flex items-center gap-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${step >= s ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-400"}`}>{s}</div>
                    <span className={`text-xs ${step >= s ? "text-foreground font-medium" : "text-muted-foreground"}`}>{s === 1 ? "Şube Seç" : "İhale Şirketi Seç"}</span>
                    {s < 2 && <ChevronRight className="w-3.5 h-3.5 text-slate-300" />}
                  </div>
                ))}
              </div>

              {step === 1 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground mb-3">Dahili şube seçin:</p>
                  {branches.map(b => (
                    <button key={b} onClick={() => setBranch(b)}
                      className={`w-full text-left px-3 py-2.5 rounded border text-xs font-medium transition-colors ${branch === b ? "border-teal-500 bg-teal-50 text-teal-700" : "border-border hover:bg-slate-50 text-foreground"}`}>
                      {b}
                    </button>
                  ))}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 bg-slate-50 border border-border rounded px-2.5 py-1.5">
                    <Search className="w-3.5 h-3.5 text-slate-400" />
                    <input placeholder="İhale şirketi ara..." className="text-xs bg-transparent outline-none flex-1" />
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {companies.map(c => (
                      <button key={c} className="w-full text-left px-3 py-2 rounded hover:bg-slate-50 text-xs text-foreground border border-transparent hover:border-border transition-colors">
                        {c}
                      </button>
                    ))}
                  </div>
                  <button className="flex items-center gap-1.5 text-xs text-teal-600 hover:underline">
                    <Plus className="w-3.5 h-3.5" /> Yeni şirket ekle
                  </button>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-t border-border">
              <button onClick={() => step > 1 ? setStep(s => s - 1) : setShowModal(false)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                <ChevronLeft className="w-3.5 h-3.5" /> {step > 1 ? "Geri" : "İptal"}
              </button>
              <button
                onClick={() => step < 2 ? (branch && setStep(2)) : setShowModal(false)}
                disabled={step === 1 && !branch}
                className="px-4 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-40 text-white text-xs font-medium rounded transition-colors"
              >
                {step < 2 ? "İleri" : "Kaydet"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── DOCUMENTS ────────────────────────────────────────────────────────────────
function DocumentsPage() {
  const docs = [
    { name: "BEDAS-2026-001-teknik-sartname.pdf", company: "BEDAŞ", branch: "Mobit", id: "BEDAS-2026-20260601-001", date: "12 Haz 2026", type: "PDF", size: "2.4 MB", group: "BEDAŞ İhale", status: "Sınıflandırıldı" },
    { name: "CEAS-2026-037-ihale-dokuman.pdf", company: "ÇEAŞ", branch: "Stok Enerji", id: "CEAS-2026-20260610-037", date: "12 Haz 2026", type: "PDF", size: "1.8 MB", group: "ÇEAŞ Teknik", status: "Sınıflandırıldı" },
    { name: "TOROSLAR-2026-19-sozlesme.pdf", company: "Toroslar EDAŞ", branch: "Depart", id: "TOROSLAR-2026-20260608-019", date: "12 Haz 2026", type: "PDF", size: "3.1 MB", group: "Toroslar Tender", status: "Sınıflandırılmamış" },
    { name: "ENERJISA-2026-221-teknik.docx", company: "Enerjisa", branch: "Mobit", id: "ENERJISA-2026-20260609-221", date: "11 Haz 2026", type: "DOCX", size: "890 KB", group: "Enerjisa Ankara", status: "Sınıflandırıldı" },
    { name: "BEDAS-2026-002-malzeme-listesi.xlsx", company: "BEDAŞ", branch: "Mobit", id: "BEDAS-2026-20260611-002", date: "11 Haz 2026", type: "XLSX", size: "340 KB", group: "BEDAŞ İhale", status: "Sınıflandırıldı" },
    { name: "DICLE-2026-044-sozlesme-taslak.pdf", company: "Dicle EDAŞ", branch: "Area", id: "DICLE-2026-20260609-044", date: "9 Haz 2026", type: "PDF", size: "1.2 MB", group: "Dicle İhale", status: "Sınıflandırıldı" },
  ];
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {[
          { label: "Yıl", placeholder: "2026" },
          { label: "Şube", placeholder: "Tümü" },
          { label: "Şirket", placeholder: "Tümü" },
          { label: "Tür", placeholder: "Tümü" },
        ].map((f, i) => (
          <div key={i} className="flex items-center gap-1.5 bg-white border border-border rounded px-2.5 py-1.5">
            <span className="text-[10px] text-muted-foreground">{f.label}:</span>
            <span className="text-xs text-foreground">{f.placeholder}</span>
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </div>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white border border-border rounded px-2.5 py-1.5">
            <Search className="w-3.5 h-3.5 text-slate-400" />
            <input placeholder="Belge ara..." className="text-xs bg-transparent outline-none w-36" />
          </div>
        </div>
      </div>
      <div className="bg-white border border-border rounded overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-border text-muted-foreground">
              <th className="text-left px-4 py-2.5 font-medium">Dosya Adı</th>
              <th className="text-left px-4 py-2.5 font-medium">İhale Şirketi</th>
              <th className="text-left px-4 py-2.5 font-medium">Şube</th>
              <th className="text-left px-4 py-2.5 font-medium">İhale ID</th>
              <th className="text-left px-4 py-2.5 font-medium">Tarih</th>
              <th className="text-left px-4 py-2.5 font-medium">Tür</th>
              <th className="text-left px-4 py-2.5 font-medium">Boyut</th>
              <th className="text-left px-4 py-2.5 font-medium">Durum</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {docs.map((d, i) => (
              <tr key={i} className="hover:bg-slate-50 transition-colors cursor-pointer">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                    <span className="font-mono text-[11px] text-foreground truncate max-w-[180px]">{d.name}</span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{d.company}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{d.branch}</td>
                <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{d.id}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{d.date}</td>
                <td className="px-4 py-2.5">
                  <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-slate-100 text-slate-600">{d.type}</span>
                </td>
                <td className="px-4 py-2.5 font-mono text-[10px] text-muted-foreground">{d.size}</td>
                <td className="px-4 py-2.5"><Badge label={d.status} /></td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-1">
                    <button className="text-slate-400 hover:text-teal-600 transition-colors p-1"><Eye className="w-3.5 h-3.5" /></button>
                    <button className="text-slate-400 hover:text-teal-600 transition-colors p-1"><Download className="w-3.5 h-3.5" /></button>
                    <button className="text-slate-400 hover:text-teal-600 transition-colors p-1"><Link className="w-3.5 h-3.5" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-border bg-slate-50">
          <span className="text-[10px] text-muted-foreground">6 / 142 belge gösteriliyor</span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, "...", 24].map((p, i) => (
              <button key={i} className={`w-6 h-6 flex items-center justify-center rounded text-[10px] font-medium ${p === 1 ? "bg-teal-600 text-white" : "text-muted-foreground hover:bg-slate-100"}`}>{p}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── FOLDER TREE ──────────────────────────────────────────────────────────────
function FolderTreePage() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ "2026": true, "MOBIT": true, "BEDAS": true });
  const toggle = (key: string) => setExpanded(p => ({ ...p, [key]: !p[key] }));
  return (
    <div className="p-6 flex gap-4 h-[calc(100vh-112px)]">
      <div className="w-72 bg-white border border-border rounded flex flex-col shrink-0">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input placeholder="Klasörde ara..." className="text-xs bg-transparent outline-none flex-1" />
        </div>
        <div className="flex-1 overflow-y-auto p-2 font-mono text-xs">
          {[
            { key: "2026", label: "2026", depth: 0, hasChildren: true },
            { key: "MOBIT", label: "MOBIT", depth: 1, hasChildren: true, parent: "2026" },
            { key: "BEDAS", label: "BEDAS", depth: 2, hasChildren: true, parent: "MOBIT" },
            { key: "BEDAS-001", label: "BEDAS-2026-20260601-001", depth: 3, hasChildren: false, parent: "BEDAS" },
            { key: "BEDAS-002", label: "BEDAS-2026-20260611-002", depth: 3, hasChildren: false, parent: "BEDAS" },
            { key: "CEAS", label: "CEAS", depth: 2, hasChildren: true, parent: "MOBIT" },
            { key: "STOK", label: "STOK_ENERJI", depth: 1, hasChildren: true, parent: "2026" },
          ].filter(item => {
            if (!item.parent) return true;
            return expanded[item.parent];
          }).map((item, i) => (
            <div key={i}
              style={{ paddingLeft: item.depth * 16 + 8 }}
              className="flex items-center gap-1.5 py-1 rounded cursor-pointer hover:bg-slate-50 transition-colors text-foreground">
              {item.hasChildren ? (
                <button onClick={() => toggle(item.key)} className="shrink-0">
                  {expanded[item.key]
                    ? <ChevronDown className="w-3 h-3 text-slate-400" />
                    : <ChevronRight className="w-3 h-3 text-slate-400" />}
                </button>
              ) : <div className="w-3 shrink-0" />}
              {item.hasChildren
                ? <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                : <File className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
              <span className="truncate text-[11px]">{item.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 bg-white border border-border rounded flex flex-col">
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border text-[10px] text-muted-foreground font-mono">
          <span>data</span><ChevronRight className="w-3 h-3" /><span>originals</span><ChevronRight className="w-3 h-3" /><span>2026</span><ChevronRight className="w-3 h-3" /><span>MOBIT</span><ChevronRight className="w-3 h-3" /><span className="text-foreground font-semibold">BEDAS</span>
        </div>
        <div className="flex-1 p-4">
          <div className="grid grid-cols-4 gap-3">
            {[
              { name: "BEDAS-2026-20260601-001", files: 3 },
              { name: "BEDAS-2026-20260611-002", files: 1 },
            ].map((f, i) => (
              <div key={i} className="border border-border rounded p-3 hover:border-teal-300 cursor-pointer transition-all hover:shadow-sm">
                <Folder className="w-8 h-8 text-amber-400 mb-2" />
                <p className="text-[10px] font-mono font-medium text-foreground break-all">{f.name}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{f.files} dosya</p>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-border px-4 py-3 flex items-center gap-3">
          <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded px-3 py-1.5 hover:bg-slate-50 transition-colors">
            <Upload className="w-3.5 h-3.5" /> Yükle
          </button>
          <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded px-3 py-1.5 hover:bg-slate-50 transition-colors">
            <Download className="w-3.5 h-3.5" /> Tümünü İndir
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── UPLOAD ───────────────────────────────────────────────────────────────────
function UploadPage() {
  const [dragging, setDragging] = useState(false);
  const [branch, setBranch] = useState("");
  const branches = ["Mobit", "Stok Enerji", "Depart", "Area", "Mobiser"];
  return (
    <div className="p-6 max-w-2xl space-y-5">
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={() => setDragging(false)}
        className={`border-2 border-dashed rounded-lg p-10 text-center transition-colors ${dragging ? "border-teal-400 bg-teal-50" : "border-slate-200 bg-white hover:border-teal-300"}`}
      >
        <Upload className={`w-8 h-8 mx-auto mb-3 ${dragging ? "text-teal-500" : "text-slate-300"}`} />
        <p className="text-sm font-medium text-foreground">Belgeleri buraya sürükleyin</p>
        <p className="text-xs text-muted-foreground mt-1">veya</p>
        <button className="mt-3 px-4 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded transition-colors">
          Dosya Seç
        </button>
        <p className="text-[10px] text-muted-foreground mt-3">PDF, DOCX, XLSX, PNG desteklenir · Maks. 50 MB</p>
      </div>

      <div className="bg-white border border-border rounded p-4 space-y-4">
        <h3 className="text-xs font-semibold text-foreground">Sınıflandırma Bilgileri</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Dahili Şube *</label>
            <select value={branch} onChange={e => setBranch(e.target.value)}
              className="w-full text-xs bg-slate-50 border border-border rounded px-2.5 py-2 outline-none focus:ring-1 focus:ring-teal-400">
              <option value="">Şube seçin...</option>
              {branches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">İhale Şirketi *</label>
            <div className="flex items-center gap-1.5 bg-slate-50 border border-border rounded px-2.5 py-2">
              <Search className="w-3 h-3 text-slate-400 shrink-0" />
              <input placeholder="Şirket ara..." className="text-xs bg-transparent outline-none flex-1" />
            </div>
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Telegram Grubu / İhale ID</label>
            <input placeholder="örn. BEDAS-2026-20260601-001" className="w-full text-xs font-mono bg-slate-50 border border-border rounded px-2.5 py-2 outline-none focus:ring-1 focus:ring-teal-400" />
          </div>
          <div>
            <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide block mb-1.5">Notlar</label>
            <input placeholder="İsteğe bağlı açıklama..." className="w-full text-xs bg-slate-50 border border-border rounded px-2.5 py-2 outline-none focus:ring-1 focus:ring-teal-400" />
          </div>
        </div>
        <div className="pt-2 flex items-center gap-3">
          <button className="px-5 py-2 bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium rounded transition-colors flex items-center gap-1.5">
            <Upload className="w-3.5 h-3.5" /> Yükle ve Sınıflandır
          </button>
          <button className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-xs font-medium rounded text-slate-600 transition-colors">İptal</button>
        </div>
      </div>
    </div>
  );
}

// ─── OBSIDIAN DEMO ────────────────────────────────────────────────────────────
function ObsidianPage() {
  const [activeNote, setActiveNote] = useState("BEDAS-2026-20260601-001");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ "2026": true, "MOBIT": true });
  const toggle = (k: string) => setExpanded(p => ({ ...p, [k]: !p[k] }));
  return (
    <div className="flex h-[calc(100vh-48px)] bg-[#1e1e2e] text-slate-200 font-mono text-xs">
      {/* Left: Vault Tree */}
      <aside className="w-56 border-r border-white/5 flex flex-col shrink-0 bg-[#181825]">
        <div className="px-3 py-2 border-b border-white/5">
          <div className="flex items-center gap-1.5 bg-white/5 rounded px-2 py-1">
            <Search className="w-3 h-3 text-slate-500" />
            <input placeholder="⌘K arama..." className="bg-transparent outline-none text-[10px] text-slate-400 flex-1 placeholder:text-slate-600" />
          </div>
        </div>
        <div className="px-2 py-1 border-b border-white/5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 px-1 py-1">VAULT: DocsBot</p>
        </div>
        <div className="flex-1 overflow-y-auto p-1 scrollbar-hide">
          {[
            { key: "2026", label: "📅 2026", depth: 0, has: true },
            { key: "MOBIT", label: "🏢 MOBIT", depth: 1, has: true, par: "2026" },
            { key: "BEDAS", label: "⚡ BEDAS", depth: 2, has: true, par: "MOBIT" },
            { key: "note1", label: "BEDAS-2026-20260601-001", depth: 3, has: false, par: "BEDAS", active: true },
            { key: "note2", label: "BEDAS-2026-20260611-002", depth: 3, has: false, par: "BEDAS" },
            { key: "CEAS", label: "⚡ CEAS", depth: 2, has: true, par: "MOBIT" },
            { key: "STOK", label: "🏢 STOK_ENERJI", depth: 1, has: true, par: "2026" },
          ].filter(item => !item.par || expanded[item.par]).map((item, i) => (
            <div key={i}
              style={{ paddingLeft: item.depth * 12 + 4 }}
              onClick={() => !item.has && setActiveNote(item.key)}
              className={`flex items-center gap-1 py-0.5 px-1 rounded cursor-pointer transition-colors text-[10px] ${item.key === activeNote ? "bg-teal-600/20 text-teal-400" : "text-slate-500 hover:text-slate-300 hover:bg-white/5"}`}
            >
              {item.has ? (
                <button onClick={e => { e.stopPropagation(); toggle(item.key); }}>
                  {expanded[item.key] ? <ChevronDown className="w-2.5 h-2.5" /> : <ChevronRight className="w-2.5 h-2.5" />}
                </button>
              ) : <div className="w-2.5" />}
              <span className="truncate">{item.label}</span>
            </div>
          ))}
        </div>
      </aside>

      {/* Center: Note Editor */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-2 border-b border-white/5 bg-[#1e1e2e]">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <span>vault</span><ChevronRight className="w-2.5 h-2.5" /><span>2026</span><ChevronRight className="w-2.5 h-2.5" /><span>MOBIT</span><ChevronRight className="w-2.5 h-2.5" /><span>BEDAS</span><ChevronRight className="w-2.5 h-2.5" /><span className="text-teal-400">BEDAS-2026-20260601-001</span>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button className="text-[10px] px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-slate-400 transition-colors flex items-center gap-1">
              <Download className="w-2.5 h-2.5" /> İndir
            </button>
            <button className="text-[10px] px-2 py-1 bg-teal-600/20 hover:bg-teal-600/30 rounded text-teal-400 transition-colors flex items-center gap-1">
              <Link className="w-2.5 h-2.5" /> ERP Görevine Ekle
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6 scrollbar-hide">
          {/* YAML Frontmatter */}
          <div className="bg-[#181825] border border-white/10 rounded mb-5 overflow-hidden">
            <div className="px-3 py-1.5 bg-white/5 border-b border-white/5">
              <span className="text-[9px] text-slate-600 uppercase tracking-widest">YAML Frontmatter</span>
            </div>
            <pre className="text-[11px] text-slate-400 p-4 leading-relaxed overflow-auto">
{`---
ihale_id: BEDAS-2026-20260601-001
ihale_sirketi: BEDAŞ
dahili_sube: Mobit
yil: 2026
tarih: 2026-06-01
belge_sayisi: 3
durum: aktif
etiketler: [elektrik, trafo, bakim]
erp_gorevler:
  - BEDAS-transformatör-bakım-raporu
  - Kablo-malzeme-listesi
---`}
            </pre>
          </div>

          {/* Note Content */}
          <div className="space-y-4">
            <h1 className="text-lg font-bold text-slate-100">BEDAS-2026-20260601-001</h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              Bu ihale, BEDAŞ'ın 2026 yılı kapsamında Mobit şubesi tarafından takip edilen{" "}
              <span className="text-teal-400 cursor-pointer hover:underline">[[transformatör bakım ve onarım]]</span> ihalesidir.
              Teknik şartname, malzeme listesi ve sözleşme taslağı bu klasörde bulunmaktadır.
            </p>

            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-300 border-b border-white/10 pb-1">Belgeler</h2>
              {[
                { name: "BEDAS-2026-001-teknik-sartname.pdf", size: "2.4 MB", date: "1 Haz 2026" },
                { name: "BEDAS-2026-001-sozlesme-taslagi.pdf", size: "1.1 MB", date: "1 Haz 2026" },
                { name: "BEDAS-2026-002-malzeme-listesi.xlsx", size: "340 KB", date: "11 Haz 2026" },
              ].map((d, i) => (
                <div key={i} className="flex items-center gap-2.5 bg-white/5 rounded px-3 py-2 hover:bg-white/8 cursor-pointer transition-colors">
                  <FileText className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                  <span className="text-slate-300 flex-1">{d.name}</span>
                  <span className="text-slate-600 text-[10px]">{d.size}</span>
                  <span className="text-slate-600 text-[10px]">{d.date}</span>
                  <Eye className="w-3 h-3 text-slate-600 hover:text-teal-400" />
                </div>
              ))}
            </div>

            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-300 border-b border-white/10 pb-1">Bağlantılı Notlar</h2>
              <div className="flex flex-wrap gap-2">
                {["[[BEDAS-2026-20260611-002]]", "[[Mobit-Genel-Tenderlar]]", "[[transformatör-bakım]]", "[[BEDAS-Ana]]"].map((l, i) => (
                  <span key={i} className="text-teal-400 hover:text-teal-300 cursor-pointer text-[11px] hover:underline">{l}</span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-300 border-b border-white/10 pb-1">Etiketler</h2>
              <div className="flex flex-wrap gap-1.5">
                {["elektrik", "trafo", "bakim", "BEDAS", "2026", "Mobit"].map((t, i) => (
                  <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-violet-600/20 text-violet-400 border border-violet-600/20"># {t}</span>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-slate-300 border-b border-white/10 pb-1">İnsan Notu</h2>
              <textarea rows={3} defaultValue="Teknik şartnamede trafo kapasitesi maddesinin netleştirilmesi gerekiyor. Mehmet K. ile koordinasyon sağlandı."
                className="w-full bg-white/5 border border-white/10 rounded px-3 py-2 text-sm text-slate-300 outline-none focus:border-teal-500/40 resize-none transition-colors" />
            </div>
          </div>
        </div>
        {/* Bottom toolbar */}
        <div className="border-t border-white/5 px-4 py-2 flex items-center gap-3 bg-[#181825]">
          <button className="text-[10px] px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-slate-400 flex items-center gap-1 transition-colors">
            <Eye className="w-2.5 h-2.5" /> Belge Önizle
          </button>
          <button className="text-[10px] px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-slate-400 flex items-center gap-1 transition-colors">
            <Download className="w-2.5 h-2.5" /> Tümünü İndir
          </button>
          <button className="text-[10px] px-2 py-1 bg-white/5 hover:bg-white/10 rounded text-slate-400 flex items-center gap-1 transition-colors">
            <GitBranch className="w-2.5 h-2.5" /> Karşılaştır
          </button>
          <button className="text-[10px] px-2 py-1 bg-teal-600/20 hover:bg-teal-600/30 rounded text-teal-400 flex items-center gap-1 transition-colors">
            <Cpu className="w-2.5 h-2.5" /> Özet Oluştur
          </button>
        </div>
      </main>

      {/* Right: Graph + Metadata */}
      <aside className="w-60 border-l border-white/5 flex flex-col bg-[#181825] shrink-0">
        <div className="px-3 py-2 border-b border-white/5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Graf Görünümü</p>
        </div>
        <div className="h-40 bg-[#13131f] m-2 rounded border border-white/5 flex items-center justify-center relative overflow-hidden">
          {/* Simple SVG graph */}
          <svg width="100%" height="100%" viewBox="0 0 200 140">
            <circle cx="100" cy="70" r="18" fill="#0D9488" fillOpacity="0.3" stroke="#0D9488" strokeWidth="1.5" />
            <text x="100" y="74" textAnchor="middle" fill="#5eead4" fontSize="7">BEDAS-001</text>
            <circle cx="40" cy="30" r="12" fill="#7c3aed" fillOpacity="0.3" stroke="#7c3aed" strokeWidth="1" />
            <text x="40" y="34" textAnchor="middle" fill="#a78bfa" fontSize="6">Mobit</text>
            <circle cx="160" cy="30" r="12" fill="#2563eb" fillOpacity="0.3" stroke="#2563eb" strokeWidth="1" />
            <text x="160" y="34" textAnchor="middle" fill="#93c5fd" fontSize="6">BEDAŞ</text>
            <circle cx="40" cy="110" r="10" fill="#d97706" fillOpacity="0.3" stroke="#d97706" strokeWidth="1" />
            <text x="40" y="114" textAnchor="middle" fill="#fcd34d" fontSize="5.5">Görev-1</text>
            <circle cx="160" cy="110" r="10" fill="#d97706" fillOpacity="0.3" stroke="#d97706" strokeWidth="1" />
            <text x="160" y="114" textAnchor="middle" fill="#fcd34d" fontSize="5.5">Görev-2</text>
            <circle cx="100" cy="130" r="9" fill="#059669" fillOpacity="0.3" stroke="#059669" strokeWidth="1" />
            <text x="100" y="134" textAnchor="middle" fill="#6ee7b7" fontSize="5.5">Belge×3</text>
            <line x1="100" y1="52" x2="52" y2="42" stroke="#7c3aed" strokeWidth="0.8" strokeOpacity="0.5" />
            <line x1="100" y1="52" x2="148" y2="42" stroke="#2563eb" strokeWidth="0.8" strokeOpacity="0.5" />
            <line x1="88" y1="82" x2="50" y2="102" stroke="#d97706" strokeWidth="0.8" strokeOpacity="0.5" />
            <line x1="112" y1="82" x2="150" y2="102" stroke="#d97706" strokeWidth="0.8" strokeOpacity="0.5" />
            <line x1="100" y1="88" x2="100" y2="121" stroke="#059669" strokeWidth="0.8" strokeOpacity="0.5" />
          </svg>
        </div>

        <div className="px-3 py-2 border-b border-white/5 border-t border-white/5">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Geri Bağlantılar (4)</p>
        </div>
        <div className="px-2 py-1 space-y-0.5">
          {["Mobit-Genel", "BEDAS-Ana", "transformatör-bakım", "Mobit-2026"].map((l, i) => (
            <div key={i} className="text-[10px] text-teal-400 hover:text-teal-300 cursor-pointer px-1 py-0.5 hover:bg-white/5 rounded">
              [[{l}]]
            </div>
          ))}
        </div>

        <div className="px-3 py-2 border-b border-white/5 border-t border-white/5 mt-1">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600">Meta Veri</p>
        </div>
        <div className="px-3 py-2 space-y-1.5 text-[10px]">
          {[
            ["İhale ID", "BEDAS-2026-001"],
            ["Şirket", "BEDAŞ"],
            ["Şube", "Mobit"],
            ["Yıl", "2026"],
            ["Belge", "3"],
            ["ERP Görev", "2"],
          ].map(([k, v], i) => (
            <div key={i} className="flex items-center justify-between">
              <span className="text-slate-600">{k}</span>
              <span className="text-slate-300">{v}</span>
            </div>
          ))}
        </div>

        <div className="px-3 py-2 border-t border-white/5 mt-auto">
          <p className="text-[9px] font-bold uppercase tracking-widest text-slate-600 mb-2">AI Önerileri</p>
          <div className="bg-teal-600/10 border border-teal-600/20 rounded p-2 text-[10px] text-teal-300">
            <Cpu className="w-3 h-3 mb-1 text-teal-500" />
            Teknik şartnamede birim fiyat bilgisi eksik. Otomatik çıkarım başlatılsın mı?
          </div>
        </div>
      </aside>
    </div>
  );
}

// ─── TENDER DETAIL ────────────────────────────────────────────────────────────
function TenderDetailPage() {
  return (
    <div className="p-6 flex gap-4">
      <div className="flex-1 space-y-4">
        <div className="bg-white border border-border rounded p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-sm font-bold text-foreground">BEDAS-2026-20260601-001</h2>
              <p className="text-xs text-muted-foreground mt-0.5">Transformatör bakım ve onarım ihalesi</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="text-xs px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-border rounded flex items-center gap-1.5 text-muted-foreground transition-colors">
                <Download className="w-3.5 h-3.5" /> Tümünü İndir
              </button>
              <button className="text-xs px-3 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded flex items-center gap-1.5 transition-colors">
                <BookOpen className="w-3.5 h-3.5" /> Obsidian'da Aç
              </button>
            </div>
          </div>
          <div className="grid grid-cols-4 gap-4 p-4 bg-slate-50 rounded border border-border">
            {[
              ["İhale Şirketi", "BEDAŞ"],
              ["Dahili Şube", "Mobit"],
              ["İhale ID", "BEDAS-2026-001"],
              ["Tarih", "1 Haz 2026"],
            ].map(([k, v], i) => (
              <div key={i}>
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{k}</p>
                <p className="text-xs font-semibold text-foreground mt-0.5">{v}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-border rounded">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-xs font-semibold">Belgeler (3)</h3>
          </div>
          <div className="divide-y divide-border">
            {[
              { name: "BEDAS-2026-001-teknik-sartname.pdf", size: "2.4 MB", date: "1 Haz 2026", type: "PDF" },
              { name: "BEDAS-2026-001-sozlesme-taslagi.pdf", size: "1.1 MB", date: "1 Haz 2026", type: "PDF" },
              { name: "BEDAS-2026-002-malzeme-listesi.xlsx", size: "340 KB", date: "11 Haz 2026", type: "XLSX" },
            ].map((d, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <FileText className="w-4 h-4 text-teal-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-mono font-medium text-foreground">{d.name}</p>
                  <p className="text-[10px] text-muted-foreground">{d.type} · {d.size} · {d.date}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button className="text-slate-400 hover:text-teal-600 transition-colors p-1"><Eye className="w-3.5 h-3.5" /></button>
                  <button className="text-slate-400 hover:text-teal-600 transition-colors p-1"><Download className="w-3.5 h-3.5" /></button>
                  <button className="text-slate-400 hover:text-teal-600 transition-colors p-1"><Link className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-border rounded">
          <div className="px-4 py-3 border-b border-border">
            <h3 className="text-xs font-semibold">İlgili ERP Görevleri</h3>
          </div>
          <div className="divide-y divide-border">
            {[
              { title: "BEDAS transformatör bakım raporu hazırlama", assignee: "Mehmet Kaya", status: "Devam Ediyor" },
              { title: "Kablo malzeme listesi hazırlama", assignee: "Ayşe Demir", status: "Tamamlama Talep" },
            ].map((t, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                <ClipboardList className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-medium text-foreground">{t.title}</p>
                  <p className="text-[10px] text-muted-foreground">{t.assignee}</p>
                </div>
                <Badge label={t.status} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="w-64 space-y-4 shrink-0">
        <div className="bg-amber-50 border border-amber-200 rounded p-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <p className="text-xs font-semibold text-amber-700">Eksik Bilgiler</p>
          </div>
          <ul className="text-[10px] text-amber-600 space-y-1 list-disc list-inside">
            <li>Tahmini birim fiyat girilmedi</li>
            <li>Teknik gereksinimlerin tamamı yüklenmedi</li>
          </ul>
        </div>

        <div className="bg-white border border-border rounded">
          <div className="px-3 py-2.5 border-b border-border">
            <h3 className="text-xs font-semibold">Aktivite Zaman Çizelgesi</h3>
          </div>
          <div className="p-3 space-y-3">
            {[
              { text: "3. belge eklendi", time: "11 Haz" },
              { text: "ERP görevi oluşturuldu", time: "5 Haz" },
              { text: "İhale sınıflandırıldı", time: "1 Haz" },
              { text: "Telegram'dan alındı", time: "1 Haz" },
            ].map((a, i) => (
              <div key={i} className="flex items-start gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-teal-500 mt-1.5 shrink-0" />
                <div>
                  <p className="text-[10px] font-medium text-foreground">{a.text}</p>
                  <p className="text-[9px] text-muted-foreground">{a.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── AI EXTRACTION ────────────────────────────────────────────────────────────
function AIExtractionPage() {
  return (
    <div className="p-6 space-y-5">
      <div className="bg-violet-50 border border-violet-200 rounded px-4 py-3 flex items-center gap-3">
        <Cpu className="w-4 h-4 text-violet-500 shrink-0" />
        <p className="text-xs text-violet-700">Bu sayfa planlanan AI özelliklerini önizlemektedir. Bazı işlevler henüz aktif değildir.</p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 space-y-4">
          <div className="bg-white border border-border rounded">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Çıkarılan Alanlar — BEDAS-2026-20260601-001</h3>
              <Badge label="Aktif" />
            </div>
            <div className="p-4 space-y-3">
              {[
                { field: "Tahmini Bedel", value: "₺4.850.000", confidence: 87, missing: false },
                { field: "İhale Tarihi", value: "15 Temmuz 2026", confidence: 96, missing: false },
                { field: "Son Teklif Tarihi", value: "10 Temmuz 2026", confidence: 91, missing: false },
                { field: "Teminat Mektubu", value: "%3 geçici teminat", confidence: 78, missing: false },
                { field: "Teknik Kapasite", value: "—", confidence: 0, missing: true },
                { field: "Adet / Miktar", value: "—", confidence: 0, missing: true },
              ].map((f, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-36 shrink-0">
                    <p className="text-[10px] font-medium text-muted-foreground">{f.field}</p>
                  </div>
                  <div className="flex-1">
                    {f.missing ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Eksik</span>
                        <input placeholder="Manuel girin..." className="text-xs bg-red-50 border border-red-200 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-red-300 flex-1" />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-foreground">{f.value}</span>
                        <div className="flex items-center gap-1 ml-auto">
                          <div className="h-1.5 w-20 bg-slate-100 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${f.confidence}%` }} />
                          </div>
                          <span className="text-[10px] text-muted-foreground">%{f.confidence}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-border rounded">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-xs font-semibold">İhale Karşılaştırma</h3>
              <button className="text-xs text-teal-600 hover:underline flex items-center gap-1">
                <Plus className="w-3 h-3" /> İhale Ekle
              </button>
            </div>
            <div className="p-4">
              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="font-medium text-muted-foreground">Alan</div>
                <div className="font-medium text-foreground">BEDAS-2026-001</div>
                <div className="font-medium text-muted-foreground text-slate-400">Karşılaştırılacak ihale seç...</div>
                {[
                  ["Tahmini Bedel", "₺4.850.000", "—"],
                  ["İhale Tarihi", "15 Tem 2026", "—"],
                  ["Teminat", "%3", "—"],
                ].map(([k, v1, v2], i) => (
                  <>
                    <div key={`k${i}`} className="text-[10px] text-muted-foreground py-1.5 border-t border-border">{k}</div>
                    <div key={`v1${i}`} className="text-[10px] text-foreground py-1.5 border-t border-border font-medium">{v1}</div>
                    <div key={`v2${i}`} className="text-[10px] text-slate-400 py-1.5 border-t border-border">{v2}</div>
                  </>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-border rounded">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Belgeye Soru Sor</h3>
            </div>
            <div className="p-3 space-y-2">
              <textarea rows={3} placeholder="Örn: Teknik garantinin kapsamı nedir?" className="w-full text-xs bg-slate-50 border border-border rounded px-2.5 py-2 resize-none outline-none focus:ring-1 focus:ring-teal-400" />
              <button className="w-full bg-teal-600 hover:bg-teal-700 text-white text-xs font-medium py-1.5 rounded transition-colors flex items-center justify-center gap-1.5">
                <Cpu className="w-3.5 h-3.5" /> Soru Sor
              </button>
              <div className="bg-slate-50 border border-border rounded p-2.5 text-xs text-muted-foreground">
                <p className="font-medium text-foreground mb-1">Yanıt:</p>
                <p>Teknik garanti süresi, sözleşme imzalanmasından itibaren 24 ay olarak belirtilmiştir (Madde 7.3).</p>
                <p className="text-[10px] text-slate-400 mt-1">Kaynak: teknik-sartname.pdf, sayfa 12</p>
              </div>
            </div>
          </div>

          <div className="bg-white border border-border rounded">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-xs font-semibold">Özet Rapor Oluştur</h3>
            </div>
            <div className="p-3 space-y-2">
              <button className="w-full bg-slate-50 hover:bg-slate-100 border border-border text-xs font-medium py-2 rounded transition-colors flex items-center justify-center gap-1.5 text-foreground">
                <FileSearch className="w-3.5 h-3.5 text-teal-600" /> Özet Oluştur
              </button>
              <button className="w-full bg-slate-50 hover:bg-slate-100 border border-border text-xs font-medium py-2 rounded transition-colors flex items-center justify-center gap-1.5 text-foreground">
                <ExternalLink className="w-3.5 h-3.5 text-teal-600" /> Word'e Aktar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PAGE TITLES ──────────────────────────────────────────────────────────────
const PAGE_TITLES: Record<Page, string> = {
  home: "Ana Sayfa",
  "erp-overview": "ERP-TAKIP — Genel Bakış",
  employees: "Çalışanlar",
  tasks: "Görevler",
  approvals: "Tamamlama Onayları",
  messages: "Mesajlar",
  notifications: "Bildirimler",
  "account-requests": "Hesap Talepleri",
  "tender-dashboard": "Tender Hub — Dashboard",
  "telegram-groups": "Telegram Grupları",
  documents: "Belgeler",
  "folder-tree": "Klasör Ağacı",
  upload: "Belge Yükle",
  obsidian: "Obsidian Demo",
  "tender-detail": "İhale Detayı",
  "ai-extraction": "AI Çıkarımı",
};

export default function App() {
  const [page, setPage] = useState<Page>("home");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className="flex h-screen bg-background overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
      <Sidebar
        current={page}
        setPage={setPage}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar title={PAGE_TITLES[page]} setPage={setPage} />
        <main className="flex-1 overflow-auto">
          {page === "home" && <HomePage setPage={setPage} />}
          {page === "erp-overview" && <ERPOverviewPage setPage={setPage} />}
          {page === "employees" && <EmployeesPage />}
          {page === "tasks" && <TasksPage />}
          {page === "approvals" && <ApprovalsPage />}
          {page === "messages" && <MessagesPage />}
          {page === "notifications" && <NotificationsPage />}
          {page === "account-requests" && <AccountRequestsPage />}
          {page === "tender-dashboard" && <TenderDashboardPage setPage={setPage} />}
          {page === "telegram-groups" && <TelegramGroupsPage />}
          {page === "documents" && <DocumentsPage />}
          {page === "folder-tree" && <FolderTreePage />}
          {page === "upload" && <UploadPage />}
          {page === "obsidian" && <ObsidianPage />}
          {page === "tender-detail" && <TenderDetailPage />}
          {page === "ai-extraction" && <AIExtractionPage />}
        </main>
      </div>
    </div>
  );
}
