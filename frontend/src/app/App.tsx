import { Suspense, lazy, useEffect, useState } from "react";
import { ERPSession, logoutERP } from "./api";
import type { Page, EmployeeFocus } from "./lib/types";
import { PAGE_TITLES } from "./lib/constants";
import { readStoredSession, persistSession, isAdmin } from "./lib/helpers";
import { useLiveData } from "./hooks/useLiveData";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";

const HomePage = lazy(() => import("./pages/HomePage").then((m) => ({ default: m.HomePage })));
const ERPOverviewPage = lazy(() => import("./pages/ERPOverviewPage").then((m) => ({ default: m.ERPOverviewPage })));
const EmployeesPage = lazy(() => import("./pages/EmployeesPage").then((m) => ({ default: m.EmployeesPage })));
const TasksPage = lazy(() => import("./pages/TasksPage").then((m) => ({ default: m.TasksPage })));
const ApprovalsPage = lazy(() => import("./pages/ApprovalsPage").then((m) => ({ default: m.ApprovalsPage })));
const MessagesPage = lazy(() => import("./pages/MessagesPage").then((m) => ({ default: m.MessagesPage })));
const CompanyChatPage = lazy(() => import("./pages/CompanyChatPage").then((m) => ({ default: m.CompanyChatPage })));
const NotificationsPage = lazy(() => import("./pages/NotificationsPage").then((m) => ({ default: m.NotificationsPage })));
const AuthGate = lazy(() => import("./pages/AuthGate").then((m) => ({ default: m.AuthGate })));
const AccountRequestsPage = lazy(() => import("./pages/AccountRequestsPage").then((m) => ({ default: m.AccountRequestsPage })));
const TenderDashboardPage = lazy(() => import("./pages/TenderDashboardPage").then((m) => ({ default: m.TenderDashboardPage })));
const TelegramGroupsPage = lazy(() => import("./pages/TelegramGroupsPage").then((m) => ({ default: m.TelegramGroupsPage })));
const DocumentsPage = lazy(() => import("./pages/DocumentsPage").then((m) => ({ default: m.DocumentsPage })));
const FolderTreePage = lazy(() => import("./pages/FolderTreePage").then((m) => ({ default: m.FolderTreePage })));
const UploadPage = lazy(() => import("./pages/UploadPage").then((m) => ({ default: m.UploadPage })));
const ObsidianPage = lazy(() => import("./pages/ObsidianPage").then((m) => ({ default: m.ObsidianPage })));
const TenderDetailPage = lazy(() => import("./pages/TenderDetailPage").then((m) => ({ default: m.TenderDetailPage })));
const AIExtractionPage = lazy(() => import("./pages/AIExtractionPage").then((m) => ({ default: m.AIExtractionPage })));
const TenderBulletinPage = lazy(() => import("./pages/TenderBulletinPage").then((m) => ({ default: m.TenderBulletinPage })));
const TenderResultsPage = lazy(() => import("./pages/TenderResultsPage").then((m) => ({ default: m.TenderResultsPage })));
const BidMemoryPage = lazy(() => import("./pages/BidMemoryPage").then((m) => ({ default: m.BidMemoryPage })));
const CompanyBriefingPage = lazy(() => import("./pages/CompanyBriefingPage").then((m) => ({ default: m.CompanyBriefingPage })));
const CompanyQualificationPage = lazy(() => import("./pages/CompanyQualificationPage").then((m) => ({ default: m.CompanyQualificationPage })));
const CompanyCredentialsPage = lazy(() => import("./pages/CompanyCredentialsPage").then((m) => ({ default: m.CompanyCredentialsPage })));
const FeedbackPage = lazy(() => import("./pages/FeedbackPage").then((m) => ({ default: m.FeedbackPage })));

function PageFallback() {
  return <div className="p-6 text-xs text-muted-foreground">Yükleniyor…</div>;
}

export default function App() {
  const [page, setPage] = useState<Page>("erp-overview");
  const [employeeFocus, setEmployeeFocus] = useState<EmployeeFocus>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [session, setSession] = useState<ERPSession | null>(() => readStoredSession());
  const live = useLiveData(session);
  const userAllowedPages: Page[] = ["home", "erp-overview", "employees", "tasks", "messages", "company-chat", "notifications"];
  const navigate = (next: Page) => {
    if (next !== "employees") setEmployeeFocus(null);
    setPage(next);
  };
  const openOverdueEmployees = () => {
    setEmployeeFocus("overdue");
    setPage("employees");
  };

  useEffect(() => {
    if (session && !isAdmin(session) && !userAllowedPages.includes(page)) {
      setPage("erp-overview");
    }
  }, [page, session?.role]);

  useEffect(() => {
    const handleExpiredSession = () => {
      persistSession(null);
      setSession(null);
      setEmployeeFocus(null);
      setPage("erp-overview");
    };
    window.addEventListener("docsbot:session-expired", handleExpiredSession);
    return () => window.removeEventListener("docsbot:session-expired", handleExpiredSession);
  }, []);

  if (!session) {
    return (
      <Suspense fallback={<PageFallback />}>
        <AuthGate onSession={(next) => { setSession(next); setEmployeeFocus(null); setPage("erp-overview"); }} />
      </Suspense>
    );
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden" style={{ fontFamily: "'Inter', sans-serif" }}>
      <Sidebar
        current={page}
        setPage={navigate}
        collapsed={sidebarCollapsed}
        setCollapsed={setSidebarCollapsed}
        session={session}
        live={live}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          title={PAGE_TITLES[page]}
          setPage={navigate}
          session={session}
          live={live}
          onLogout={async () => {
            await logoutERP(session.refresh_token).catch(() => undefined);
            persistSession(null);
            setSession(null);
            setEmployeeFocus(null);
            setPage("erp-overview");
          }}
        />
        <main className="flex-1 overflow-auto">
          <Suspense fallback={<PageFallback />}>
          {page === "home" && <HomePage setPage={navigate} live={live} isAdmin={isAdmin(session)} onEmployeeDrilldown={openOverdueEmployees} />}
          {page === "erp-overview" && <ERPOverviewPage setPage={navigate} live={live} onEmployeeDrilldown={openOverdueEmployees} />}
          {page === "employees" && <EmployeesPage live={live} session={session} focus={employeeFocus} onFocusClear={() => setEmployeeFocus(null)} />}
          {page === "tasks" && <TasksPage live={live} session={session} />}
          {page === "approvals" && isAdmin(session) && <ApprovalsPage live={live} />}
          {page === "messages" && <MessagesPage live={live} session={session} />}
          {page === "company-chat" && <CompanyChatPage session={session} />}
          {page === "notifications" && <NotificationsPage live={live} />}
          {page === "account-requests" && isAdmin(session) && <AccountRequestsPage live={live} />}
          {page === "tender-dashboard" && isAdmin(session) && <TenderDashboardPage setPage={navigate} live={live} />}
          {page === "telegram-groups" && isAdmin(session) && <TelegramGroupsPage live={live} />}
          {page === "documents" && isAdmin(session) && <DocumentsPage live={live} />}
          {page === "folder-tree" && isAdmin(session) && <FolderTreePage live={live} />}
          {page === "upload" && isAdmin(session) && <UploadPage live={live} />}
          {page === "obsidian" && isAdmin(session) && <ObsidianPage live={live} />}
          {page === "tender-detail" && isAdmin(session) && <TenderDetailPage />}
          {page === "ai-extraction" && isAdmin(session) && <AIExtractionPage />}
          {page === "tender-bulletin" && isAdmin(session) && <TenderBulletinPage />}
          {page === "tender-results" && isAdmin(session) && <TenderResultsPage />}
          {page === "bid-memory" && isAdmin(session) && <BidMemoryPage setPage={navigate} />}
          {page === "company-briefing" && isAdmin(session) && <CompanyBriefingPage setPage={navigate} />}
          {page === "company-qualification" && isAdmin(session) && <CompanyQualificationPage />}
          {page === "company-credentials" && isAdmin(session) && <CompanyCredentialsPage />}
          {page === "feedback" && isAdmin(session) && <FeedbackPage />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
