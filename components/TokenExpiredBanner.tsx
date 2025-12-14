"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function TokenExpiredBanner() {
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [message, setMessage] = useState("");
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    const checkTokenStatus = async () => {
      try {
        const response = await fetch("/api/auth/check-token-status");
        if (!response.ok) return;

        const data = await response.json();
        if (data.needsReconnect) {
          setNeedsReconnect(true);
          setMessage(data.message || "Your Google connection has expired.");
        }
      } catch (error) {
        console.error("Error checking token status:", error);
      }
    };

    checkTokenStatus();
    const interval = setInterval(checkTokenStatus, 60000);

    return () => clearInterval(interval);
  }, []);

  if (!needsReconnect || isDismissed) {
    return null;
  }

  return (
    <div className="bg-yellow-50 border-b border-yellow-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg
              className="w-5 h-5 text-yellow-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p className="text-sm text-yellow-800">{message}</p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              className="px-4 py-2 bg-yellow-600 text-white text-sm rounded-lg hover:bg-yellow-700 transition-colors"
            >
              Go to Settings
            </Link>
            <button
              onClick={() => setIsDismissed(true)}
              className="text-yellow-600 hover:text-yellow-800"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
