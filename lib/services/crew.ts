export interface CrewTask {
  id: string;
  url: string;
  title: string;
}

export interface CreateTaskParams {
  title: string;
  description?: string;
  dueDate?: string; // YYYY-MM-DD
  assignee?: "user" | "agent";
}

interface CrewApiTask {
  id: string;
  title: string;
}

export async function createTask(
  baseUrl: string,
  apiToken: string,
  params: CreateTaskParams
): Promise<CrewTask> {
  const trimmedBase = baseUrl.replace(/\/$/, "");

  const response = await fetch(`${trimmedBase}/api/v1/tasks`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: params.title,
      description: params.description,
      dueDate: params.dueDate,
      assignee: params.assignee ?? "user",
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Crew API error (${response.status}):`, error);
    throw new Error(`Crew API error: ${response.status}`);
  }

  const data = (await response.json()) as { task: CrewApiTask };

  return {
    id: data.task.id,
    url: `${trimmedBase}/tasks/${data.task.id}`,
    title: data.task.title,
  };
}

export async function ping(baseUrl: string, apiToken: string): Promise<boolean> {
  const trimmedBase = baseUrl.replace(/\/$/, "");
  try {
    const response = await fetch(`${trimmedBase}/api/v1/tasks?view=inbox`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}
