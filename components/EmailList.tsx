"use client";

import { useEffect, useState } from "react";
import { formatEmailDate, parseFromHeader } from "@/lib/utils/email";

interface Email {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
}

export default function EmailList() {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archivingIds, setArchivingIds] = useState<Set<string>>(new Set());

  const handleArchive = async (emailId: string) => {
    setArchivingIds((prev) => new Set(prev).add(emailId));

    const originalEmails = [...emails];
    setEmails((prev) => prev.filter((e) => e.id !== emailId));

    try {
      const response = await fetch(`/api/emails/${emailId}/archive`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to archive email");
      }

      window.dispatchEvent(new CustomEvent("emailArchived"));
    } catch (err) {
      setEmails(originalEmails);
      setError(err instanceof Error ? err.message : "Failed to archive email");
      setTimeout(() => setError(null), 5000);
    } finally {
      setArchivingIds((prev) => {
        const next = new Set(prev);
        next.delete(emailId);
        return next;
      });
    }
  };

  useEffect(() => {
    async function initialize() {
      try {
        const response = await fetch("/api/emails");
        const data = await response.json();

        if (data.emails && data.emails.length > 0) {
          setEmails(data.emails);
          setLoading(false);
        } else {
          setSyncing(true);
          const syncResponse = await fetch("/api/emails/sync", {
            method: "POST",
          });
          const syncData = await syncResponse.json();

          if (syncData.emails) {
            setEmails(syncData.emails);
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

  if (emails.length === 0) {
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
        {emails.map((email) => {
          const sender = parseFromHeader(email.from);
          const isArchiving = archivingIds.has(email.id);
          return (
            <div
              key={email.id}
              className="p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="font-semibold text-gray-900 truncate">
                      {sender.name}
                    </span>
                    <span className="text-xs text-gray-500 flex-shrink-0">
                      {formatEmailDate(email.date)}
                    </span>
                  </div>
                  <h3 className="text-sm font-medium text-gray-900 mb-1 truncate">
                    {email.subject || "(no subject)"}
                  </h3>
                  <p className="text-sm text-gray-600 line-clamp-2">
                    {email.snippet}
                  </p>
                </div>
                <button
                  onClick={() => handleArchive(email.id)}
                  disabled={isArchiving}
                  className="flex-shrink-0 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="Archive email"
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
          );
        })}
      </div>
    </div>
  );
}
