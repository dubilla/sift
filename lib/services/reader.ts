const READER_API_BASE = "https://readwise.io/api/v3";

export interface ReaderSaveResult {
  id: string;
  url: string;
}

async function readerFetch<T>(
  accessToken: string,
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const response = await fetch(`${READER_API_BASE}${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Token ${accessToken}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Reader API error (${response.status}):`, error);
    throw new Error(`Reader API error: ${error}`);
  }

  return response.json();
}

export async function saveUrl(
  accessToken: string,
  url: string
): Promise<ReaderSaveResult> {
  return readerFetch<ReaderSaveResult>(accessToken, "/save/", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export async function verifyToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(`${READER_API_BASE}/list/`, {
      method: "GET",
      headers: {
        Authorization: `Token ${accessToken}`,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}
