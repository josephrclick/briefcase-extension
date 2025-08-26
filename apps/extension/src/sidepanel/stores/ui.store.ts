import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { persist } from "zustand/middleware";

export type TabId = "summarize" | "compare" | "settings";

export interface UIState {
  // Current UI state
  activeTab: TabId;
  theme: "light" | "dark" | "system";
  sidebarCollapsed: boolean;
  showExtractedText: boolean;

  // Actions
  setActiveTab: (tab: TabId) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  toggleSidebar: () => void;
  toggleExtractedText: () => void;
  reset: () => void;
}

export const useUIStore = create<UIState>()(
  persist(
    immer((set) => ({
      // Initial state
      activeTab: "summarize",
      theme: "system",
      sidebarCollapsed: false,
      showExtractedText: false,

      // Actions
      setActiveTab: (tab) => {
        set((state) => {
          state.activeTab = tab;
        });
      },

      setTheme: (theme) => {
        set((state) => {
          state.theme = theme;
        });
      },

      toggleSidebar: () => {
        set((state) => {
          state.sidebarCollapsed = !state.sidebarCollapsed;
        });
      },

      toggleExtractedText: () => {
        set((state) => {
          state.showExtractedText = !state.showExtractedText;
        });
      },

      reset: () => {
        set((state) => {
          state.activeTab = "summarize";
          state.theme = "system";
          state.sidebarCollapsed = false;
          state.showExtractedText = false;
        });
      },
    })),
    {
      name: "briefcase-ui",
    },
  ),
);
