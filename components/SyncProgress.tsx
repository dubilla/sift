"use client";

interface SyncProgressProps {
  currentCount: number;
  totalCount: number;
  isSyncing: boolean;
}

export function SyncProgress({
  currentCount,
  totalCount,
  isSyncing,
}: SyncProgressProps) {
  if (!isSyncing || totalCount === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 bg-white border border-gray-200 rounded-lg shadow-lg px-4 py-2 z-50">
      <div className="flex items-center gap-2 text-sm">
        <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full" />
        <span className="text-gray-700">
          Syncing: {currentCount.toLocaleString()}/{totalCount.toLocaleString()}{" "}
          emails
        </span>
      </div>
    </div>
  );
}
