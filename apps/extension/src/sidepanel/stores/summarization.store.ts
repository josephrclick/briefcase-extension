import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { persist } from "zustand/middleware";

export interface SummaryParams {
  length: "brief" | "medium" | "verbose";
  level: "kinder" | "high_school" | "college" | "phd";
  style: "plain" | "bullets" | "executive";
  focus?: string;
}

export interface SummarizationState {
  // Current state
  status: "idle" | "extracting" | "streaming" | "complete" | "error";
  summary: string;
  streamBuffer: string;
  error: Error | null;
  params: SummaryParams;
  currentRequestId: string | null;

  // Actions
  startSummarization: (params?: Partial<SummaryParams>) => Promise<void>;
  updateStreamBuffer: (chunk: string) => void;
  completeSummarization: () => void;
  cancelSummarization: () => void;
  updateParams: (params: Partial<SummaryParams>) => void;
  setError: (error: Error | null) => void;
  reset: () => void;
  setRequestId: (id: string | null) => void;
}

const initialParams: SummaryParams = {
  length: "medium",
  level: "high_school",
  style: "bullets",
  focus: undefined,
};

export const useSummarizationStore = create<SummarizationState>()(
  persist(
    immer((set, _get) => ({
      // Initial state
      status: "idle",
      summary: "",
      streamBuffer: "",
      error: null,
      params: initialParams,
      currentRequestId: null,

      // Actions
      startSummarization: async (newParams) => {
        set((state) => {
          if (newParams) {
            state.params = { ...state.params, ...newParams };
          }
          state.status = "extracting";
          state.error = null;
          state.summary = "";
          state.streamBuffer = "";
        });

        // This will be handled by the useExtensionPort hook
        // which will listen for messages from the background script
      },

      updateStreamBuffer: (chunk) => {
        set((state) => {
          state.streamBuffer += chunk;
          state.status = "streaming";
        });
      },

      completeSummarization: () => {
        set((state) => {
          state.summary = state.streamBuffer;
          state.status = "complete";
          state.currentRequestId = null;
        });
      },

      cancelSummarization: () => {
        set((state) => {
          state.status = "idle";
          state.streamBuffer = "";
          state.currentRequestId = null;
        });
      },

      updateParams: (newParams) => {
        set((state) => {
          state.params = { ...state.params, ...newParams };
        });
      },

      setError: (error) => {
        set((state) => {
          state.error = error;
          state.status = "error";
          state.currentRequestId = null;
        });
      },

      reset: () => {
        set((state) => {
          state.status = "idle";
          state.summary = "";
          state.streamBuffer = "";
          state.error = null;
          state.currentRequestId = null;
        });
      },

      setRequestId: (id) => {
        set((state) => {
          state.currentRequestId = id;
        });
      },
    })),
    {
      name: "briefcase-summarization",
      partialize: (state) => ({
        params: state.params,
      }),
    },
  ),
);
