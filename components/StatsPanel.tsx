"use client";

import { useEffect, useState, useCallback } from "react";

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
  const [celebrating, setCelebrating] = useState(false);
  const [previousCount, setPreviousCount] = useState<number | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const response = await fetch("/api/stats");
      if (!response.ok) {
        throw new Error("Failed to fetch stats");
      }
      const data = await response.json();

      // Check if count decreased (email was processed)
      if (previousCount !== null && data.totalUnarchived < previousCount) {
        setCelebrating(true);
        setTimeout(() => setCelebrating(false), 500);
      }

      setPreviousCount(data.totalUnarchived);
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  }, [previousCount]);

  useEffect(() => {
    fetchStats();

    const handleEmailArchived = () => {
      fetchStats();
    };

    window.addEventListener("emailArchived", handleEmailArchived);

    return () => {
      window.removeEventListener("emailArchived", handleEmailArchived);
    };
  }, [fetchStats]);

  if (loading) {
    return (
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="animate-pulse">
            <div className="h-20 bg-gradient-to-r from-slate-200 to-slate-300 rounded-2xl mb-4"></div>
            <div className="h-6 bg-gradient-to-r from-slate-200 to-slate-300 rounded-lg w-3/4 mx-auto mb-3"></div>
            <div className="h-3 bg-gradient-to-r from-slate-200 to-slate-300 rounded-full"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="text-center">
            <div className="text-lg font-bold text-red-600">
              Error loading stats
            </div>
            <p className="text-slate-500 text-sm">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  const { totalUnarchived, parsedToday, parsedThisWeek, velocity } = stats;

  const isInboxZero = totalUnarchived === 0;
  const progressPercent = Math.max(0, Math.min(100, 100 - (totalUnarchived / Math.max(totalUnarchived + parsedToday, 100)) * 100));

  // Motivational messages based on progress
  const getMotivationalMessage = () => {
    if (isInboxZero) return "Inbox Zero achieved";
    if (totalUnarchived <= 5) return "Almost there";
    if (totalUnarchived <= 20) return "Keep the momentum";
    if (totalUnarchived <= 50) return "Making progress";
    return "Let's clear this inbox";
  };

  const getColorClasses = () => {
    if (isInboxZero) return {
      gradient: "from-green-500 via-emerald-500 to-teal-500",
      text: "text-green-600",
      bg: "bg-gradient-to-r from-green-50 to-emerald-50",
      border: "border-green-200",
      ring: "ring-green-500/20"
    };
    if (totalUnarchived <= 20) return {
      gradient: "from-green-500 via-blue-500 to-violet-500",
      text: "text-green-600",
      bg: "bg-gradient-to-r from-green-50 to-blue-50",
      border: "border-green-200",
      ring: "ring-green-500/20"
    };
    if (totalUnarchived <= 50) return {
      gradient: "from-blue-500 via-violet-500 to-purple-500",
      text: "text-blue-600",
      bg: "bg-gradient-to-r from-blue-50 to-violet-50",
      border: "border-blue-200",
      ring: "ring-blue-500/20"
    };
    return {
      gradient: "from-orange-500 via-red-500 to-pink-500",
      text: "text-orange-600",
      bg: "bg-gradient-to-r from-orange-50 to-red-50",
      border: "border-orange-200",
      ring: "ring-orange-500/20"
    };
  };

  const colors = getColorClasses();

  return (
    <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-3 py-2 sm:py-3 lg:px-8">
        {/* Single line layout on mobile, expanded on desktop */}
        <div className="flex items-center justify-between gap-2 sm:gap-4">
          {/* Left: Main count */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className={`text-2xl sm:text-3xl md:text-4xl font-bold ${colors.text} transition-all duration-300 ${celebrating ? 'animate-celebrate' : ''}`}
                 style={{ letterSpacing: '-0.02em', lineHeight: '1' }}>
              {totalUnarchived}
            </div>
            <div className="hidden sm:block">
              <div className="text-slate-900 text-sm font-semibold leading-tight">
                Remaining
              </div>
              <div className="text-slate-500 text-xs">
                {getMotivationalMessage()}
              </div>
            </div>
            <div className="sm:hidden text-xs text-slate-600 font-medium">
              remaining
            </div>
          </div>

          {/* Right: Compact inline stats */}
          <div className="flex items-center gap-2 sm:gap-4">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="text-sm sm:text-base font-bold text-slate-700">
                {parsedToday}
              </div>
              <div className="text-xs text-slate-500">today</div>
            </div>
            <div className="hidden sm:flex items-center gap-2">
              <div className="text-base font-bold text-slate-700">
                {parsedThisWeek}
              </div>
              <div className="text-xs text-slate-500">this week</div>
            </div>
            <div className="hidden md:flex items-center gap-2">
              <div className="text-base font-bold text-slate-700">
                {velocity}
              </div>
              <div className="text-xs text-slate-500">/min</div>
            </div>
          </div>
        </div>

        {/* Thin progress bar */}
        <div className="w-full bg-slate-200 rounded-full h-1 overflow-hidden mt-2 relative">
          <div
            className={`h-1 rounded-full transition-all duration-500 ease-out bg-gradient-to-r ${colors.gradient}`}
            style={{ width: `${Math.min(100, progressPercent)}%` }}
          />
        </div>
      </div>
    </div>
  );
}
