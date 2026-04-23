"use client";

import { useState, useEffect } from "react";

export default function CrewSettings() {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [baseUrl, setBaseUrl] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [hasStoredToken, setHasStoredToken] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      try {
        const [statusRes, settingsRes] = await Promise.all([
          fetch("/api/crew/status"),
          fetch("/api/crew/settings"),
        ]);

        const statusData = await statusRes.json();
        setIsConnected(Boolean(statusData.connected));

        const settingsData = await settingsRes.json();
        if (settingsData.settings) {
          setBaseUrl(settingsData.settings.baseUrl ?? "");
          setHasStoredToken(Boolean(settingsData.settings.hasApiToken));
        }
      } catch (err) {
        console.error("Error loading Crew settings:", err);
        setError("Failed to load Crew settings");
      }
      setIsLoading(false);
    };

    load();
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    setError(null);

    try {
      const body: Record<string, string> = { baseUrl };
      if (apiToken) body.apiToken = apiToken;
      // If token is unchanged, re-send the stored value marker by asking the user
      // to re-enter. Simpler: require a token on save.
      if (!apiToken) {
        setError("API token is required");
        setIsSaving(false);
        return;
      }

      const response = await fetch("/api/crew/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to save settings");
      }

      setHasStoredToken(true);
      setIsConnected(true);
      setApiToken("");
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisconnect = async () => {
    setError(null);
    try {
      const response = await fetch("/api/crew/settings", { method: "DELETE" });
      if (!response.ok) throw new Error("Failed to disconnect");
      setIsConnected(false);
      setHasStoredToken(false);
      setBaseUrl("");
      setApiToken("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect");
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <svg
              className="w-6 h-6 text-indigo-500"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Crew Integration
            </h2>
            <p className="text-sm text-gray-500">Loading...</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-indigo-500 border-r-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
            <svg
              className="w-6 h-6 text-indigo-500"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Crew Integration
            </h2>
            <p className="text-sm text-gray-500">
              Create tasks from emails directly in Crew
            </p>
          </div>
        </div>
        {isConnected && (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
            <span className="w-2 h-2 bg-green-500 rounded-full"></span>
            Connected
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {saveSuccess && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm flex items-center gap-2">
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
              d="M5 13l4 4L19 7"
            />
          </svg>
          Settings saved successfully
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Crew URL
          </label>
          <input
            type="url"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="https://crew.example.com"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            The base URL of your Crew instance
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            API Key
          </label>
          <input
            type="password"
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
            placeholder={hasStoredToken ? "••••••••" : "Paste API key"}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <p className="text-xs text-gray-500 mt-1">
            The value of <code className="text-xs bg-gray-100 px-1 rounded">CREW_API_KEY</code> set in your Crew instance
          </p>
        </div>

        <div className="pt-2 flex gap-2">
          <button
            onClick={handleSave}
            disabled={isSaving || !baseUrl}
            className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? "Saving..." : hasStoredToken ? "Update" : "Connect"}
          </button>
          {isConnected && (
            <button
              onClick={handleDisconnect}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
