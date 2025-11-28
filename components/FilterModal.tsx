"use client";

import { useState } from "react";

interface FilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  senderEmail: string;
  senderName: string;
  onConfirm: (applyToExisting: boolean) => Promise<void>;
}

export default function FilterModal({
  isOpen,
  onClose,
  senderEmail,
  senderName,
  onConfirm,
}: FilterModalProps) {
  const [applyToExisting, setApplyToExisting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await onConfirm(applyToExisting);
      onClose();
    } catch (error) {
      console.error("Error creating filter:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-xl max-w-md w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-semibold mb-4">Create Filter</h2>

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Sender
            </label>
            <div className="bg-gray-50 p-3 rounded border border-gray-200">
              <div className="font-medium text-gray-900">{senderName}</div>
              <div className="text-sm text-gray-600">{senderEmail}</div>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Action
            </label>
            <div className="bg-gray-50 p-3 rounded border border-gray-200">
              <div className="text-sm text-gray-900">
                Skip inbox (auto-archive)
              </div>
              <div className="text-xs text-gray-500 mt-1">
                Future emails from this sender will bypass your inbox
              </div>
            </div>
          </div>

          <div className="mb-6">
            <label className="flex items-start space-x-3">
              <input
                type="checkbox"
                checked={applyToExisting}
                onChange={(e) => setApplyToExisting(e.target.checked)}
                className="mt-1 h-4 w-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <div>
                <div className="text-sm font-medium text-gray-900">
                  Apply to existing emails
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  Archive all current inbox emails from this sender
                </div>
              </div>
            </label>
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
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Creating..." : "Create Filter"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
