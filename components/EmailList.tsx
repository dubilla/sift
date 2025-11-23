"use client";

import { useEffect, useState } from "react";
import { formatEmailDate, parseFromHeader } from "@/lib/utils/email";
import EmailMessage from "./EmailMessage";

interface Thread {
  threadId: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  messageCount: number;
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
}

export default function EmailList() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archivingIds, setArchivingIds] = useState<Set<string>>(new Set());
  const [expandedThreads, setExpandedThreads] = useState<Set<string>>(new Set());
  const [threadMessages, setThreadMessages] = useState<Record<string, EmailMessageData[]>>({});
  const [loadingThreads, setLoadingThreads] = useState<Set<string>>(new Set());

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
        const response = await fetch("/api/threads");
        const data = await response.json();

        if (data.threads && data.threads.length > 0) {
          setThreads(data.threads);
          setLoading(false);
        } else {
          setSyncing(true);
          const syncResponse = await fetch("/api/emails/sync", {
            method: "POST",
          });
          await syncResponse.json();

          const threadsResponse = await fetch("/api/threads");
          const threadsData = await threadsResponse.json();

          if (threadsData.threads) {
            setThreads(threadsData.threads);
          }
          setSyncing(false);
          setLoading(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
        setLoading(false);
        setSyncing(false);
      }
    }

    initialize();
  }, []);


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
    <div className="bg-white rounded-lg shadow-md overflow-hidden">
      <div className="divide-y divide-gray-200">
        {threads.map((thread) => {
          const sender = parseFromHeader(thread.from);
          const isArchiving = archivingIds.has(thread.threadId);
          const isExpanded = expandedThreads.has(thread.threadId);
          return (
            <div key={thread.threadId} className="transition-colors">
              <div className="p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-4">
                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => toggleThread(thread.threadId)}
                  >
                    <div className="flex items-baseline gap-2 mb-1">
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
                  <div className="flex gap-2 flex-shrink-0">
                    {thread.messageCount > 1 && (
                      <button
                        onClick={() => toggleThread(thread.threadId)}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title={isExpanded ? "Collapse thread" : "Expand thread"}
                      >
                        <svg
                          className={`w-5 h-5 transition-transform ${
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
                    <button
                      onClick={() => handleArchiveThread(thread.threadId)}
                      disabled={isArchiving}
                      className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Archive thread"
                    >
                      <svg
                        className="w-5 h-5"
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
    </div>
  );
}
