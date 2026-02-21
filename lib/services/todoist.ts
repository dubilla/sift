const TODOIST_API_BASE = "https://api.todoist.com/rest/v2";

export interface TodoistProject {
  id: string;
  name: string;
}

export interface TodoistTask {
  id: string;
  content: string;
  url: string;
}

async function todoistFetch<T>(
  accessToken: string,
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${TODOIST_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Todoist API error (${response.status}):`, error);
    throw new Error(`Todoist API error: ${error}`);
  }

  return response.json();
}

export async function getProjects(
  accessToken: string
): Promise<TodoistProject[]> {
  return todoistFetch<TodoistProject[]>(accessToken, "/projects");
}

export interface CreateTaskParams {
  content: string;
  description?: string;
  projectId?: string;
  dueDate?: string; // YYYY-MM-DD format
}

export async function createTask(
  accessToken: string,
  params: CreateTaskParams
): Promise<TodoistTask> {
  const requestBody: Record<string, string | undefined> = {
    content: params.content,
  };

  if (params.description) {
    requestBody.description = params.description;
  }

  if (params.projectId) {
    requestBody.project_id = params.projectId;
  }

  if (params.dueDate) {
    requestBody.due_date = params.dueDate;
  }

  return todoistFetch<TodoistTask>(accessToken, "/tasks", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
}
