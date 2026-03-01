"use client";

import { useState, useEffect } from "react";

interface SendToReaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  emailId: string;
  emailSubject: string;
  emailFrom: string;
  onSuccess?: () => void;
}

export default function SendToReaderModal({
  isOpen,
  onClose,
  emailId,
  emailSubject,
  emailFrom,
  onSuccess,
}: SendToReaderModalProps) {
  const [urls, setUrls] = useState<string[]>([]);
  const [selectedUrl, setSelectedUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (isOpen && emailId) {
      extractUrls();
    } else {
      setUrls([]);
      setSelectedUrl("");
      setError(null);
      setSuccess(false);
    }
  }, [isOpen, emailId]);

  const extractUrls = async () => {
    setExtracting(true);
    setError(null);

    try {
      const response = await fetch("/api/reader/extract-urls", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to extract URLs");
      }

      setUrls(data.urls || []);
      setSelectedUrl(data.primaryUrl || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extract URLs");
    } finally {
      setExtracting(false);
    }
  };

  const handleSave = async () => {
    if (!selectedUrl) return;

    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/reader/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emailId, url: selectedUrl }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save to Reader");
      }

      setSuccess(true);
      onSuccess?.();
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save to Reader");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5 text-yellow-600"
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
              <h2 className="text-lg font-semibold text-gray-900">
                Send to Reader
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="mb-4">
            <p className="text-sm text-gray-600 truncate">
              <span className="font-medium">Subject:</span> {emailSubject}
            </p>
            <p className="text-sm text-gray-500 truncate">
              <span className="font-medium">From:</span> {emailFrom}
            </p>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved to Reader!
            </div>
          )}

          {extracting ? (
            <div className="flex items-center justify-center py-8">
              <div className="inline-block h-6 w-6 animate-spin rounded-full border-4 border-solid border-yellow-500 border-r-transparent mr-3"></div>
              <span className="text-sm text-gray-600">Extracting URLs from email...</span>
            </div>
          ) : urls.length === 0 ? (
            <div className="text-center py-6">
              <p className="text-gray-500 text-sm">No URLs found in this email.</p>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Select URL to save ({urls.length} found)
              </label>
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {urls.map((url, index) => (
                  <label
                    key={index}
                    className={`flex items-start gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                      selectedUrl === url
                        ? "border-yellow-500 bg-yellow-50"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="url"
                      value={url}
                      checked={selectedUrl === url}
                      onChange={() => setSelectedUrl(url)}
                      className="mt-1 text-yellow-600 focus:ring-yellow-500"
                    />
                    <span className="text-sm text-gray-700 break-all">{url}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-200">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !selectedUrl || success}
              className="px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving..." : "Save to Reader"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
