"use client";

import { useEffect, useState } from "react";
import { formatEmailDate, parseFromHeader } from "@/lib/utils/email";
import EmailMessage from "./EmailMessage";
import { useBackgroundSync } from "@/lib/hooks/useBackgroundSync";
import { SyncProgress } from "./SyncProgress";
import FilterModal from "./FilterModal";
import CreateAsanaTaskModal from "./CreateAsanaTaskModal";
import CreateTodoistTaskModal from "./CreateTodoistTaskModal";

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
  smartTag: string | null;
  smartTagIcon: string | null;
  smartTagColor: string | null;
}

interface TagStats {
  id: string;
  name: string;
  displayName: string;
  color: string | null;
  icon: string | null;
  count: number;
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
  const [filterModalOpen, setFilterModalOpen] = useState(false);
  const [selectedSender, setSelectedSender] = useState<{ email: string; name: string } | null>(null);
  const [asanaModalOpen, setAsanaModalOpen] = useState(false);
  const [selectedEmailForTask, setSelectedEmailForTask] = useState<{
    id: string;
    subject: string;
    from: string;
    snippet: string;
  } | null>(null);
  const [activeTagFilter, setActiveTagFilter] = useState<string | null>(null);
  const [tagStats, setTagStats] = useState<TagStats[]>([]);
  const [classifying, setClassifying] = useState(false);
  const [classifyStatus, setClassifyStatus] = useState<{
    stage: "idle" | "classifying" | "success";
    total: number;
  }>({ stage: "idle", total: 0 });
  const [openMenuThreadId, setOpenMenuThreadId] = useState<string | null>(null);
  const [taskManager, setTaskManager] = useState<string>("asana");
  const [todoistModalOpen, setTodoistModalOpen] = useState(false);

  const { syncState, startSync } = useBackgroundSync();

  const fetchTagStats = async () => {
    try {
      const response = await fetch("/api/emails/classify");
      const data = await response.json();
      if (data.tags) {
        setTagStats(data.tags);
      }
    } catch (err) {
      console.error("Failed to fetch tag stats:", err);
    }
  };

  const handleClassifyEmails = async (classifyAll: boolean = false) => {
    setClassifying(true);
    setClassifyStatus({ stage: "classifying", total: classifyAll ? 0 : 50 });
    try {
      const response = await fetch("/api/emails/classify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 50, classifyAll }),
      });
      const data = await response.json();

      // Show success message
      setClassifyStatus({ stage: "success", total: data.total || 0 });

      await fetchTagStats();
      await fetchThreads(1, false);

      // Reset to idle after 3 seconds
      setTimeout(() => {
        setClassifyStatus({ stage: "idle", total: 0 });
      }, 3000);
    } catch (err) {
      console.error("Failed to classify emails:", err);
      setClassifyStatus({ stage: "idle", total: 0 });
    } finally {
      setClassifying(false);
    }
  };

  const fetchThreads = async (pageNum: number = 1, append: boolean = false, tagFilter?: string | null) => {
    try {
      const tag = tagFilter !== undefined ? tagFilter : activeTagFilter;
      const url = tag
        ? `/api/threads?page=${pageNum}&limit=100&tag=${tag}`
        : `/api/threads?page=${pageNum}&limit=100`;
      const response = await fetch(url);
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

  const handleTagFilterChange = async (tagName: string | null) => {
    setActiveTagFilter(tagName);
    setSelectedThreadIds(new Set());
    setPage(1);
    await fetchThreads(1, false, tagName);
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

  const handleOpenFilterModal = (fromHeader: string) => {
    const { email, name } = parseFromHeader(fromHeader);
    setSelectedSender({ email, name });
    setFilterModalOpen(true);
  };

  const handleOpenTaskModal = (thread: Thread) => {
    setSelectedEmailForTask({
      id: thread.latestEmailId,
      subject: thread.subject,
      from: thread.from,
      snippet: thread.snippet,
    });
    if (taskManager === "todoist") {
      setTodoistModalOpen(true);
    } else {
      setAsanaModalOpen(true);
    }
  };

  const handleCreateFilter = async (applyToExisting: boolean) => {
    if (!selectedSender) return;

    try {
      const response = await fetch("/api/filters/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderEmail: selectedSender.email,
          applyToExisting,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create filter");
      }

      // If applying to existing, remove those threads from the list
      if (applyToExisting) {
        setThreads((prev) =>
          prev.filter((t) => {
            const { email } = parseFromHeader(t.from);
            return email !== selectedSender.email;
          })
        );
        window.dispatchEvent(new CustomEvent("emailArchived"));
      }

      // Show success message
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create filter");
      setTimeout(() => setError(null), 5000);
      throw err;
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
    fetch("/api/user-settings")
      .then((res) => res.json())
      .then((data) => {
        if (data.settings?.taskManager) {
          setTaskManager(data.settings.taskManager);
        }
      })
      .catch((err) => console.error("Error loading task manager preference:", err));
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const response = await fetch('/api/threads?page=1&limit=100');
        const data = await response.json();

        if (cancelled) return;

        if (data.threads && data.threads.length > 0) {
          setThreads(data.threads);
          setHasMore(data.hasMore);
          setPage(1);
          setLoading(false);
          fetchTagStats();

          startSync();
        } else {
          setSyncing(true);
          const syncResponse = await fetch("/api/emails/sync", {
            method: "POST",
          });
          const syncData = await syncResponse.json();

          if (cancelled) return;

          await fetchThreads(1, false);
          setSyncing(false);
          setLoading(false);

          if (syncData.nextPageToken) {
            startSync();
          }
        }
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "An error occurred");
        setLoading(false);
        setSyncing(false);
      }
    }

    initialize();

    const syncInterval = setInterval(() => {
      if (!cancelled) {
        startSync();
      }
    }, 5 * 60 * 1000);

    return () => {
      cancelled = true;
      clearInterval(syncInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startSync]);


  if (loading || syncing) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
        <div className="text-center">
          <div className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent mb-4"></div>
          <p className="text-slate-700 font-semibold text-base">
            {syncing ? "Syncing emails..." : "Loading inbox..."}
          </p>
          <p className="text-slate-500 text-sm mt-1">Please wait</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-red-200 p-8">
        <div className="text-center">
          <div className="text-2xl font-bold text-red-600 mb-2">Error</div>
          <p className="text-slate-600 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-lg border border-green-200 p-12 animate-slide-in">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-20 h-20 bg-green-500 rounded-full mb-4 shadow-lg">
            <svg
              className="w-10 h-10 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M5 13l4 4L19 7"
              />
            </svg>
          </div>
          <h2 className="text-3xl font-bold text-green-600 mb-2" style={{ letterSpacing: '-0.02em' }}>
            Inbox Zero
          </h2>
          <p className="text-slate-600 text-base">All emails processed</p>
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
      <div className="mb-3 flex justify-end gap-2">
        <button
          onClick={() => handleClassifyEmails(false)}
          disabled={classifying}
          className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm btn-action ${
            classifyStatus.stage === "success"
              ? "bg-green-600 text-white"
              : "bg-purple-600 text-white hover:bg-purple-700"
          }`}
          title="Classify next 50 untagged emails using AI"
        >
          {classifyStatus.stage === "classifying" ? (
            <>
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-solid border-white border-r-transparent"></span>
              <span className="hidden sm:inline">Classifying{classifyStatus.total > 0 ? ` ${classifyStatus.total}` : "..."}</span>
              <span className="sm:hidden">Classifying</span>
            </>
          ) : classifyStatus.stage === "success" ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <span className="hidden sm:inline">Classified {classifyStatus.total}</span>
              <span className="sm:hidden">Done</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span className="hidden sm:inline">Classify 50</span>
              <span className="sm:hidden">Classify</span>
            </>
          )}
        </button>
        <button
          onClick={() => handleClassifyEmails(true)}
          disabled={classifying}
          className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shadow-sm btn-action ${
            classifyStatus.stage === "success"
              ? "bg-green-600 text-white"
              : "bg-indigo-600 text-white hover:bg-indigo-700"
          }`}
          title="Classify ALL untagged emails using AI (may take a while)"
        >
          {classifyStatus.stage === "classifying" ? (
            <>
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-solid border-white border-r-transparent"></span>
              <span className="hidden sm:inline">Classifying{classifyStatus.total > 0 ? ` ${classifyStatus.total}` : "..."}</span>
              <span className="sm:hidden">All</span>
            </>
          ) : classifyStatus.stage === "success" ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              <span className="hidden sm:inline">Classified {classifyStatus.total}</span>
              <span className="sm:hidden">Done</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="hidden sm:inline">Classify All</span>
              <span className="sm:hidden">All</span>
            </>
          )}
        </button>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 mb-3 p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => handleTagFilterChange(null)}
            className={`px-3 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all shadow-sm btn-action ${
              activeTagFilter === null
                ? "bg-blue-600 text-white"
                : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200"
            }`}
          >
            All
          </button>
          {tagStats.map((tag) => (
            <button
              key={tag.id}
              onClick={() => handleTagFilterChange(tag.name)}
              className={`px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all shadow-sm btn-action flex items-center gap-1.5 ${
                activeTagFilter === tag.name
                  ? "bg-blue-600 text-white"
                  : "bg-white text-slate-700 hover:bg-slate-50 border border-slate-200"
              }`}
            >
              <span className="text-sm hidden sm:inline">{tag.icon}</span>
              <span>{tag.displayName}</span>
              {tag.count > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-xs font-bold ${
                  activeTagFilter === tag.name
                    ? "bg-white/30 text-white"
                    : "bg-slate-100 text-slate-600"
                }`}>
                  {tag.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {threads.length > 0 && (
          <div className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 px-3 py-2 sm:px-4 sm:py-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-3">
                <input
                  type="checkbox"
                  checked={selectedThreadIds.size === threads.length && threads.length > 0}
                  onChange={handleSelectAll}
                  className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500 cursor-pointer"
                  title="Select all"
                />
                <span className="text-xs sm:text-sm text-slate-700 font-semibold">
                  {selectedThreadIds.size > 0
                    ? `${selectedThreadIds.size} selected`
                    : 'Select all'}
                </span>
              </div>
              {selectedThreadIds.size > 0 && (
                <button
                  onClick={handleBulkArchive}
                  disabled={bulkArchiving}
                  className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed btn-action font-semibold text-xs sm:text-sm"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                    />
                  </svg>
                  <span>
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
            <div key={thread.threadId} className={`transition-all ${isSelected ? 'bg-blue-50 border-l-2 border-blue-500' : 'hover:bg-slate-50'}`}>
              <div className="p-3 sm:p-4">
                <div className="flex items-start gap-2 sm:gap-3">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCheckboxClick(thread.threadId, index, e.shiftKey);
                    }}
                    className="w-4 h-4 mt-1 text-blue-600 border-slate-300 rounded focus:ring-blue-500 flex-shrink-0 cursor-pointer"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div
                        className="flex-1 min-w-0 cursor-pointer"
                        onClick={() => toggleThread(thread.threadId)}
                      >
                        <div className="flex items-baseline gap-1.5 sm:gap-2 mb-0.5 flex-wrap">
                          {thread.smartTag && thread.smartTagIcon && (
                            <span
                              className="text-xs sm:text-sm flex-shrink-0 hidden sm:inline"
                              title={thread.smartTag}
                            >
                              {thread.smartTagIcon}
                            </span>
                          )}
                          <span className="font-semibold text-slate-900 text-sm sm:text-base truncate">
                            {sender.name}
                          </span>
                          {thread.messageCount > 1 && (
                            <span className="text-xs text-slate-600 bg-slate-200 px-1.5 py-0.5 rounded flex-shrink-0 font-semibold">
                              {thread.messageCount}
                            </span>
                          )}
                          <span className="text-xs text-slate-500 flex-shrink-0">
                            {formatEmailDate(thread.date)}
                          </span>
                        </div>
                        <h3 className="text-sm sm:text-base font-semibold text-slate-800 mb-0.5 truncate">
                          {thread.subject || "(no subject)"}
                        </h3>
                      </div>
                      <div className="flex gap-1 sm:gap-1.5 flex-shrink-0">
                    {/* Mobile: More menu + Archive */}
                    <div className="sm:hidden relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuThreadId(openMenuThreadId === thread.threadId ? null : thread.threadId);
                        }}
                        className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all btn-action border border-slate-200"
                        title="More actions"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          strokeWidth={2.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z"
                          />
                        </svg>
                      </button>
                      {openMenuThreadId === thread.threadId && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setOpenMenuThreadId(null)}
                          />
                          <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-lg shadow-lg border border-slate-200 py-1 min-w-[160px]">
                            {thread.messageCount > 1 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleThread(thread.threadId);
                                  setOpenMenuThreadId(null);
                                }}
                                className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                                {isExpanded ? "Collapse" : "Expand"}
                              </button>
                            )}
                            {thread.hasUnsubscribe && thread.unsubscribeUrl && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUnsubscribe(thread.latestEmailId, thread.threadId);
                                  setOpenMenuThreadId(null);
                                }}
                                disabled={isUnsubscribing}
                                className="w-full px-4 py-2 text-left text-sm text-orange-700 hover:bg-orange-50 flex items-center gap-2 disabled:opacity-50"
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                                Unsubscribe
                              </button>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenTaskModal(thread);
                                setOpenMenuThreadId(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                            >
                              {taskManager === "todoist" ? (
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M21 3H3v18h18V3zm-2.5 7.5l-5.25 3-5.25-3V8l5.25 3 5.25-3v2.5z" />
                                </svg>
                              ) : (
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3.75a2.5 2.5 0 110 5 2.5 2.5 0 010-5zm-4.58 7.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5zm9.16 0a2.5 2.5 0 110 5 2.5 2.5 0 010-5z" />
                                </svg>
                              )}
                              Create task
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenFilterModal(thread.from);
                                setOpenMenuThreadId(null);
                              }}
                              className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                              </svg>
                              Create filter
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                    <button
                      onClick={() => handleArchiveThread(thread.threadId)}
                      disabled={isArchiving}
                      className="sm:hidden p-1.5 bg-green-600 text-white hover:bg-green-700 rounded-lg transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed btn-action flex items-center justify-center"
                      title="Archive"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </button>

                    {/* Desktop: All buttons visible */}
                    {thread.messageCount > 1 && (
                      <button
                        onClick={() => toggleThread(thread.threadId)}
                        className="hidden sm:flex p-1.5 sm:p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-all btn-action border border-slate-200 items-center justify-center"
                        title={isExpanded ? "Collapse" : "Expand"}
                      >
                        <svg
                          className={`w-4 h-4 transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          strokeWidth={2.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                    )}
                    {thread.hasUnsubscribe && thread.unsubscribeUrl && (
                      <button
                        onClick={() => handleUnsubscribe(thread.latestEmailId, thread.threadId)}
                        disabled={isUnsubscribing}
                        className="hidden sm:flex p-1.5 sm:p-2 bg-orange-600 text-white hover:bg-orange-700 rounded-lg transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed btn-action items-center justify-center"
                        title="Unsubscribe"
                      >
                        <svg
                          className="w-4 h-4"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          strokeWidth={2.5}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
                          />
                        </svg>
                      </button>
                    )}
                    <button
                      onClick={() => handleOpenTaskModal(thread)}
                      className="hidden sm:flex p-1.5 sm:p-2 bg-pink-600 text-white hover:bg-pink-700 rounded-lg transition-all shadow-sm btn-action items-center justify-center"
                      title="Create task"
                    >
                      {taskManager === "todoist" ? (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M21 3H3v18h18V3zm-2.5 7.5l-5.25 3-5.25-3V8l5.25 3 5.25-3v2.5z" />
                        </svg>
                      ) : (
                        <svg
                          className="w-4 h-4"
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3.75a2.5 2.5 0 110 5 2.5 2.5 0 010-5zm-4.58 7.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5zm9.16 0a2.5 2.5 0 110 5 2.5 2.5 0 010-5z" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => handleOpenFilterModal(thread.from)}
                      className="hidden sm:flex p-1.5 sm:p-2 bg-purple-600 text-white hover:bg-purple-700 rounded-lg transition-all shadow-sm btn-action items-center justify-center"
                      title="Create filter"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                        />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleArchiveThread(thread.threadId)}
                      disabled={isArchiving}
                      className="hidden sm:flex p-1.5 sm:p-2 bg-green-600 text-white hover:bg-green-700 rounded-lg transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed btn-action items-center justify-center"
                      title="Archive"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        strokeWidth={2.5}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    </button>
                      </div>
                    </div>
                    <div
                      className="cursor-pointer"
                      onClick={() => toggleThread(thread.threadId)}
                    >
                      <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">
                        {thread.snippet}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              {isExpanded && (
                <div className="bg-slate-50 px-3 sm:px-4 py-3 border-t border-slate-200">
                  {loadingThreads.has(thread.threadId) ? (
                    <div className="flex items-center gap-2 text-sm text-slate-700 font-semibold">
                      <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-blue-600 border-r-transparent"></div>
                      <span>Loading messages...</span>
                    </div>
                  ) : threadMessages[thread.threadId] ? (
                    <div className="space-y-3">
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
                    <p className="text-sm text-slate-600 italic">No messages found</p>
                  )}
                </div>
              )}
            </div>
          );
          })}
        </div>
        {hasMore && (
          <div className="p-3 sm:p-4 border-t border-slate-200 bg-slate-50">
            <button
              onClick={loadMore}
              disabled={loadingMore}
              className="w-full py-2.5 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed btn-action font-semibold text-sm"
            >
              {loadingMore ? "Loading..." : "Load More"}
            </button>
          </div>
        )}
      </div>
      <FilterModal
        isOpen={filterModalOpen}
        onClose={() => setFilterModalOpen(false)}
        senderEmail={selectedSender?.email || ""}
        senderName={selectedSender?.name || ""}
        onConfirm={handleCreateFilter}
      />
      <CreateAsanaTaskModal
        isOpen={asanaModalOpen}
        onClose={() => setAsanaModalOpen(false)}
        emailSubject={selectedEmailForTask?.subject || ""}
        emailFrom={selectedEmailForTask?.from || ""}
        emailSnippet={selectedEmailForTask?.snippet || ""}
        emailId={selectedEmailForTask?.id || ""}
      />
      <CreateTodoistTaskModal
        isOpen={todoistModalOpen}
        onClose={() => setTodoistModalOpen(false)}
        emailSubject={selectedEmailForTask?.subject || ""}
        emailFrom={selectedEmailForTask?.from || ""}
        emailSnippet={selectedEmailForTask?.snippet || ""}
        emailId={selectedEmailForTask?.id || ""}
      />
    </>
  );
}
