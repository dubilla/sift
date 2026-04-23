"use client";

import { useState, useEffect } from "react";

interface CreateCrewTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  emailSubject: string;
  emailFrom: string;
  emailSnippet: string;
  emailId: string;
}

export default function CreateCrewTaskModal({
  isOpen,
  onClose,
  emailSubject,
  emailFrom,
  emailSnippet,
  emailId,
}: CreateCrewTaskModalProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignee, setAssignee] = useState<"user" | "agent">("user");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ url: string; title: string } | null>(
    null
  );

  useEffect(() => {
    if (!isOpen) return;

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    setTitle(emailSubject || "Follow up on email");

    const init = async () => {
      try {
        const statusResponse = await fetch("/api/crew/status");
        const statusData = await statusResponse.json();
        setIsConnected(Boolean(statusData.connected));

        if (statusData.connected) {
          try {
            const emailResponse = await fetch(`/api/emails/${emailId}`);
            if (emailResponse.ok) {
              const emailData = await emailResponse.json();
              const bodyContent = emailData.bodyText || emailSnippet;
              setDescription(
                `From: ${emailFrom}\n\n${bodyContent}\n\n---\nCreated from email in Sift`
              );
            } else {
              setDescription(
                `From: ${emailFrom}\n\n${emailSnippet}\n\n---\nCreated from email in Sift`
              );
            }
          } catch (err) {
            console.error("Error fetching full email:", err);
            setDescription(
              `From: ${emailFrom}\n\n${emailSnippet}\n\n---\nCreated from email in Sift`
            );
          }
        }
      } catch (err) {
        console.error("Error loading Crew status:", err);
        setError("Failed to load Crew status");
      }
      setIsLoading(false);
    };

    init();
  }, [isOpen, emailSubject, emailFrom, emailSnippet, emailId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/crew/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description,
          dueDate: dueDate || undefined,
          assignee,
          emailId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create task");
      }

      setSuccess({ url: data.task.url, title: data.task.title });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <svg
              className="w-6 h-6 text-indigo-500"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
            Create Crew Task
          </h2>
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

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-500 border-r-transparent"></div>
          </div>
        ) : !isConnected ? (
          <div className="text-center py-8">
            <div className="mb-4">
              <svg
                className="w-16 h-16 text-gray-300 mx-auto"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Connect Crew
            </h3>
            <p className="text-gray-500 mb-4">
              Add your Crew base URL and API token in settings to create tasks
              from emails.
            </p>
            <a
              href="/settings"
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
            >
              Open Settings
            </a>
          </div>
        ) : success ? (
          <div className="text-center py-8">
            <div className="mb-4">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full">
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
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              Task Created!
            </h3>
            <p className="text-gray-500 mb-4">{success.title}</p>
            <div className="flex gap-3 justify-center">
              <a
                href={success.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors"
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
                    d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                  />
                </svg>
                Open in Crew
              </a>
              <button
                onClick={onClose}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Title *
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Enter task title"
              />
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assign to
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAssignee("user")}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm ${
                    assignee === "user"
                      ? "bg-indigo-50 border-indigo-500 text-indigo-700"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Me
                </button>
                <button
                  type="button"
                  onClick={() => setAssignee("agent")}
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm ${
                    assignee === "agent"
                      ? "bg-indigo-50 border-indigo-500 text-indigo-700"
                      : "border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Agent
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Agent tasks start running in Crew automatically
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="Add description..."
              />
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? "Creating..." : "Create Task"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
