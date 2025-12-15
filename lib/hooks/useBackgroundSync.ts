import { useState, useEffect, useCallback } from "react";

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

        // If it's an auth error (401), stop immediately
        if (response.status === 401) {
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

      // If there's more to sync, continue
      if (data.nextPageToken && !data.isComplete) {
        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
        await syncBatch(data.nextPageToken);
      } else {
        // Sync complete - set isSyncing to false
        setSyncState((prev) => ({ ...prev, isSyncing: false }));
      }

      return data;
    } catch (error) {
      console.error("Background sync error:", error);
      setSyncState((prev) => ({
        ...prev,
        isSyncing: false,
        error: error instanceof Error ? error.message : "Sync failed",
      }));
      throw error;
    }
  }, []);

  const startSync = useCallback(async () => {
    // Don't start a new sync if one is already running
    let shouldSync = false;
    setSyncState((prev) => {
      if (prev.isSyncing) {
        console.log("Sync already in progress, skipping");
        return prev;
      }
      shouldSync = true;
      return { ...prev, isSyncing: true, error: null };
    });

    if (!shouldSync) {
      return;
    }

    // First, initialize the total count
    try {
      await fetch("/api/emails/sync/init", { method: "POST" });
    } catch (error) {
      console.error("Failed to initialize sync:", error);
      // Continue anyway - background sync will handle missing count gracefully
    }

    // Then start syncing batches
    await syncBatch();
  }, [syncBatch]);

  return { syncState, startSync };
}
