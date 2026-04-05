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

/**
 * Check if email address appears to be a noreply/automated sender
 */
export function isNoreplyAddress(from: string): boolean {
  const lowerFrom = from.toLowerCase();
  return (
    lowerFrom.includes("noreply") ||
    lowerFrom.includes("no-reply") ||
    lowerFrom.includes("donotreply") ||
    lowerFrom.includes("do-not-reply") ||
    lowerFrom.includes("notifications@") ||
    lowerFrom.includes("notification@") ||
    lowerFrom.includes("mailer-daemon") ||
    lowerFrom.includes("postmaster@")
  );
}

/**
 * Count recipients from To header
 * Format: "Name <email@example.com>, Name2 <email2@example.com>"
 */
export function countRecipients(toHeader: string): number {
  if (!toHeader) return 1;
  // Count email addresses by looking for @ symbols or comma-separated entries
  const emails = toHeader.split(",").filter((s) => s.trim().length > 0);
  return Math.max(1, emails.length);
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

async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  delayMs: number,
  processor: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(processor));
    results.push(...batchResults);

    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

export async function getUnarchivedEmails(
  accessToken: string,
  maxResults: number = 100,
  pageToken?: string,
  afterDate?: Date
) {
  try {
    const gmail = await getGmailClient(accessToken);

    let query = "in:inbox";
    if (afterDate) {
      const year = afterDate.getFullYear();
      const month = String(afterDate.getMonth() + 1).padStart(2, '0');
      const day = String(afterDate.getDate()).padStart(2, '0');
      query += ` after:${year}/${month}/${day}`;
    }

    const response = await gmail.users.messages.list({
      userId: "me",
      q: query,
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

    const emails = await processBatches(
      response.data.messages,
      10,
      200,
      async (message) => {
        const emailData = await gmail.users.messages.get({
          userId: "me",
          id: message.id!,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date", "To", "List-Unsubscribe", "List-Id"],
        });

        const headers = emailData.data.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name === name)?.value || "";

        // Parse List-Unsubscribe header
        const listUnsubscribe = getHeader("List-Unsubscribe");
        const unsubscribeData = parseListUnsubscribe(listUnsubscribe);

        const from = getHeader("From");
        const to = getHeader("To");

        return {
          id: emailData.data.id!,
          threadId: emailData.data.threadId!,
          subject: getHeader("Subject"),
          from,
          to,
          date: new Date(parseInt(emailData.data.internalDate || "0")),
          snippet: emailData.data.snippet || "",
          hasUnsubscribe: unsubscribeData.hasUnsubscribe,
          unsubscribeUrl: unsubscribeData.url,
          // Smart tagging metadata
          listId: getHeader("List-Id") || null,
          isNoreply: isNoreplyAddress(from),
          recipientCount: countRecipients(to),
        };
      }
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

/**
 * Archive multiple emails via Gmail batchModify API.
 * Splits into chunks of 1000 (Gmail's limit).
 */
export async function batchArchiveEmails(accessToken: string, gmailIds: string[]) {
  const batchSize = 1000;
  for (let i = 0; i < gmailIds.length; i += batchSize) {
    const batch = gmailIds.slice(i, i + batchSize);

    const response = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/batchModify",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          ids: batch,
          removeLabelIds: ["INBOX"],
        }),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to archive emails via Gmail API");
    }
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

export async function createFilter(
  accessToken: string,
  senderEmail: string,
  applyToExisting: boolean = false
) {
  try {
    const gmail = await getGmailClient(accessToken);

    const response = await gmail.users.settings.filters.create({
      userId: "me",
      requestBody: {
        criteria: {
          from: senderEmail,
        },
        action: {
          removeLabelIds: ["INBOX"],
        },
      },
    });

    // If user wants to apply filter to existing emails, archive all from this sender
    if (applyToExisting) {
      const existingEmails = await gmail.users.messages.list({
        userId: "me",
        q: `from:${senderEmail} in:inbox`,
      });

      if (existingEmails.data.messages) {
        // Batch modify to archive existing emails from this sender
        await gmail.users.messages.batchModify({
          userId: "me",
          requestBody: {
            ids: existingEmails.data.messages.map((msg) => msg.id!),
            removeLabelIds: ["INBOX"],
          },
        });
      }
    }

    return {
      id: response.data.id,
      senderEmail,
      archived: applyToExisting
        ? (await gmail.users.messages.list({
            userId: "me",
            q: `from:${senderEmail} in:inbox`,
          })).data.messages?.length || 0
        : 0,
    };
  } catch (error) {
    console.error("Error creating filter:", error);
    throw error;
  }
}
