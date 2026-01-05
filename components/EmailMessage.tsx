"use client";

import { formatEmailDate, parseFromHeader } from "@/lib/utils/email";
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
}

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
}: EmailMessageProps) {
  const sender = parseFromHeader(from);

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
            To: {to} • {formatEmailDate(date)}
          </div>
        </div>
        {showArchiveButton && onArchive && (
          <button
            onClick={() => onArchive(id)}
            disabled={isArchiving}
            className="flex-shrink-0 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
      <div
        className="prose prose-sm max-w-none text-gray-700 overflow-hidden break-words [&_*]:max-w-full [&_img]:h-auto [&_table]:table-auto [&_table]:w-full [&_td]:break-words [&_th]:break-words [&_pre]:whitespace-pre-wrap [&_pre]:break-words"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </div>
  );
}
