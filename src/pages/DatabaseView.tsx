import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { MousePointerClick } from "lucide-react";
import { useConnectionStore } from "../stores/connectionStore";
import { useTabStore } from "../stores/tabStore";
import TopBar from "../components/TopBar";
import Sidebar from "../components/Sidebar";
import TabBar from "../components/TabBar";
import DataTable from "../components/DataTable";
import SqlEditor from "../components/SqlEditor";
import TableStructure from "../components/TableStructure";
import QueryHistory from "../components/QueryHistory";
import ERDiagram from "../components/ERDiagram";
import AiChat from "../components/AiChat";
import CommandPalette from "../components/CommandPalette";
import { useTranslation } from "react-i18next";
import { useAiStore } from "../stores/aiStore";

export default function DatabaseView() {
  const navigate = useNavigate();
  const { activeConnectionId } = useConnectionStore();
  const { tabs, activeTabId, openQueryTab, openHistoryTab, closeTab } = useTabStore();
  const { togglePanel: toggleAiPanel } = useAiStore();
  const { t } = useTranslation("database");
  const [showPalette, setShowPalette] = useState(false);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  useEffect(() => {
    if (!activeConnectionId) {
      navigate("/");
    }
  }, [activeConnectionId]);

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const isMod = e.metaKey || e.ctrlKey;

      if (isMod && e.key === "t") {
        e.preventDefault();
        openQueryTab();
      }

      if (isMod && e.key === "y") {
        e.preventDefault();
        openHistoryTab();
      }

      if (isMod && e.key === "k") {
        e.preventDefault();
        setShowPalette((v) => !v);
      }

      if (isMod && e.key === "i") {
        e.preventDefault();
        toggleAiPanel();
      }

      if (isMod && e.key === "w") {
        e.preventDefault();
        if (activeTabId) {
          closeTab(activeTabId);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTabId, openQueryTab, openHistoryTab, closeTab]);

  if (!activeConnectionId) return null;

  return (
    <>
    <div className="flex h-full flex-col">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <div className="w-64 shrink-0 border-r border-border-primary bg-bg-secondary overflow-hidden">
          <Sidebar />
        </div>

        {/* Main Content */}
        <div className="flex-1 overflow-hidden bg-bg-primary flex flex-col">
          {/* Tab bar */}
          <TabBar />

          {/* Content area */}
          <div className="flex-1 overflow-hidden">
            {activeTab ? (
              <>
                {/* Table data tabs */}
                {tabs
                  .filter((t) => t.type === "table")
                  .map((tab) => (
                    <div
                      key={tab.id}
                      className={`h-full ${
                        activeTabId === tab.id ? "" : "hidden"
                      }`}
                    >
                      <DataTable
                        schema={tab.schema!}
                        table={tab.table!}
                        tabId={tab.id}
                        tableType={tab.tableType}
                      />
                    </div>
                  ))}

                {/* Structure tabs */}
                {tabs
                  .filter((t) => t.type === "structure")
                  .map((tab) => (
                    <div
                      key={tab.id}
                      className={`h-full ${
                        activeTabId === tab.id ? "" : "hidden"
                      }`}
                    >
                      <TableStructure
                        schema={tab.schema!}
                        table={tab.table!}
                      />
                    </div>
                  ))}

                {/* Query tabs */}
                {tabs
                  .filter((t) => t.type === "query")
                  .map((tab) => (
                    <div
                      key={tab.id}
                      className={`h-full ${
                        activeTabId === tab.id ? "" : "hidden"
                      }`}
                    >
                      <SqlEditor
                        tabId={tab.id}
                        initialSql={tab.state.sql}
                      />
                    </div>
                  ))}

                {/* History tabs */}
                {tabs
                  .filter((t) => t.type === "history")
                  .map((tab) => (
                    <div
                      key={tab.id}
                      className={`h-full ${
                        activeTabId === tab.id ? "" : "hidden"
                      }`}
                    >
                      <QueryHistory />
                    </div>
                  ))}

                {/* ER Diagram tabs */}
                {tabs
                  .filter((t) => t.type === "er-diagram")
                  .map((tab) => (
                    <div
                      key={tab.id}
                      className={`h-full ${
                        activeTabId === tab.id ? "" : "hidden"
                      }`}
                    >
                      <ERDiagram schema={tab.schema!} />
                    </div>
                  ))}
              </>
            ) : (
              <div className="flex h-full items-center justify-center text-text-muted">
                <div className="text-center">
                  <MousePointerClick className="mx-auto h-10 w-10 mb-3" />
                  <p className="text-sm">{t("emptyState.selectTable")}</p>
                  <p className="mt-2 text-xs">
                    {t("emptyState.or")}{" "}
                    <button
                      onClick={() => openQueryTab()}
                      className="text-accent hover:text-accent-hover underline"
                    >
                      {t("emptyState.newQueryTab")}
                    </button>{" "}
                    {t("emptyState.open")}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* AI Chat Panel */}
        <AiChat />
      </div>
    </div>
    <CommandPalette isOpen={showPalette} onClose={() => setShowPalette(false)} />
    </>
  );
}
