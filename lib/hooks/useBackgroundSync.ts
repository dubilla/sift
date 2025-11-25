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
        throw new Error("Failed to sync emails");
      }

      const data = await response.json();

      setSyncState((prev) => ({
        ...prev,
        currentCount: data.currentCount,
        totalCount: data.totalCount,
        isSyncing: !data.isComplete,
      }));

      // If there's more to sync, continue
      if (data.nextPageToken && !data.isComplete) {
        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 100));
        await syncBatch(data.nextPageToken);
      } else {
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
    setSyncState((prev) => ({ ...prev, isSyncing: true, error: null }));

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
