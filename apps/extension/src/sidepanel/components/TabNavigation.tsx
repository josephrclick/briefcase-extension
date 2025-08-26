import React from "react";
import { useUIStore, type TabId } from "../stores/ui.store";
import clsx from "clsx";

interface Tab {
  id: TabId;
  label: string;
  icon?: string;
}

const tabs: Tab[] = [
  { id: "summarize", label: "Summarize", icon: "📄" },
  { id: "compare", label: "Compare", icon: "⚖️" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

const TabNavigation: React.FC = () => {
  const { activeTab, setActiveTab } = useUIStore();

  return (
    <nav className="tab-navigation">
      <div className="tab-list" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`tab-panel-${tab.id}`}
            className={clsx("tab-button", {
              "tab-button--active": activeTab === tab.id,
            })}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.icon && (
              <span className="tab-icon" aria-hidden="true">
                {tab.icon}
              </span>
            )}
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
};

export default TabNavigation;
