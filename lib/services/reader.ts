const READER_API_BASE = "https://readwise.io";

export interface SaveToReaderParams {
  url: string;
  html?: string;
  title?: string;
  tags?: string[];
  location?: "new" | "later" | "shortlist" | "archive" | "feed";
}

export interface SavedReaderDocument {
  id: string;
  url: string;
}

interface ReaderSaveResponse {
  id: string;
  url: string;
}

export async function saveToReader(
  accessToken: string,
  params: SaveToReaderParams
): Promise<SavedReaderDocument> {
  const response = await fetch(`${READER_API_BASE}/api/v3/save/`, {
    method: "POST",
    headers: {
      Authorization: `Token ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url: params.url,
      html: params.html,
      title: params.title,
      tags: params.tags,
      location: params.location,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Reader API error (${response.status}):`, error);
    throw new Error(`Reader API error: ${response.status}`);
  }

  const data = (await response.json()) as ReaderSaveResponse;
  return { id: data.id, url: data.url };
}

export async function validateToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch(`${READER_API_BASE}/api/v2/auth/`, {
      headers: { Authorization: `Token ${accessToken}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}
