"use client";

import { useEffect, useRef, useState } from "react";
import { formatEmailDate, parseFromHeader } from "@/lib/utils/email";
import { useUserTimezone } from "@/lib/hooks/useUserTimezone";
import DOMPurify from "dompurify";

interface EmailMessageProps {
  id: string;
  from: string;
  to: string;
  date: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  onArchive?: (emailId: string) => void;
  isArchiving?: boolean;
  showArchiveButton?: boolean;
  archivedAt?: Date | null;
  readerConnected?: boolean;
}

type SaveStatus = "idle" | "saving" | "success" | "error";

export default function EmailMessage({
  id,
  from,
  to,
  date,
  subject,
  bodyHtml,
  bodyText,
  onArchive,
  isArchiving = false,
  showArchiveButton = false,
  archivedAt,
  readerConnected = false,
}: EmailMessageProps) {
  const sender = parseFromHeader(from);
  const timezone = useUserTimezone();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [toast, setToast] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  const handleSaveToReader = async () => {
    setSaveStatus("saving");
    try {
      const response = await fetch("/api/reader/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId: id }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save");
      }
      setSaveStatus("success");
      setToast({ kind: "success", message: "Saved to Reader" });
    } catch (err) {
      setSaveStatus("error");
      setToast({
        kind: "error",
        message: err instanceof Error ? err.message : "Failed to save to Reader",
      });
    } finally {
      if (resetTimerRef.current) clearTimeout(resetTimerRef.current);
      resetTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
    }
  };

  const sanitizeHtml = (html: string) => {
    if (typeof window === "undefined") return "";

    const clean = DOMPurify.sanitize(html, {
      FORBID_TAGS: ["script", "iframe", "object", "embed", "form"],
      FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover"],
    });
    return clean;
  };

  const content = bodyHtml
    ? sanitizeHtml(bodyHtml)
    : bodyText
      ? bodyText
          .split("\n")
          .map((line, i) => `<p key=${i}>${line}</p>`)
          .join("")
      : "";

  const isArchived = !!archivedAt;

  return (
    <div
      className={`border-l-4 pl-4 py-3 ${isArchived ? "border-gray-200 opacity-60" : "border-gray-300"}`}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="font-semibold text-gray-900 truncate">
              {sender.name}
            </span>
            <span className="text-xs text-gray-500">{sender.email}</span>
          </div>
          <div className="text-xs text-gray-500">
            To: {to} • {formatEmailDate(date, timezone)}
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {readerConnected && (
            <button
              onClick={handleSaveToReader}
              disabled={saveStatus === "saving"}
              className="p-2 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Save to Readwise Reader"
            >
              {saveStatus === "saving" ? (
                <div className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-amber-500 border-r-transparent"></div>
              ) : saveStatus === "success" ? (
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
              ) : (
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
              )}
            </button>
          )}
          {showArchiveButton && onArchive && (
            <button
              onClick={() => onArchive(id)}
              disabled={isArchiving}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              title="Archive this message"
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
            </button>
          )}
        </div>
      </div>
      {toast && (
        <div
          className={`mb-3 px-3 py-2 rounded-lg text-sm ${
            toast.kind === "success"
              ? "bg-green-50 border border-green-200 text-green-700"
              : "bg-red-50 border border-red-200 text-red-700"
          }`}
          role="status"
        >
          {toast.message}
        </div>
      )}
      <div
        className="prose prose-sm max-w-none text-gray-700 overflow-hidden break-words [&_*]:max-w-full [&_img]:h-auto [&_table]:table-auto [&_table]:w-full [&_td]:break-words [&_th]:break-words [&_pre]:whitespace-pre-wrap [&_pre]:break-words"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  );
}
