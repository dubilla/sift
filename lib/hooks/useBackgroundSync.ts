import { useState, useEffect, useCallback, useRef } from "react";

interface SyncState {
  isSyncing: boolean;
  currentCount: number;
  totalCount: number;
  error: string | null;
}

export function useBackgroundSync() {
  const [syncState, setSyncState] = useState<SyncState>({
    isSyncing: false,
    currentCount: 0,
    totalCount: 0,
    error: null,
  });
  const syncInProgressRef = useRef(false);

  useEffect(() => {
    return () => {
      syncInProgressRef.current = false;
    };
  }, []);

  const syncBatch = useCallback(async (pageToken?: string) => {
    try {
      const response = await fetch("/api/emails/sync/background", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pageToken }),
      });

      if (!response.ok) {
        const data = await response.json();
        const errorMessage = data.error || "Failed to sync emails";

        if (response.status === 401) {
          syncInProgressRef.current = false;
          setSyncState((prev) => ({
            ...prev,
            isSyncing: false,
            error: errorMessage,
          }));
          throw new Error(errorMessage);
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();

      setSyncState((prev) => ({
        ...prev,
        currentCount: data.currentCount,
        totalCount: data.totalCount,
      }));

      if (data.nextPageToken && !data.isComplete) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await syncBatch(data.nextPageToken);
      } else {
        syncInProgressRef.current = false;
        setSyncState((prev) => ({ ...prev, isSyncing: false }));
      }

      return data;
    } catch (error) {
      console.error("Background sync error:", error);
      syncInProgressRef.current = false;
      setSyncState((prev) => ({
        ...prev,
        isSyncing: false,
        error: error instanceof Error ? error.message : "Sync failed",
      }));
      throw error;
    }
  }, []);

  const startSync = useCallback(async () => {
    if (syncInProgressRef.current) {
      console.log("Sync already in progress, skipping");
      return;
    }

    syncInProgressRef.current = true;
    setSyncState((prev) => ({ ...prev, isSyncing: true, error: null }));

    try {
      await fetch("/api/emails/sync/init", { method: "POST" });
    } catch (error) {
      console.error("Failed to initialize sync:", error);
    }

    try {
      await syncBatch();
    } catch (error) {
      syncInProgressRef.current = false;
    }
  }, [syncBatch]);

  return { syncState, startSync };
}
