"use client";

import { useEffect, useState } from "react";

interface Stats {
  totalUnarchived: number;
  parsedToday: number;
  parsedThisWeek: number;
  velocity: number;
}

export default function StatsPanel() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/stats");
      if (!response.ok) {
        throw new Error("Failed to fetch stats");
      }
      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();

    const handleEmailArchived = () => {
      fetchStats();
    };

    window.addEventListener("emailArchived", handleEmailArchived);

    return () => {
      window.removeEventListener("emailArchived", handleEmailArchived);
    };
  }, []);

  if (loading) {
    return (
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="animate-pulse">
            <div className="h-16 bg-gray-200 rounded mb-3"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
            <div className="h-2 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="text-center">
            <div className="text-lg font-bold text-red-600">
              Error loading stats
            </div>
            <p className="text-gray-500 text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const { totalUnarchived, parsedToday, parsedThisWeek, velocity } = stats;

  const colorClass =
    totalUnarchived === 0
      ? "text-green-600"
      : totalUnarchived < 20
        ? "text-green-600"
        : totalUnarchived < 50
          ? "text-yellow-600"
          : "text-red-600";

  const progressPercent = totalUnarchived === 0 ? 100 : Math.max(0, 100 - (totalUnarchived / 100) * 100);

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 py-4 sm:px-6 lg:px-8">
        {/* Main unarchived count */}
        <div className="text-center mb-3">
          <div className={`text-5xl sm:text-6xl font-bold ${colorClass} mb-1`}>
            {totalUnarchived}
          </div>
          <div className="text-gray-600 text-sm sm:text-base">
            unarchived emails
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${Math.min(100, progressPercent)}%` }}
          ></div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center">
          <div className="bg-gray-50 rounded-lg p-2 sm:p-3">
            <div className="text-xl sm:text-2xl font-bold text-blue-600">
              {parsedToday}
            </div>
            <div className="text-xs sm:text-sm text-gray-600">
              Today
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2 sm:p-3">
            <div className="text-xl sm:text-2xl font-bold text-blue-600">
              {parsedThisWeek}
            </div>
            <div className="text-xs sm:text-sm text-gray-600">
              This Week
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-2 sm:p-3">
            <div className="text-xl sm:text-2xl font-bold text-blue-600">
              {velocity}
            </div>
            <div className="text-xs sm:text-sm text-gray-600">
              emails/min
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
