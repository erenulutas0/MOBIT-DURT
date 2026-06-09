import "../styles/fonts.css";
import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { DashboardView } from "./components/DashboardView";
import { TendersView } from "./components/TendersView";
import { DocumentsView } from "./components/DocumentsView";
import { FolderTreeView } from "./components/FolderTreeView";
import { UploadView } from "./components/UploadView";
import { TelegramGroupsView } from "./components/TelegramGroupsView";
import { ObsidianVaultView } from "./components/ObsidianVaultView";
import { SettingsView } from "./components/SettingsView";

type View =
  | "dashboard"
  | "tenders"
  | "documents"
  | "folder-tree"
  | "upload"
  | "telegram"
  | "obsidian"
  | "settings";

export default function App() {
  {/* MARKER-MAKE-KIT-INVOKED */}
  const [activeView, setActiveView] = useState<View>("dashboard");

  const renderView = () => {
    switch (activeView) {
      case "dashboard": return <DashboardView />;
      case "tenders": return <TendersView />;
      case "documents": return <DocumentsView />;
      case "folder-tree": return <FolderTreeView />;
      case "upload": return <UploadView />;
      case "telegram": return <TelegramGroupsView />;
      case "obsidian": return <ObsidianVaultView />;
      case "settings": return <SettingsView />;
      default: return <DashboardView />;
    }
  };

  const fullHeight = activeView === "folder-tree" || activeView === "documents";

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
        background: "var(--background)",
        fontFamily: "Inter, sans-serif",
      }}
    >
      <Sidebar activeView={activeView} onNavigate={(id) => setActiveView(id as View)} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        <TopBar />
        <main
          style={{
            flex: 1,
            overflow: fullHeight ? "hidden" : "auto",
            display: fullHeight ? "flex" : "block",
            flexDirection: "column",
          }}
        >
          {renderView()}
        </main>
      </div>
    </div>
  );
}
