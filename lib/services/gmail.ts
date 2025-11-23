import { google } from "googleapis";

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
  maxResults: number = 100
) {
  try {
    const gmail = await getGmailClient(accessToken);

    const response = await gmail.users.messages.list({
      userId: "me",
      q: "in:inbox",
      maxResults,
    });

    if (!response.data.messages) {
      return [];
    }

    const emails = await Promise.all(
      response.data.messages.map(async (message) => {
        const emailData = await gmail.users.messages.get({
          userId: "me",
          id: message.id!,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date", "To"],
        });

        const headers = emailData.data.payload?.headers || [];
        const getHeader = (name: string) =>
          headers.find((h) => h.name === name)?.value || "";

        return {
          id: emailData.data.id!,
          threadId: emailData.data.threadId!,
          subject: getHeader("Subject"),
          from: getHeader("From"),
          to: getHeader("To"),
          date: new Date(parseInt(emailData.data.internalDate || "0")),
          snippet: emailData.data.snippet || "",
        };
      })
    );

    return emails;
  } catch (error) {
    console.error("Error fetching unarchived emails:", error);
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
