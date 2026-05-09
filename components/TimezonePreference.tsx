"use client";

import { useEffect, useMemo, useState } from "react";
import { invalidateUserTimezone } from "@/lib/hooks/useUserTimezone";

const BROWSER_VALUE = "__browser__";

function getSupportedTimezones(): string[] {
  const intlAny = Intl as unknown as { supportedValuesOf?: (key: string) => string[] };
  if (typeof intlAny.supportedValuesOf === "function") {
    try {
      return intlAny.supportedValuesOf("timeZone");
    } catch {
      // fall through
    }
  }
  // Conservative fallback for older runtimes
  return [
    "UTC",
    "America/Los_Angeles",
    "America/Denver",
    "America/Chicago",
    "America/New_York",
    "Europe/London",
    "Europe/Berlin",
    "Europe/Paris",
    "Asia/Tokyo",
    "Asia/Shanghai",
    "Asia/Kolkata",
    "Australia/Sydney",
  ];
}

export default function TimezonePreference() {
  const [value, setValue] = useState<string>(BROWSER_VALUE);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const browserTimezone = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    []
  );
  const timezones = useMemo(getSupportedTimezones, []);

  useEffect(() => {
    const load = async () => {
      try {
        const response = await fetch("/api/user-settings");
        if (response.ok) {
          const data = await response.json();
          const tz = data?.settings?.timezone;
          setValue(tz ? tz : BROWSER_VALUE);
        }
      } catch (err) {
        console.error("Error loading timezone setting:", err);
      }
      setIsLoading(false);
    };
    load();
  }, []);

  const handleChange = async (next: string) => {
    setValue(next);
    setIsSaving(true);
    setSaveSuccess(false);

    const payload = next === BROWSER_VALUE ? null : next;

    try {
      const response = await fetch("/api/user-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: payload }),
      });
      if (response.ok) {
        invalidateUserTimezone(payload);
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Error saving timezone:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Time Zone</h2>
        <p className="text-sm text-gray-500">
          Email times are displayed in this time zone.
        </p>
      </div>

      {saveSuccess && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
          Time zone saved
        </div>
      )}

      <select
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isLoading || isSaving}
        className="w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50"
      >
        <option value={BROWSER_VALUE}>
          Use browser default ({browserTimezone})
        </option>
        {timezones.map((tz) => (
          <option key={tz} value={tz}>
            {tz}
          </option>
        ))}
      </select>
    </div>
  );
}
