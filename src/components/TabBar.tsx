import { useRef, useState } from "react";
import {
  Table2,
  Eye,
  TerminalSquare,
  Columns3,
  Plus,
  X,
} from "lucide-react";
import { useTabStore, type Tab } from "../stores/tabStore";
import { useTranslation } from "react-i18next";

export default function TabBar() {
  const { t } = useTranslation("database");
  const { tabs, activeTabId, setActiveTab, closeTab, openQueryTab, reorderTabs } =
    useTabStore();

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  function getIcon(tab: Tab) {
    switch (tab.type) {
      case "table":
        return tab.tableType === "view" ? (
          <Eye className="h-3 w-3 shrink-0" />
        ) : (
          <Table2 className="h-3 w-3 shrink-0" />
        );
      case "query":
        return <TerminalSquare className="h-3 w-3 shrink-0" />;
      case "structure":
        return <Columns3 className="h-3 w-3 shrink-0" />;
    }
  }

  function handleDragStart(e: React.DragEvent, idx: number) {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setDragOverIdx(idx);
  }

  function handleDrop(e: React.DragEvent, idx: number) {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) {
      reorderTabs(dragIdx, idx);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  }

  function handleDragEnd() {
    setDragIdx(null);
    setDragOverIdx(null);
  }

  return (
    <div className="flex h-10 shrink-0 items-center border-b border-border-primary bg-bg-secondary">
      <div
        ref={scrollRef}
        className="flex flex-1 items-center overflow-x-auto"
      >
        {tabs.map((tab, idx) => {
          const isActive = activeTabId === tab.id;
          const isDragOver = dragOverIdx === idx && dragIdx !== idx;

          return (
            <div
              key={tab.id}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={(e) => handleDrop(e, idx)}
              onDragEnd={handleDragEnd}
              className={`group relative flex items-center gap-1.5 border-r border-border-primary shrink-0 transition-colors ${
                isActive
                  ? "bg-bg-primary text-text-primary"
                  : "text-text-muted hover:bg-bg-hover hover:text-text-secondary"
              } ${isDragOver ? "border-l-2 border-l-accent" : ""}`}
            >
              {/* Active indicator - top border */}
              {isActive && (
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-accent" />
              )}

              <button
                onClick={() => setActiveTab(tab.id)}
                onDoubleClick={() => {
                  if (tab.isPreview) {
                    useTabStore.getState().promotePreview(tab.id);
                  }
                }}
                className="flex items-center gap-1.5 py-2 pl-3 pr-1 text-xs"
              >
                <span className={isActive ? "text-accent" : ""}>
                  {getIcon(tab)}
                </span>
                <span
                  className={`max-w-[140px] truncate ${
                    tab.isPreview ? "italic" : ""
                  }`}
                >
                  {tab.title}
                </span>
                {tab.isDirty && (
                  <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-warning shrink-0" />
                )}
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="mr-1 rounded p-0.5 opacity-0 group-hover:opacity-100 hover:bg-bg-hover transition-all"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}

        {/* New query tab button */}
        <button
          onClick={() => openQueryTab()}
          className="flex items-center gap-1 px-2 py-2 text-text-muted hover:text-text-secondary transition-colors"
          title={t("tabs.newQuery")}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
