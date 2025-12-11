"use client";

import { useState, useEffect, useCallback } from "react";

interface Workspace {
  gid: string;
  name: string;
}

interface Project {
  gid: string;
  name: string;
}

interface Settings {
  defaultWorkspaceGid: string | null;
  defaultWorkspaceName: string | null;
  defaultProjectGid: string | null;
  defaultProjectName: string | null;
}

export default function AsanaSettings() {
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("");
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    try {
      const response = await fetch("/api/asana/settings");
      if (response.ok) {
        const data = await response.json();
        if (data.settings) {
          const settings: Settings = data.settings;
          if (settings.defaultWorkspaceGid) {
            setSelectedWorkspace(settings.defaultWorkspaceGid);
          }
          if (settings.defaultProjectGid) {
            setSelectedProject(settings.defaultProjectGid);
          }
        }
      }
    } catch (err) {
      console.error("Error loading settings:", err);
    }
  }, []);

  const loadWorkspaces = useCallback(async () => {
    try {
      const response = await fetch("/api/asana/workspaces");
      if (!response.ok) {
        if (response.status === 403) {
          setIsConnected(false);
          return;
        }
        throw new Error("Failed to fetch workspaces");
      }
      const data = await response.json();
      setWorkspaces(data.workspaces);
      setIsConnected(true);
    } catch (err) {
      console.error("Error loading workspaces:", err);
      setError("Failed to load Asana workspaces");
    }
  }, []);

  const loadProjects = useCallback(async (workspaceGid: string) => {
    if (!workspaceGid) {
      setProjects([]);
      return;
    }
    try {
      const response = await fetch(
        `/api/asana/projects?workspaceGid=${workspaceGid}`
      );
      if (!response.ok) {
        throw new Error("Failed to fetch projects");
      }
      const data = await response.json();
      setProjects(data.projects);
    } catch (err) {
      console.error("Error loading projects:", err);
      setProjects([]);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      try {
        const statusResponse = await fetch("/api/asana/status");
        const statusData = await statusResponse.json();

        if (statusData.connected) {
          setIsConnected(true);
          await Promise.all([loadWorkspaces(), loadSettings()]);
        } else {
          setIsConnected(false);
        }
      } catch (err) {
        console.error("Error initializing:", err);
        setError("Failed to load Asana status");
      }
      setIsLoading(false);
    };

    init();
  }, [loadWorkspaces, loadSettings]);

  useEffect(() => {
    if (selectedWorkspace) {
      loadProjects(selectedWorkspace);
    }
  }, [selectedWorkspace, loadProjects]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    setError(null);

    try {
      const selectedWorkspaceObj = workspaces.find(
        (w) => w.gid === selectedWorkspace
      );
      const selectedProjectObj = projects.find(
        (p) => p.gid === selectedProject
      );

      const response = await fetch("/api/asana/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          defaultWorkspaceGid: selectedWorkspace || null,
          defaultWorkspaceName: selectedWorkspaceObj?.name || null,
          defaultProjectGid: selectedProject || null,
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

  const handleConnectAsana = () => {
    window.location.href = "/api/auth/signin?callbackUrl=/settings";
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
            <svg
              className="w-6 h-6 text-orange-500"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm0 4.5a3 3 0 110 6 3 3 0 010-6zm-5.5 9a3 3 0 110 6 3 3 0 010-6zm11 0a3 3 0 110 6 3 3 0 010-6z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Asana Integration
            </h2>
            <p className="text-sm text-gray-500">Loading...</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-orange-500 border-r-transparent"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-orange-100 rounded-lg flex items-center justify-center">
            <svg
              className="w-6 h-6 text-orange-500"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm0 4.5a3 3 0 110 6 3 3 0 010-6zm-5.5 9a3 3 0 110 6 3 3 0 010-6zm11 0a3 3 0 110 6 3 3 0 010-6z" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              Asana Integration
            </h2>
            <p className="text-sm text-gray-500">
              Create tasks from emails directly in Asana
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
            Connect your Asana account to create tasks from emails.
          </p>
          <button
            onClick={handleConnectAsana}
            className="inline-flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm0 4.5a3 3 0 110 6 3 3 0 010-6zm-5.5 9a3 3 0 110 6 3 3 0 010-6zm11 0a3 3 0 110 6 3 3 0 010-6z" />
            </svg>
            Connect Asana
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Workspace
            </label>
            <select
              value={selectedWorkspace}
              onChange={(e) => {
                setSelectedWorkspace(e.target.value);
                setSelectedProject("");
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
            >
              <option value="">Select a workspace</option>
              {workspaces.map((workspace) => (
                <option key={workspace.gid} value={workspace.gid}>
                  {workspace.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-500 mt-1">
              This workspace will be pre-selected when creating tasks
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Default Project
            </label>
            <select
              value={selectedProject}
              onChange={(e) => setSelectedProject(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
              disabled={!selectedWorkspace}
            >
              <option value="">No default project</option>
              {projects.map((project) => (
                <option key={project.gid} value={project.gid}>
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
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSaving ? "Saving..." : "Save Settings"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
