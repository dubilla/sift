"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { formatEmailDate, parseFromHeader } from "@/lib/utils/email";
import ApplySimilarModal from "./ApplySimilarModal";

const PAGE_SIZE = 25;

const TAG_REVIEW_ORDER = ["archivable", "unsubscribable", "asana_task", "quick_action"];

const TAG_ACTION_MAP: Record<string, "archive" | "unsubscribe" | "create_task" | null> = {
  archivable: "archive",
  unsubscribable: "unsubscribe",
  asana_task: "create_task",
  quick_action: null,
};

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

// Track per-email overrides: if the user changes a tag, we store the new tag here
type TagOverrides = Record<string, { tagId: string; tagName: string }>;

export default function ReviewEmailList() {
  const [emails, setEmails] = useState<EmailForReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [needsReview, setNeedsReview] = useState(false);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [tagOverrides, setTagOverrides] = useState<TagOverrides>({});
  const [updatingEmailId, setUpdatingEmailId] = useState<string | null>(null);
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<{
    succeeded: number;
    failed: number;
  } | null>(null);
  const [excludedIds, setExcludedIds] = useState<Set<string>>(new Set());

  // Apply Similar modal state
  const [similarModalOpen, setSimilarModalOpen] = useState(false);
  const [similarEmails, setSimilarEmails] = useState<any[]>([]);
  const [pendingCorrection, setPendingCorrection] = useState<{
    emailId: string;
    newTagId: string;
    newTagName: string;
    newTagDisplayName: string;
    newTagIcon: string | null;
  } | null>(null);

  // Fetch tags + counts, then auto-select the first tag with emails
  const fetchTagsAndAutoSelect = async () => {
    try {
      const response = await fetch("/api/emails/classify");
      const data = await response.json();
      if (data.tags) {
        setAllTags(data.tags);

        // Build a count map by tag name
        const countByName: Record<string, number> = {};
        for (const tag of data.tags) {
          countByName[tag.name] = tag.count || 0;
        }

        // Auto-select the first tag (in review order) that has emails,
        // but only if the user hasn't manually picked a filter yet
        if (tagFilter === null) {
          const firstWithEmails = TAG_REVIEW_ORDER.find(
            (name) => (countByName[name] || 0) > 0
          );
          if (firstWithEmails) {
            setTagFilter(firstWithEmails);
          }
        }
      }
    } catch (err) {
      console.error("Failed to fetch tags:", err);
    }
  };

  // Advance to the next tag in review order that has remaining emails
  const advanceToNextTag = useCallback(() => {
    if (!tagFilter) return false;
    const currentIdx = TAG_REVIEW_ORDER.indexOf(tagFilter);
    if (currentIdx === -1) return false;

    // Find the next tag in order (we'll let fetchEmails discover if it has emails)
    for (let i = currentIdx + 1; i < TAG_REVIEW_ORDER.length; i++) {
      const nextTag = TAG_REVIEW_ORDER[i];
      setTagFilter(nextTag);
      setPage(1);
      return true;
    }
    return false; // No more tags
  }, [tagFilter]);

  const fetchEmails = useCallback(
    async (pageNum: number = 1) => {
      setLoading(true);
      setTagOverrides({});
      setExcludedIds(new Set());
      setExecutionResult(null);

      try {
        const params = new URLSearchParams({
          page: pageNum.toString(),
          limit: PAGE_SIZE.toString(),
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
          // If page is empty and we're filtering by tag, auto-advance to next tag
          if (data.emails.length === 0 && tagFilter && pageNum === 1) {
            const advanced = advanceToNextTag();
            if (!advanced) {
              // No more tags with emails - show the empty state
              setEmails([]);
              setHasMore(false);
              setPage(1);
              setLoading(false);
            }
            return;
          }

          setEmails(data.emails);
          setHasMore(data.hasMore);
          setPage(pageNum);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to fetch emails"
        );
        setTimeout(() => setError(null), 5000);
      } finally {
        setLoading(false);
      }
    },
    [tagFilter, needsReview, advanceToNextTag]
  );

  // Correct a single email's tag (persists to backend + triggers similar modal)
  const handleCorrectTag = async (emailId: string, newTagId: string) => {
    const newTag = allTags.find((t) => t.id === newTagId);
    if (!newTag) return;

    // Update local override immediately for responsiveness
    setTagOverrides((prev) => ({
      ...prev,
      [emailId]: { tagId: newTagId, tagName: newTag.name },
    }));

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

      // Update the email's tag in local state
      setEmails((prev) =>
        prev.map((e) =>
          e.id === emailId
            ? {
                ...e,
                currentTag: {
                  id: newTagId,
                  name: newTag.name,
                  displayName: newTag.displayName || newTag.name,
                  icon: newTag.icon,
                  color: null,
                },
                confidence: 1.0,
                source: "user",
              }
            : e
        )
      );

      // If similar emails found, show modal
      if (data.similarEmails && data.similarEmails.length > 0) {
        setPendingCorrection({
          emailId,
          newTagId,
          newTagName: newTag.name,
          newTagDisplayName: newTag.displayName || newTag.name,
          newTagIcon: newTag.icon,
        });
        setSimilarEmails(data.similarEmails);
        setSimilarModalOpen(true);
      }
    } catch (err) {
      console.error("Error correcting tag:", err);
      // Revert override
      setTagOverrides((prev) => {
        const next = { ...prev };
        delete next[emailId];
        return next;
      });
      setError("Failed to update classification");
      setTimeout(() => setError(null), 5000);
    } finally {
      setUpdatingEmailId(null);
    }
  };

  const handleApplyToSimilar = async (emailIds: string[]) => {
    if (!pendingCorrection) return;

    try {
      await fetch(
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
    } catch (err) {
      console.error("Error applying to similar emails:", err);
      setError("Failed to apply to similar emails");
      setTimeout(() => setError(null), 5000);
    }
  };

  // Toggle excluding an email from the page action
  const handleToggleExclude = (emailId: string) => {
    setExcludedIds((prev) => {
      const next = new Set(prev);
      if (next.has(emailId)) {
        next.delete(emailId);
      } else {
        next.add(emailId);
      }
      return next;
    });
  };

  // Get the effective tag for an email (override or current)
  const getEffectiveTag = (email: EmailForReview) => {
    const override = tagOverrides[email.id];
    if (override) return override.tagName;
    return email.currentTag.name;
  };

  // Get the action for an email based on its effective tag
  const getAction = (email: EmailForReview) => {
    const tagName = getEffectiveTag(email);
    return TAG_ACTION_MAP[tagName] || null;
  };

  // Execute all actions for the current page
  const handleApprovePage = async () => {
    setExecuting(true);
    setExecutionResult(null);

    try {
      const actions = emails
        .filter((e) => !excludedIds.has(e.id))
        .map((e) => ({
          emailId: e.id,
          action: getAction(e),
        }))
        .filter((a) => a.action !== null) as {
        emailId: string;
        action: "archive" | "unsubscribe" | "create_task";
      }[];

      if (actions.length === 0) {
        setExecutionResult({ succeeded: 0, failed: 0 });
        setExecuting(false);
        return;
      }

      const response = await fetch("/api/emails/batch-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actions }),
      });

      if (!response.ok) {
        throw new Error("Batch action failed");
      }

      const data = await response.json();
      setExecutionResult({
        succeeded: data.summary.succeeded,
        failed: data.summary.failed,
      });

      // After a short delay, reload the current page (which will auto-advance
      // to the next tag if this tag is now empty)
      setTimeout(() => {
        fetchEmails(1);
      }, 1500);
    } catch (err) {
      console.error("Error executing batch actions:", err);
      setError("Failed to execute actions");
      setTimeout(() => setError(null), 5000);
    } finally {
      setExecuting(false);
    }
  };

  // Skip page without executing any actions
  const handleSkipPage = () => {
    if (hasMore) {
      fetchEmails(page + 1);
    }
  };

  const initializedRef = useRef(false);

  // On mount: fetch tags, auto-select first tag, then fetch emails once
  useEffect(() => {
    fetchTagsAndAutoSelect().then(() => {
      initializedRef.current = true;
    });
  }, []);

  // After init: re-fetch when filter changes
  useEffect(() => {
    if (!initializedRef.current) return;
    fetchEmails(1);
  }, [tagFilter, needsReview, fetchEmails]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Count actionable emails on this page
  const includedEmails = emails.filter((e) => !excludedIds.has(e.id));
  const actionableCount = includedEmails.filter((e) => getAction(e) !== null).length;

  // Group summary for the page header
  const tagSummary = emails.reduce<Record<string, number>>((acc, e) => {
    if (excludedIds.has(e.id)) return acc;
    const tagName = getEffectiveTag(e);
    acc[tagName] = (acc[tagName] || 0) + 1;
    return acc;
  }, {});

  return (
    <div>
      {/* Tag review steps */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
        <div className="flex flex-col gap-3">
          {/* Step indicators */}
          <div className="flex items-center gap-2">
            {TAG_REVIEW_ORDER.map((tagName, idx) => {
              const tag = allTags.find((t) => t.name === tagName);
              const isActive = tagFilter === tagName;
              const isPast = tagFilter
                ? TAG_REVIEW_ORDER.indexOf(tagFilter) > idx
                : false;
              return (
                <button
                  key={tagName}
                  onClick={() => {
                    setTagFilter(tagName);
                    setPage(1);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-full border transition-colors ${
                    isActive
                      ? "bg-blue-600 text-white border-blue-600"
                      : isPast
                      ? "bg-green-50 text-green-700 border-green-200"
                      : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {isPast && !isActive && (
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                  <span>{tag?.icon}</span>
                  <span>{tag?.displayName || tagName}</span>
                </button>
              );
            })}
            <button
              onClick={() => {
                setTagFilter(null);
                setPage(1);
              }}
              className={`px-3 py-1.5 text-sm rounded-full border transition-colors ${
                tagFilter === null
                  ? "bg-blue-600 text-white border-blue-600"
                  : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"
              }`}
            >
              All
            </button>
          </div>

          <div className="flex items-center">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={needsReview}
                onChange={() => {
                  setNeedsReview((prev) => !prev);
                  setPage(1);
                }}
                className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-gray-700">
                Show only low confidence (needs review)
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Page action summary */}
      {emails.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-blue-900">
                Page {page} &mdash; {emails.length} email{emails.length !== 1 ? "s" : ""}
              </h3>
              <div className="flex flex-wrap gap-3 mt-1">
                {Object.entries(tagSummary).map(([tagName, count]) => {
                  const tag = allTags.find((t) => t.name === tagName);
                  const action = TAG_ACTION_MAP[tagName];
                  return (
                    <span
                      key={tagName}
                      className="text-xs text-blue-800"
                    >
                      {tag?.icon} {tag?.displayName || tagName}: {count}
                      {action && (
                        <span className="text-blue-600 ml-1">
                          ({action.replace("_", " ")})
                        </span>
                      )}
                      {!action && (
                        <span className="text-gray-500 ml-1">(no action)</span>
                      )}
                    </span>
                  );
                })}
                {excludedIds.size > 0 && (
                  <span className="text-xs text-gray-500">
                    {excludedIds.size} excluded
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSkipPage}
                disabled={executing || !hasMore}
                className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Skip Page
              </button>
              <button
                onClick={handleApprovePage}
                disabled={executing || actionableCount === 0}
                className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {executing
                  ? "Executing..."
                  : `Approve Page (${actionableCount} action${actionableCount !== 1 ? "s" : ""})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Execution result banner */}
      {executionResult && (
        <div
          className={`rounded-lg p-4 mb-4 ${
            executionResult.failed === 0
              ? "bg-green-50 border border-green-200"
              : "bg-yellow-50 border border-yellow-200"
          }`}
        >
          <p
            className={`text-sm ${
              executionResult.failed === 0
                ? "text-green-800"
                : "text-yellow-800"
            }`}
          >
            {executionResult.succeeded} action{executionResult.succeeded !== 1 ? "s" : ""}{" "}
            completed successfully.
            {executionResult.failed > 0 &&
              ` ${executionResult.failed} failed.`}
            {" "}Loading next page...
          </p>
        </div>
      )}

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
            {tagFilter ? (
              <>
                No {allTags.find((t) => t.name === tagFilter)?.displayName || tagFilter} emails to review.
                <button
                  onClick={() => {
                    if (!advanceToNextTag()) {
                      setTagFilter(null);
                    }
                  }}
                  className="block mx-auto mt-3 text-sm text-blue-600 hover:text-blue-700"
                >
                  Continue to next category
                </button>
              </>
            ) : (
              "All caught up! No classified emails to review."
            )}
          </div>
        ) : (
          emails.map((email) => {
            const { name: senderName } = parseFromHeader(email.from);
            const action = getAction(email);
            const isExcluded = excludedIds.has(email.id);

            return (
              <div
                key={email.id}
                className={`p-4 transition-colors ${
                  isExcluded
                    ? "bg-gray-50 opacity-60"
                    : "hover:bg-gray-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Include/exclude checkbox */}
                  <input
                    type="checkbox"
                    checked={!isExcluded}
                    onChange={() => handleToggleExclude(email.id)}
                    className="w-4 h-4 mt-1 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
                    title={isExcluded ? "Include in page action" : "Exclude from page action"}
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

                    <p className="text-sm text-gray-600 line-clamp-2 mb-2">
                      {email.snippet}
                    </p>

                    <div className="flex items-center gap-4 mt-2">
                      {/* Tag dropdown */}
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500">Tag:</label>
                        <select
                          value={
                            tagOverrides[email.id]?.tagId ||
                            email.currentTag.id
                          }
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

                      {/* Action indicator */}
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          action === "archive"
                            ? "bg-gray-100 text-gray-700"
                            : action === "unsubscribe"
                            ? "bg-red-100 text-red-700"
                            : action === "create_task"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {action
                          ? action.replace("_", " ")
                          : "no action"}
                      </span>

                      {/* Confidence and source */}
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        {email.confidence !== null && (
                          <span>
                            {Math.round((email.confidence || 0) * 100)}%
                          </span>
                        )}
                        <span className="text-gray-300">|</span>
                        <span>{email.source}</span>
                      </div>

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

      {/* Page navigation */}
      {emails.length > 0 && (
        <div className="mt-4 flex items-center justify-between">
          <button
            onClick={() => fetchEmails(Math.max(1, page - 1))}
            disabled={page === 1}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Previous
          </button>
          <span className="text-sm text-gray-600">Page {page}</span>
          <button
            onClick={() => fetchEmails(page + 1)}
            disabled={!hasMore}
            className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next
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
