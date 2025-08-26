import { useState, useEffect } from "react";
import { useSettingsStore } from "../stores/settings.store";
import { useSummarizationStore } from "../stores/summarization.store";
import { useUIStore } from "../stores/ui.store";

// Generic hydration hook for any Zustand persisted store
export function useStoreHydration<
  T extends {
    persist?: {
      onHydrate?: (fn: () => void) => void;
      onFinishHydration?: (fn: () => void) => void;
      hasHydrated?: () => boolean;
    };
  },
>(store: T) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (store.persist) {
      // Handle hydration events
      const unsubHydrate = store.persist.onHydrate?.(() => setHydrated(false));
      const unsubFinishHydration = store.persist.onFinishHydration?.(() => setHydrated(true));

      // Set initial hydration status
      setHydrated(store.persist.hasHydrated?.() || false);

      return () => {
        if (unsubHydrate) (unsubHydrate as () => void)();
        if (unsubFinishHydration) (unsubFinishHydration as () => void)();
      };
    }

    // Non-persisted stores are always "hydrated"
    setHydrated(true);
    return undefined;
  }, [store]);

  return hydrated;
}

// Combined hook for all stores
export function useAppHydration() {
  const settingsHydrated = useStoreHydration(useSettingsStore);
  const summarizationHydrated = useStoreHydration(useSummarizationStore);
  const uiHydrated = useStoreHydration(useUIStore);

  const isHydrated = settingsHydrated && summarizationHydrated && uiHydrated;

  return {
    isHydrated,
    stores: {
      settings: settingsHydrated,
      summarization: summarizationHydrated,
      ui: uiHydrated,
    },
  };
}

// Simple component wrapper for handling hydration
export function HydrationBoundary({
  children,
  fallback,
}: {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}) {
  const { isHydrated } = useAppHydration();

  if (!isHydrated) {
    return <>{fallback || <div>Loading...</div>}</>;
  }

  return <>{children}</>;
}
