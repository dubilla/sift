"use client";

import { useState } from "react";
import { formatEmailDate, parseFromHeader } from "@/lib/utils/email";

interface SimilarEmail {
  id: string;
  subject: string | null;
  from: string;
  snippet: string | null;
  date: string;
  currentTag: {
    id: string;
    name: string;
    displayName: string;
    icon: string | null;
  } | null;
}

interface ApplySimilarModalProps {
  isOpen: boolean;
  onClose: () => void;
  similarEmails: SimilarEmail[];
  newTagName: string;
  newTagDisplayName: string;
  newTagIcon: string | null;
  onApply: (emailIds: string[]) => Promise<void>;
}

export default function ApplySimilarModal({
  isOpen,
  onClose,
  similarEmails,
  newTagName,
  newTagDisplayName,
  newTagIcon,
  onApply,
}: ApplySimilarModalProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(similarEmails.map((e) => e.id))
  );
  const [applying, setApplying] = useState(false);

  if (!isOpen) return null;

  const handleToggle = (emailId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) {
        next.delete(emailId);
      } else {
        next.add(emailId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedIds.size === similarEmails.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(similarEmails.map((e) => e.id)));
    }
  };

  const handleApply = async () => {
    if (selectedIds.size === 0) {
      onClose();
      return;
    }

    setApplying(true);
    try {
      await onApply(Array.from(selectedIds));
      onClose();
    } catch (error) {
      console.error("Error applying to similar emails:", error);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">
                Apply to Similar Emails
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                Found {similarEmails.length} similar email
                {similarEmails.length !== 1 ? "s" : ""}. Select which ones to tag
                as{" "}
                <span className="font-medium">
                  {newTagIcon} {newTagDisplayName}
                </span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Email list */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4">
            <button
              onClick={handleSelectAll}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              {selectedIds.size === similarEmails.length
                ? "Deselect All"
                : "Select All"}
            </button>
          </div>

          <div className="space-y-2">
            {similarEmails.map((email) => {
              const { name: senderName } = parseFromHeader(email.from);
              const isSelected = selectedIds.has(email.id);

              return (
                <div
                  key={email.id}
                  onClick={() => handleToggle(email.id)}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    isSelected
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => {}}
                      className="w-4 h-4 mt-1 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="text-sm font-semibold text-gray-900 truncate">
                          {senderName}
                        </h3>
                        <span className="text-xs text-gray-500 whitespace-nowrap">
                          {formatEmailDate(email.date)}
                        </span>
                      </div>

                      <p className="text-sm text-gray-900 mb-1 truncate">
                        {email.subject || "(No subject)"}
                      </p>

                      <p className="text-sm text-gray-600 line-clamp-1 mb-2">
                        {email.snippet}
                      </p>

                      {email.currentTag && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            Current tag:
                          </span>
                          <span className="text-xs px-2 py-1 bg-gray-100 rounded-md">
                            {email.currentTag.icon} {email.currentTag.displayName}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {selectedIds.size} email{selectedIds.size !== 1 ? "s" : ""}{" "}
              selected
            </p>
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleApply}
                disabled={applying || selectedIds.size === 0}
                className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {applying
                  ? "Applying..."
                  : selectedIds.size === 0
                  ? "Skip"
                  : `Apply to ${selectedIds.size}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
