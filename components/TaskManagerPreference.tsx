"use client";

import { useState, useEffect } from "react";

interface TaskManagerPreferenceProps {
  onChange?: (taskManager: string) => void;
}

export default function TaskManagerPreference({ onChange }: TaskManagerPreferenceProps) {
  const [taskManager, setTaskManager] = useState<string>("asana");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await fetch("/api/user-settings");
        if (response.ok) {
          const data = await response.json();
          if (data.settings?.taskManager) {
            setTaskManager(data.settings.taskManager);
          }
        }
      } catch (err) {
        console.error("Error loading user settings:", err);
      }
      setIsLoading(false);
    };

    loadSettings();
  }, []);

  const handleChange = async (value: string) => {
    setTaskManager(value);
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const response = await fetch("/api/user-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskManager: value }),
      });

      if (response.ok) {
        setSaveSuccess(true);
        onChange?.(value);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err) {
      console.error("Error saving user settings:", err);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Task Manager</h2>
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Task Manager</h2>
        <p className="text-sm text-gray-500">
          Choose which task manager to use when creating tasks from emails
        </p>
      </div>

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
          Preference saved
        </div>
      )}

      <div className="flex gap-3">
        <button
          onClick={() => handleChange("asana")}
          disabled={isSaving}
          className={`flex-1 flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
            taskManager === "asana"
              ? "border-orange-500 bg-orange-50"
              : "border-gray-200 hover:border-gray-300"
          } ${isSaving ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            taskManager === "asana" ? "bg-orange-100" : "bg-gray-100"
          }`}>
            <svg
              className={`w-5 h-5 ${taskManager === "asana" ? "text-orange-500" : "text-gray-400"}`}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm0 4.5a3 3 0 110 6 3 3 0 010-6zm-5.5 9a3 3 0 110 6 3 3 0 010-6zm11 0a3 3 0 110 6 3 3 0 010-6z" />
            </svg>
          </div>
          <div className="text-left">
            <p className={`font-medium ${taskManager === "asana" ? "text-orange-900" : "text-gray-700"}`}>
              Asana
            </p>
            <p className="text-xs text-gray-500">
              Create tasks in Asana
            </p>
          </div>
        </button>

        <button
          onClick={() => handleChange("todoist")}
          disabled={isSaving}
          className={`flex-1 flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
            taskManager === "todoist"
              ? "border-red-500 bg-red-50"
              : "border-gray-200 hover:border-gray-300"
          } ${isSaving ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            taskManager === "todoist" ? "bg-red-100" : "bg-gray-100"
          }`}>
            <svg
              className={`w-5 h-5 ${taskManager === "todoist" ? "text-red-500" : "text-gray-400"}`}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M21 3H3v18h18V3zm-2.5 7.5l-5.25 3-5.25-3V8l5.25 3 5.25-3v2.5z" />
            </svg>
          </div>
          <div className="text-left">
            <p className={`font-medium ${taskManager === "todoist" ? "text-red-900" : "text-gray-700"}`}>
              Todoist
            </p>
            <p className="text-xs text-gray-500">
              Create tasks in Todoist
            </p>
          </div>
        </button>

        <button
          onClick={() => handleChange("crew")}
          disabled={isSaving}
          className={`flex-1 flex items-center gap-3 p-4 rounded-lg border-2 transition-all ${
            taskManager === "crew"
              ? "border-indigo-500 bg-indigo-50"
              : "border-gray-200 hover:border-gray-300"
          } ${isSaving ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        >
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            taskManager === "crew" ? "bg-indigo-100" : "bg-gray-100"
          }`}>
            <svg
              className={`w-5 h-5 ${taskManager === "crew" ? "text-indigo-500" : "text-gray-400"}`}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
            </svg>
          </div>
          <div className="text-left">
            <p className={`font-medium ${taskManager === "crew" ? "text-indigo-900" : "text-gray-700"}`}>
              Crew
            </p>
            <p className="text-xs text-gray-500">
              Create tasks in Crew
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
