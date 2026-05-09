"use client";

import { useEffect, useState, useCallback } from "react";
import { formatEmailDate, parseFromHeader } from "@/lib/utils/email";
import { useUserTimezone } from "@/lib/hooks/useUserTimezone";
import ApplySimilarModal from "./ApplySimilarModal";

interface EmailForReview {
  id: string;
  subject: string;
  from: string;
  snippet: string;
  date: string;
  currentTag: {
    id: string;
    name: string;
    displayName: string;
    icon: string | null;
    color: string | null;
  };
  confidence: number | null;
  source: string;
}

interface Tag {
  id: string;
  name: string;
  displayName: string;
  icon: string | null;
}

export default function ReviewEmailList() {
  const timezone = useUserTimezone();
  const [emails, setEmails] = useState<EmailForReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [needsReview, setNeedsReview] = useState(false);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [updatingEmailId, setUpdatingEmailId] = useState<string | null>(null);
  const [similarModalOpen, setSimilarModalOpen] = useState(false);
  const [similarEmails, setSimilarEmails] = useState<any[]>([]);
  const [pendingCorrection, setPendingCorrection] = useState<{
    emailId: string;
    newTagId: string;
    newTagName: string;
    newTagDisplayName: string;
    newTagIcon: string | null;
  } | null>(null);

  // Fetch all available tags
  const fetchTags = async () => {
    try {
      const response = await fetch("/api/emails/classify");
      const data = await response.json();
      if (data.tags) {
        setAllTags(data.tags);
      }
    } catch (err) {
      console.error("Failed to fetch tags:", err);
    }
  };

  const fetchEmails = useCallback(async (
    pageNum: number = 1,
    append: boolean = false
  ) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }

    try {
      const params = new URLSearchParams({
        page: pageNum.toString(),
        limit: "50",
      });

      if (tagFilter) {
        params.append("tag", tagFilter);
      }

      if (needsReview) {
        params.append("needsReview", "true");
      }

      const response = await fetch(
        `/api/classifications/review?${params.toString()}`
      );
      const data = await response.json();

      if (data.emails) {
        setEmails((prev) => (append ? [...prev, ...data.emails] : data.emails));
        setHasMore(data.hasMore);
        setPage(pageNum);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch emails");
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [tagFilter, needsReview]);

  const handleCorrectTag = async (emailId: string, newTagId: string) => {
    setUpdatingEmailId(emailId);

    try {
      const response = await fetch(
        `/api/emails/${emailId}/correct-classification`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newTagId }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to correct classification");
      }

      const data = await response.json();

      // If similar emails were found, show the modal
      if (data.similarEmails && data.similarEmails.length > 0) {
        const newTag = allTags.find(t => t.id === newTagId);
        if (newTag) {
          setPendingCorrection({
            emailId,
            newTagId,
            newTagName: newTag.name,
            newTagDisplayName: newTag.displayName,
            newTagIcon: newTag.icon,
          });
          setSimilarEmails(data.similarEmails);
          setSimilarModalOpen(true);
        }
      }

      // Refresh the email list
      await fetchEmails(1, false);
    } catch (err) {
      console.error("Error correcting tag:", err);
      setError("Failed to update classification");
      setTimeout(() => setError(null), 5000);
    } finally {
      setUpdatingEmailId(null);
    }
  };

  const handleApplyToSimilar = async (emailIds: string[]) => {
    if (!pendingCorrection) return;

    try {
      const response = await fetch(
        `/api/emails/${pendingCorrection.emailId}/correct-classification`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            newTagId: pendingCorrection.newTagId,
            applyToSimilarIds: emailIds,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to apply to similar emails");
      }

      // Refresh the email list
      await fetchEmails(1, false);
    } catch (err) {
      console.error("Error applying to similar emails:", err);
      setError("Failed to apply to similar emails");
      setTimeout(() => setError(null), 5000);
    }
  };

  const handleFilterChange = (newTagFilter: string | null) => {
    setTagFilter(newTagFilter);
    setPage(1);
  };

  const handleNeedsReviewToggle = () => {
    setNeedsReview((prev) => !prev);
    setPage(1);
  };

  const loadMore = async () => {
    if (!hasMore || loadingMore) return;
    await fetchEmails(page + 1, true);
  };

  useEffect(() => {
    fetchTags();
  }, []);

  useEffect(() => {
    fetchEmails(1, false);
  }, [tagFilter, needsReview, fetchEmails]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Filter controls */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Filter by Tag
            </label>
            <select
              value={tagFilter || ""}
              onChange={(e) =>
                handleFilterChange(e.target.value || null)
              }
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Tags</option>
              {allTags.map((tag) => (
                <option key={tag.id} value={tag.name}>
                  {tag.icon} {tag.displayName}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={needsReview}
                onChange={handleNeedsReviewToggle}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Show only low confidence (needs review)
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}

      {/* Email list */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-200">
        {emails.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No classified emails found.
          </div>
        ) : (
          emails.map((email) => {
            const { name: senderName } = parseFromHeader(email.from);

            return (
              <div key={email.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">
                        {senderName}
                      </h3>
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        {formatEmailDate(email.date, timezone)}
                      </span>
                    </div>

                    <p className="text-sm text-gray-900 mb-1 truncate">
                      {email.subject || "(No subject)"}
                    </p>

                    <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                      {email.snippet}
                    </p>

                    <div className="flex items-center gap-4 mt-2">
                      {/* Current tag dropdown */}
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500">Tag:</label>
                        <select
                          value={email.currentTag.id}
                          onChange={(e) =>
                            handleCorrectTag(email.id, e.target.value)
                          }
                          disabled={updatingEmailId === email.id}
                          className={`px-2 py-1 text-xs border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                            updatingEmailId === email.id
                              ? "opacity-50 cursor-not-allowed"
                              : ""
                          }`}
                        >
                          {allTags.map((tag) => (
                            <option key={tag.id} value={tag.id}>
                              {tag.icon} {tag.displayName}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Confidence and source */}
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        {email.confidence !== null && (
                          <span>
                            Confidence:{" "}
                            {Math.round((email.confidence || 0) * 100)}%
                          </span>
                        )}
                        <span className="text-gray-300">|</span>
                        <span>Source: {email.source}</span>
                      </div>

                      {/* Update indicator */}
                      {updatingEmailId === email.id && (
                        <span className="text-xs text-blue-600">
                          Updating...
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Load more button */}
      {hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-6 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loadingMore ? "Loading..." : "Load More"}
          </button>
        </div>
      )}

      {/* Apply to similar emails modal */}
      {pendingCorrection && (
        <ApplySimilarModal
          isOpen={similarModalOpen}
          onClose={() => {
            setSimilarModalOpen(false);
            setPendingCorrection(null);
            setSimilarEmails([]);
          }}
          similarEmails={similarEmails}
          newTagName={pendingCorrection.newTagName}
          newTagDisplayName={pendingCorrection.newTagDisplayName}
          newTagIcon={pendingCorrection.newTagIcon}
          onApply={handleApplyToSimilar}
        />
      )}
    </div>
  );
}
