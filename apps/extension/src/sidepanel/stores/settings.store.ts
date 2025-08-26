import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { persist, createJSONStorage } from "zustand/middleware";

export interface ExtensionSettings {
  // Default summary settings
  defaultFormat: "md" | "txt";
  defaultLength: "brief" | "medium" | "verbose";
  defaultLevel: "kinder" | "high_school" | "college" | "phd";
  defaultStyle: "plain" | "bullets" | "executive";

  // LLM Provider settings
  defaultProvider: string;
  modelConfigs: Record<
    string,
    {
      enabled: boolean;
      apiKey?: string;
      baseURL?: string;
      model?: string;
    }
  >;

  // UI preferences
  autoSave: boolean;
  showNotifications: boolean;
  libraryFolderPath?: string;

  // Privacy settings
  disabledSites: string[];
  allowCloudProviders: boolean;
}

export interface SettingsState extends ExtensionSettings {
  // Loading state
  isLoading: boolean;

  // Actions
  updateSettings: (settings: Partial<ExtensionSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
  addDisabledSite: (site: string) => void;
  removeDisabledSite: (site: string) => void;
  updateModelConfig: (
    providerId: string,
    config: Partial<ExtensionSettings["modelConfigs"][string]>,
  ) => void;
}

const defaultSettings: ExtensionSettings = {
  defaultFormat: "md",
  defaultLength: "medium",
  defaultLevel: "high_school",
  defaultStyle: "bullets",
  defaultProvider: "openai:gpt-4o-mini",
  modelConfigs: {
    "openai:gpt-4o-mini": { enabled: true },
    "ollama:llama3.2": { enabled: true, baseURL: "http://localhost:11434" },
  },
  autoSave: true,
  showNotifications: true,
  disabledSites: [],
  allowCloudProviders: true,
};

// Custom Chrome storage for settings
const chromeStorage = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      const result = await chrome.storage.sync.get(key);
      return result[key] ? JSON.stringify(result[key]) : null;
    } catch (error) {
      console.error("Failed to get from chrome.storage:", error);
      return localStorage.getItem(key);
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      const parsedValue = JSON.parse(value);
      await chrome.storage.sync.set({ [key]: parsedValue });
    } catch (error) {
      console.error("Failed to set to chrome.storage:", error);
      localStorage.setItem(key, value);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await chrome.storage.sync.remove(key);
    } catch (error) {
      console.error("Failed to remove from chrome.storage:", error);
      localStorage.removeItem(key);
    }
  },
};

export const useSettingsStore = create<SettingsState>()(
  persist(
    immer((set, _get) => ({
      // Initial state
      ...defaultSettings,
      isLoading: false,

      // Actions
      updateSettings: async (newSettings) => {
        set((state) => {
          Object.assign(state, newSettings);
        });
      },

      resetSettings: async () => {
        set((state) => {
          Object.assign(state, defaultSettings);
        });
      },

      addDisabledSite: (site) => {
        set((state) => {
          if (!state.disabledSites.includes(site)) {
            state.disabledSites.push(site);
          }
        });
      },

      removeDisabledSite: (site) => {
        set((state) => {
          state.disabledSites = state.disabledSites.filter((s) => s !== site);
        });
      },

      updateModelConfig: (providerId, config) => {
        set((state) => {
          if (!state.modelConfigs[providerId]) {
            state.modelConfigs[providerId] = { enabled: false };
          }
          Object.assign(state.modelConfigs[providerId], config);
        });
      },
    })),
    {
      name: "briefcase-settings",
      storage: createJSONStorage(() => chromeStorage),
      partialize: (state) => {
        // Don't persist loading state
        const { isLoading: _isLoading, ...persistedState } = state;
        return persistedState;
      },
    },
  ),
);
