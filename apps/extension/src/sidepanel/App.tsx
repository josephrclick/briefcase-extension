import { HydrationBoundary } from "./hooks/useHydration";
import { useExtensionPort } from "./hooks/useExtensionPort";
import Header from "./components/Header";
import TabNavigation from "./components/TabNavigation";
import SummarizeTab from "./components/tabs/SummarizeTab";
import CompareTab from "./components/tabs/CompareTab";
import SettingsTab from "./components/tabs/SettingsTab";
import { useUIStore } from "./stores/ui.store";

function AppContent() {
  const { activeTab } = useUIStore();

  // Initialize extension port connection
  useExtensionPort();

  const renderActiveTab = () => {
    switch (activeTab) {
      case "summarize":
        return <SummarizeTab />;
      case "compare":
        return <CompareTab />;
      case "settings":
        return <SettingsTab />;
      default:
        return <SummarizeTab />;
    }
  };

  return (
    <div className="app">
      <Header />
      <TabNavigation />
      <main className="app-main">{renderActiveTab()}</main>
    </div>
  );
}

function App() {
  return (
    <HydrationBoundary
      fallback={
        <div className="loading-container">
          <div className="loading-spinner" />
          <p>Loading Briefcase...</p>
        </div>
      }
    >
      <AppContent />
    </HydrationBoundary>
  );
}

export default App;
