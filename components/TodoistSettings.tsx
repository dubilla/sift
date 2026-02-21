"use client";

import { useState, useEffect, useCallback } from "react";

interface TodoistProject {
  id: string;
  name: string;
}

interface Settings {
  defaultProjectId: string | null;
  defaultProjectName: string | null;
}

export default function TodoistSettings() {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [projects, setProjects] = useState<TodoistProject[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const response = await fetch("/api/todoist/settings");
      if (response.ok) {
        const data = await response.json();
        if (data.settings) {
          const settings: Settings = data.settings;
          if (settings.defaultProjectId) {
            setSelectedProject(settings.defaultProjectId);
          }
        }
      }
    } catch (err) {
      console.error("Error loading settings:", err);
    }
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const response = await fetch("/api/todoist/projects");
      if (!response.ok) {
        if (response.status === 403) {
          setIsConnected(false);
          return;
        }
        throw new Error("Failed to fetch projects");
      }
      const data = await response.json();
      setProjects(data.projects);
      setIsConnected(true);
    } catch (err) {
      console.error("Error loading projects:", err);
      setError("Failed to load Todoist projects");
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        const statusResponse = await fetch("/api/todoist/status");
        const statusData = await statusResponse.json();

        if (statusData.connected) {
          setIsConnected(true);
          await Promise.all([loadProjects(), loadSettings()]);
        } else {
          setIsConnected(false);
        }
      } catch (err) {
        console.error("Error initializing:", err);
        setError("Failed to load Todoist status");
      }
      setIsLoading(false);
    };

    init();
  }, [loadProjects, loadSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    setError(null);

    try {
      const selectedProjectObj = projects.find(
        (p) => p.id === selectedProject
      );

      const response = await fetch("/api/todoist/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultProjectId: selectedProject || null,
          defaultProjectName: selectedProjectObj?.name || null,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save settings");
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setIsSaving(false);
    }
  };

  const handleConnectTodoist = () => {
    window.location.href = "/api/auth/signin?callbackUrl=/settings";
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
            <svg
              className="w-6 h-6 text-red-500"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M21 3H3v18h18V3zm-2.5 7.5l-5.25 3-5.25-3V8l5.25 3 5.25-3v2.5z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Todoist Integration
            </h2>
            <p className="text-sm text-gray-500">Loading...</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-red-500 border-r-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
            <svg
              className="w-6 h-6 text-red-500"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M21 3H3v18h18V3zm-2.5 7.5l-5.25 3-5.25-3V8l5.25 3 5.25-3v2.5z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Todoist Integration
            </h2>
            <p className="text-sm text-gray-500">
              Create tasks from emails directly in Todoist
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

      {!isConnected ? (
        <div className="text-center py-8">
          <p className="text-gray-600 mb-4">
            Connect your Todoist account to create tasks from emails.
          </p>
          <button
            onClick={handleConnectTodoist}
            className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21 3H3v18h18V3zm-2.5 7.5l-5.25 3-5.25-3V8l5.25 3 5.25-3v2.5z" />
            </svg>
            Connect Todoist
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Project
            </label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
            >
              <option value="">Inbox (default)</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              This project will be pre-selected when creating tasks
            </p>
          </div>

          <div className="pt-4">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
