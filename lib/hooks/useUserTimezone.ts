"use client";

import { useEffect, useState } from "react";

let cached: string | null | undefined = undefined;
let inflight: Promise<string | null> | null = null;
const subscribers = new Set<(tz: string | null) => void>();

function getBrowserTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

async function fetchTimezone(): Promise<string | null> {
  if (cached !== undefined) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch("/api/user-settings");
      if (!res.ok) return null;
      const data = await res.json();
      const tz = data?.settings?.timezone ?? null;
      cached = tz;
      subscribers.forEach((cb) => cb(tz));
      return tz;
    } catch {
      cached = null;
      return null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/**
 * Returns the user's preferred timezone. Falls back to the browser's
 * detected timezone while loading or when the user has not chosen one.
 */
export function useUserTimezone(): string {
  const [tz, setTz] = useState<string>(() =>
    typeof cached === "string" ? cached : getBrowserTimezone()
  );

  useEffect(() => {
    let active = true;
    const update = (next: string | null) => {
      if (!active) return;
      setTz(next || getBrowserTimezone());
    };
    subscribers.add(update);
    fetchTimezone().then(update);
    return () => {
      active = false;
      subscribers.delete(update);
    };
  }, []);

  return tz;
}

/** Invalidate the cached timezone so the next consumer refetches. */
export function invalidateUserTimezone(next: string | null) {
  cached = next;
  subscribers.forEach((cb) => cb(next));
}
