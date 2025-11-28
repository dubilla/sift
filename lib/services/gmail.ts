import { google } from "googleapis";

/**
 * Parse List-Unsubscribe header and extract unsubscribe URL
 * Format: <https://example.com/unsubscribe>, <mailto:unsub@example.com>
 * Preference: https > mailto
 */
export function parseListUnsubscribe(header: string): {
  hasUnsubscribe: boolean;
  url: string | null;
} {
  if (!header) {
    return { hasUnsubscribe: false, url: null };
  }

  // Extract URLs wrapped in angle brackets
  const urlMatches = header.match(/<([^>]+)>/g);
  if (!urlMatches) {
    return { hasUnsubscribe: false, url: null };
  }

  // Extract URLs and prefer https over mailto
  const urls = urlMatches.map((match) => match.slice(1, -1)); // Remove < >
  const httpsUrl = urls.find((url) => url.startsWith("https://") || url.startsWith("http://"));
  const mailtoUrl = urls.find((url) => url.startsWith("mailto:"));

  const url = httpsUrl || mailtoUrl || null;

  return {
    hasUnsubscribe: !!url,
    url,
  };
}

export async function getGmailClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
  });

  return google.gmail({ version: "v1", auth: oauth2Client });
}

export async function getUnarchivedEmailCount(accessToken: string) {
  try {
    const gmail = await getGmailClient(accessToken);

    const response = await gmail.users.messages.list({
      userId: "me",
      q: "in:inbox",
      maxResults: 1,
    });

    return response.data.resultSizeEstimate || 0;
  } catch (error) {
    console.error("Error fetching unarchived email count:", error);
    throw error;
  }
}

export async function getUnarchivedEmails(
  accessToken: string,
  maxResults: number = 100,
  pageToken?: string
) {
  try {
    const gmail = await getGmailClient(accessToken);

    const response = await gmail.users.messages.list({
      userId: "me",
      q: "in:inbox",
      maxResults,
      pageToken,
    });

    if (!response.data.messages) {
      return {
        emails: [],
        nextPageToken: undefined,
        resultSizeEstimate: response.data.resultSizeEstimate || 0,
      };
    }

    const emails = await Promise.all(
      response.data.messages.map(async (message) => {
        const emailData = await gmail.users.messages.get({
          userId: "me",
          id: message.id!,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date", "To", "List-Unsubscribe"],
        });

        const headers = emailData.data.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name === name)?.value || "";

        // Parse List-Unsubscribe header
        const listUnsubscribe = getHeader("List-Unsubscribe");
        const unsubscribeData = parseListUnsubscribe(listUnsubscribe);

        return {
          id: emailData.data.id!,
          threadId: emailData.data.threadId!,
          subject: getHeader("Subject"),
          from: getHeader("From"),
          to: getHeader("To"),
          date: new Date(parseInt(emailData.data.internalDate || "0")),
          snippet: emailData.data.snippet || "",
          hasUnsubscribe: unsubscribeData.hasUnsubscribe,
          unsubscribeUrl: unsubscribeData.url,
        };
      })
    );

    return {
      emails,
      nextPageToken: response.data.nextPageToken,
      resultSizeEstimate: response.data.resultSizeEstimate || 0,
    };
  } catch (error) {
    console.error("Error fetching unarchived emails:", error);
    throw error;
  }
}

export async function getFullEmail(accessToken: string, emailId: string) {
  try {
    const gmail = await getGmailClient(accessToken);

    const emailData = await gmail.users.messages.get({
      userId: "me",
      id: emailId,
      format: "full",
    });

    const headers = emailData.data.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name === name)?.value || "";

    // Extract email body (HTML or plain text)
    const getBody = (payload: any): { html: string; text: string } => {
      let html = "";
      let text = "";

      if (payload.parts) {
        // Multipart email
        for (const part of payload.parts) {
          if (part.mimeType === "text/html" && part.body?.data) {
            html = Buffer.from(part.body.data, "base64").toString("utf-8");
          } else if (part.mimeType === "text/plain" && part.body?.data) {
            text = Buffer.from(part.body.data, "base64").toString("utf-8");
          } else if (part.parts) {
            // Nested parts (e.g., multipart/alternative)
            const nested = getBody(part);
            if (!html) html = nested.html;
            if (!text) text = nested.text;
          }
        }
      } else if (payload.body?.data) {
        // Single part email
        const body = Buffer.from(payload.body.data, "base64").toString("utf-8");
        if (payload.mimeType === "text/html") {
          html = body;
        } else {
          text = body;
        }
      }

      return { html, text };
    };

    const { html, text } = getBody(emailData.data.payload);

    return {
      id: emailData.data.id!,
      threadId: emailData.data.threadId!,
      subject: getHeader("Subject"),
      from: getHeader("From"),
      to: getHeader("To"),
      date: new Date(parseInt(emailData.data.internalDate || "0")),
      snippet: emailData.data.snippet || "",
      bodyHtml: html,
      bodyText: text,
    };
  } catch (error) {
    console.error("Error fetching full email:", error);
    throw error;
  }
}

export async function archiveEmail(accessToken: string, emailId: string) {
  try {
    const gmail = await getGmailClient(accessToken);

    await gmail.users.messages.modify({
      userId: "me",
      id: emailId,
      requestBody: {
        removeLabelIds: ["INBOX"],
      },
    });

    return true;
  } catch (error) {
    console.error("Error archiving email:", error);
    throw error;
  }
}
