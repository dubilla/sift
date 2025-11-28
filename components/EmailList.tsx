"use client";

import { useEffect, useState, useRef } from "react";
import { formatEmailDate, parseFromHeader } from "@/lib/utils/email";
import EmailMessage from "./EmailMessage";
import { useBackgroundSync } from "@/lib/hooks/useBackgroundSync";
import { SyncProgress } from "./SyncProgress";

interface Thread {
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  messageCount: number;
  hasUnsubscribe: boolean;
  unsubscribeUrl: string | null;
  latestEmailId: string;
}

interface EmailMessageData {
  id: string;
  threadId: string;
  subject: string;
  from: string;
  to: string;
  date: string;
  snippet: string;
  bodyHtml: string;
  bodyText: string;
  archivedAt?: Date | null;
}

export default function EmailList() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archivingIds, setArchivingIds] = useState<Set<string>>(new Set());
  const [unsubscribingIds, setUnsubscribingIds] = useState<Set<string>>(new Set());
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [threadMessages, setThreadMessages] = useState<Record<string, EmailMessageData[]>>({});
  const [loadingThreads, setLoadingThreads] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedThreadIds, setSelectedThreadIds] = useState<Set<string>>(new Set());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [bulkArchiving, setBulkArchiving] = useState(false);

  const { syncState, startSync } = useBackgroundSync();

  const fetchThreads = async (pageNum: number = 1, append: boolean = false) => {
    try {
      const response = await fetch(`/api/threads?page=${pageNum}&limit=100`);
      const data = await response.json();
      if (data.threads) {
        setThreads(prev => append ? [...prev, ...data.threads] : data.threads);
        setHasMore(data.hasMore);
        setPage(pageNum);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch threads");
      setTimeout(() => setError(null), 5000);
    }
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await fetchThreads(page + 1, true);
    setLoadingMore(false);
  };

  const handleArchiveThread = async (threadId: string) => {
    setArchivingIds((prev) => new Set(prev).add(threadId));

    const originalThreads = [...threads];
    setThreads((prev) => prev.filter((t) => t.threadId !== threadId));

    try {
      const response = await fetch(`/api/threads/${threadId}/archive`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to archive thread");
      }

      window.dispatchEvent(new CustomEvent("emailArchived"));
    } catch (err) {
      setThreads(originalThreads);
      setError(err instanceof Error ? err.message : "Failed to archive thread");
      setTimeout(() => setError(null), 5000);
    } finally {
      setArchivingIds((prev) => {
        const next = new Set(prev);
        next.delete(threadId);
        return next;
      });
    }
  };

  const handleUnsubscribe = async (emailId: string, threadId: string) => {
    setUnsubscribingIds((prev) => new Set(prev).add(emailId));

    const originalThreads = [...threads];
    setThreads((prev) => prev.filter((t) => t.threadId !== threadId));

    try {
      const response = await fetch(`/api/emails/${emailId}/unsubscribe`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to unsubscribe");
      }

      if (data.requiresMailto) {
        // Restore thread and open mailto link
        setThreads(originalThreads);
        window.location.href = data.mailtoUrl;
        return;
      }

      window.dispatchEvent(new CustomEvent("emailArchived"));
    } catch (err) {
      setThreads(originalThreads);
      setError(err instanceof Error ? err.message : "Failed to unsubscribe");
      setTimeout(() => setError(null), 5000);
    } finally {
      setUnsubscribingIds((prev) => {
        const next = new Set(prev);
        next.delete(emailId);
        return next;
      });
    }
  };

  const handleArchiveMessage = async (emailId: string, threadId: string) => {
    setArchivingIds((prev) => new Set(prev).add(emailId));

    try {
      const response = await fetch(`/api/emails/${emailId}/archive`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to archive message");
      }

      setThreadMessages((prev) => {
        const updated = { ...prev };
        if (updated[threadId]) {
          updated[threadId] = updated[threadId].filter((msg) => msg.id !== emailId);
          if (updated[threadId].length === 0) {
            setThreads((threads) => threads.filter((t) => t.threadId !== threadId));
            setExpandedThreads((exp) => {
              const next = new Set(exp);
              next.delete(threadId);
              return next;
            });
          }
        }
        return updated;
      });

      window.dispatchEvent(new CustomEvent("emailArchived"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to archive message");
      setTimeout(() => setError(null), 5000);
    } finally {
      setArchivingIds((prev) => {
        const next = new Set(prev);
        next.delete(emailId);
        return next;
      });
    }
  };

  const handleCheckboxClick = (threadId: string, index: number, shiftKey: boolean) => {
    if (shiftKey && lastClickedIndex !== null) {
      const start = Math.min(lastClickedIndex, index);
      const end = Math.max(lastClickedIndex, index);
      const threadsInRange = threads.slice(start, end + 1);

      setSelectedThreadIds((prev) => {
        const next = new Set(prev);
        threadsInRange.forEach((thread) => next.add(thread.threadId));
        return next;
      });
    } else {
      setSelectedThreadIds((prev) => {
        const next = new Set(prev);
        if (next.has(threadId)) {
          next.delete(threadId);
        } else {
          next.add(threadId);
        }
        return next;
      });
    }
    setLastClickedIndex(index);
  };

  const handleSelectAll = () => {
    if (selectedThreadIds.size === threads.length) {
      setSelectedThreadIds(new Set());
    } else {
      setSelectedThreadIds(new Set(threads.map((t) => t.threadId)));
    }
  };

  const handleBulkArchive = async () => {
    if (selectedThreadIds.size === 0) return;

    setBulkArchiving(true);
    const threadIdsToArchive = Array.from(selectedThreadIds);

    const originalThreads = [...threads];
    setThreads((prev) => prev.filter((t) => !selectedThreadIds.has(t.threadId)));
    setSelectedThreadIds(new Set());

    try {
      const response = await fetch('/api/threads/bulk-archive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ threadIds: threadIdsToArchive }),
      });

      if (!response.ok) {
        throw new Error('Failed to bulk archive threads');
      }

      window.dispatchEvent(new CustomEvent('emailArchived'));
    } catch (err) {
      setThreads(originalThreads);
      setError(err instanceof Error ? err.message : 'Failed to bulk archive threads');
      setTimeout(() => setError(null), 5000);
    } finally {
      setBulkArchiving(false);
    }
  };

  const toggleThread = async (threadId: string) => {
    const isExpanded = expandedThreads.has(threadId);

    if (isExpanded) {
      setExpandedThreads((prev) => {
        const next = new Set(prev);
        next.delete(threadId);
        return next;
      });
    } else {
      setExpandedThreads((prev) => new Set(prev).add(threadId));

      if (!threadMessages[threadId]) {
        setLoadingThreads((prev) => new Set(prev).add(threadId));

        try {
          const response = await fetch(`/api/threads/${threadId}/messages`);
          const data = await response.json();

          if (data.messages) {
            setThreadMessages((prev) => ({
              ...prev,
              [threadId]: data.messages,
            }));
          }
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to load thread messages");
          setTimeout(() => setError(null), 5000);
          setExpandedThreads((prev) => {
            const next = new Set(prev);
            next.delete(threadId);
            return next;
          });
        } finally {
          setLoadingThreads((prev) => {
            const next = new Set(prev);
            next.delete(threadId);
            return next;
          });
        }
      }
    }
  };

  useEffect(() => {
    async function initialize() {
      try {
        await fetchThreads(1, false);

        if (threads.length > 0) {
          setLoading(false);
          startSync();
        } else {
          setSyncing(true);
          const syncResponse = await fetch("/api/emails/sync", {
            method: "POST",
          });
          const syncData = await syncResponse.json();

          await fetchThreads(1, false);
          setSyncing(false);
          setLoading(false);

          if (syncData.nextPageToken) {
            startSync();
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        setLoading(false);
        setSyncing(false);
      }
    }

    initialize();
  }, [startSync]);


  if (loading || syncing) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent mb-4"></div>
          <p className="text-gray-600">
            {syncing ? "Syncing your emails..." : "Loading..."}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8">
        <div className="text-center">
          <div className="text-xl font-bold text-red-600 mb-2">Error</div>
          <p className="text-gray-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-8">
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-4">
            <svg
              className="w-8 h-8 text-green-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">
            Inbox Zero!
          </h2>
          <p className="text-gray-500">You have no unarchived emails</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <SyncProgress
        currentCount={syncState.currentCount}
        totalCount={syncState.totalCount}
        isSyncing={syncState.isSyncing}
      />
      <div className="bg-white rounded-lg shadow-md overflow-hidden">
        {threads.length > 0 && (
          <div className="sticky top-0 z-10 bg-gray-100 border-b border-gray-300 p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={selectedThreadIds.size === threads.length && threads.length > 0}
                  onChange={handleSelectAll}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  title="Select all"
                />
                <span className="text-sm text-gray-700 font-medium">
                  {selectedThreadIds.size > 0
                    ? `${selectedThreadIds.size} selected`
                    : 'Select all'}
                </span>
              </div>
              {selectedThreadIds.size > 0 && (
                <button
                  onClick={handleBulkArchive}
                  disabled={bulkArchiving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                    />
                  </svg>
                  <span className="text-sm font-medium">
                    {bulkArchiving ? 'Archiving...' : `Archive ${selectedThreadIds.size}`}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}
        <div className="divide-y divide-gray-200">
          {threads.map((thread, index) => {
          const sender = parseFromHeader(thread.from);
          const isArchiving = archivingIds.has(thread.threadId);
          const isUnsubscribing = unsubscribingIds.has(thread.latestEmailId);
          const isExpanded = expandedThreads.has(thread.threadId);
          const isSelected = selectedThreadIds.has(thread.threadId);
          return (
            <div key={thread.threadId} className={`transition-colors ${isSelected ? 'bg-blue-50' : ''}`}>
              <div className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-2 sm:gap-4">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCheckboxClick(thread.threadId, index, e.shiftKey);
                    }}
                    className="w-4 h-4 mt-1 text-blue-600 border-gray-300 rounded focus:ring-blue-500 flex-shrink-0"
                  />
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => toggleThread(thread.threadId)}
                  >
                    <div className="flex items-baseline gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-gray-900 truncate">
                        {sender.name}
                      </span>
                      {thread.messageCount > 1 && (
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full flex-shrink-0">
                          {thread.messageCount}
                        </span>
                      )}
                      <span className="text-xs text-gray-500 flex-shrink-0">
                        {formatEmailDate(thread.date)}
                      </span>
                    </div>
                    <h3 className="text-sm font-medium text-gray-900 mb-1 truncate">
                      {thread.subject || "(no subject)"}
                    </h3>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {thread.snippet}
                    </p>
                  </div>
                  <div className="flex gap-1 sm:gap-2 flex-shrink-0">
                    {thread.messageCount > 1 && (
                      <button
                        onClick={() => toggleThread(thread.threadId)}
                        className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title={isExpanded ? "Collapse thread" : "Expand thread"}
                      >
                        <svg
                          className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                    )}
                    {thread.hasUnsubscribe && thread.unsubscribeUrl && (
                      <button
                        onClick={() => handleUnsubscribe(thread.latestEmailId, thread.threadId)}
                        disabled={isUnsubscribing}
                        className="p-1.5 sm:p-2 text-orange-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Unsubscribe and archive"
                      >
                        <svg
                          className="w-4 h-4 sm:w-5 sm:h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                          />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={() => handleArchiveThread(thread.threadId)}
                      disabled={isArchiving}
                      className="p-1.5 sm:p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Archive thread"
                    >
                      <svg
                        className="w-4 h-4 sm:w-5 sm:h-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
              {isExpanded && (
                <div className="bg-gray-50 px-4 py-3 border-t border-gray-200">
                  {loadingThreads.has(thread.threadId) ? (
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-gray-600 border-r-transparent"></div>
                      <span>Loading thread messages...</span>
                    </div>
                  ) : threadMessages[thread.threadId] ? (
                    <div className="space-y-4">
                      {threadMessages[thread.threadId].map((message) => (
                        <EmailMessage
                          key={message.id}
                          id={message.id}
                          from={message.from}
                          to={message.to}
                          date={message.date}
                          subject={message.subject}
                          bodyHtml={message.bodyHtml}
                          bodyText={message.bodyText}
                          onArchive={(emailId) => handleArchiveMessage(emailId, thread.threadId)}
                          isArchiving={archivingIds.has(message.id)}
                          showArchiveButton={threadMessages[thread.threadId].length > 1}
                          archivedAt={message.archivedAt}
                        />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-600 italic">No messages found</p>
                  )}
                </div>
              )}
            </div>
          );
          })}
        </div>
        {hasMore && (
          <div className="p-4 border-t border-gray-200">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-3 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loadingMore ? "Loading..." : "Load More"}
            </button>
          </div>
        )}
      </div>
    </>
  );
}
