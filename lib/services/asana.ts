const ASANA_API_BASE = "https://app.asana.com/api/1.0";

interface AsanaWorkspace {
  gid: string;
  name: string;
}

interface AsanaProject {
  gid: string;
  name: string;
}

interface AsanaTask {
  gid: string;
  name: string;
  permalink_url: string;
}

interface AsanaApiResponse<T> {
  data: T;
}

async function asanaFetch<T>(
  accessToken: string,
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${ASANA_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Asana API error (${response.status}):`, error);
    throw new Error(`Asana API error: ${error}`);
  }

  const json: AsanaApiResponse<T> = await response.json();
  return json.data;
}

export async function getWorkspaces(
  accessToken: string
): Promise<AsanaWorkspace[]> {
  return asanaFetch<AsanaWorkspace[]>(accessToken, "/workspaces");
}

export async function getProjects(
  accessToken: string,
  workspaceGid: string
): Promise<AsanaProject[]> {
  return asanaFetch<AsanaProject[]>(
    accessToken,
    `/workspaces/${workspaceGid}/projects?opt_fields=name`
  );
}

export interface CreateTaskParams {
  name: string;
  notes?: string;
  projectGid?: string;
  workspaceGid: string;
  dueOn?: string; // YYYY-MM-DD format
  assigneeGid?: string; // Asana user GID to assign task to
}

export async function createTask(
  accessToken: string,
  params: CreateTaskParams
): Promise<AsanaTask> {
  const requestBody: {
    data: {
      name: string;
      notes?: string;
      workspace: string;
      projects?: string[];
      due_on?: string;
      assignee?: string;
    };
  } = {
    data: {
      name: params.name,
      workspace: params.workspaceGid,
    },
  };

  if (params.notes) {
    requestBody.data.notes = params.notes;
  }

  if (params.projectGid) {
    requestBody.data.projects = [params.projectGid];
  }

  if (params.dueOn) {
    requestBody.data.due_on = params.dueOn;
  }

  if (params.assigneeGid) {
    requestBody.data.assignee = params.assigneeGid;
  }

  return asanaFetch<AsanaTask>(accessToken, "/tasks", {
    method: "POST",
    body: JSON.stringify(requestBody),
  });
}

export async function getTask(
  accessToken: string,
  taskGid: string
): Promise<AsanaTask> {
  return asanaFetch<AsanaTask>(
    accessToken,
    `/tasks/${taskGid}?opt_fields=name,permalink_url`
  );
}

interface AsanaUser {
  gid: string;
  name: string;
  email: string;
}

export async function getCurrentUser(
  accessToken: string
): Promise<AsanaUser> {
  return asanaFetch<AsanaUser>(
    accessToken,
    "/users/me?opt_fields=gid,name,email"
  );
}
