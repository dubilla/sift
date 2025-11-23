"use client";

import { useEffect, useState } from "react";

export default function EmailCount() {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchCount = async () => {
    try {
      const response = await fetch("/api/emails/count");
      if (!response.ok) {
        throw new Error("Failed to fetch email count");
      }
      const data = await response.json();
      setCount(data.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCount();

    const handleEmailArchived = () => {
      setCount((prev) => (prev !== null ? Math.max(0, prev - 1) : null));
    };

    window.addEventListener("emailArchived", handleEmailArchived);

    return () => {
      window.removeEventListener("emailArchived", handleEmailArchived);
    };
  }, []);

  if (loading) {
    return (
      <div className="text-5xl font-bold text-blue-600 mb-2 animate-pulse">
        ...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center">
        <div className="text-xl font-bold text-red-600 mb-2">Error</div>
        <p className="text-gray-500 text-sm">{error}</p>
      </div>
    );
  }

  const colorClass =
    count === null
      ? "text-gray-600"
      : count === 0
        ? "text-green-600"
        : count < 20
          ? "text-green-600"
          : count < 50
            ? "text-yellow-600"
            : "text-red-600";

  return (
    <div className={`text-5xl font-bold ${colorClass} mb-2`}>
      {count ?? "—"}
    </div>
  );
}
