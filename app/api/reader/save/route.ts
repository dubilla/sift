import { auth } from "@/auth";
import { db } from "@/db";
import { readerSettings, readerSaves, activityLog, emails } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { saveUrl } from "@/lib/services/reader";
import { getValidAccessTokenForProvider } from "@/lib/services/token";
import { getFullEmail } from "@/lib/services/gmail";
import { extractUrlsFromEmail } from "@/lib/utils/url";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { emailId, url: providedUrl } = body;

    if (!emailId) {
      return NextResponse.json(
        { error: "emailId is required" },
        { status: 400 }
      );
    }

    // Get Reader API token
    const [settings] = await db
      .select()
      .from(readerSettings)
      .where(eq(readerSettings.userId, session.user.id))
      .limit(1);

    if (!settings?.apiToken) {
      return NextResponse.json(
        { error: "Reader not connected. Please add your API token in Settings." },
        { status: 403 }
      );
    }

    // Verify email belongs to user
    const [email] = await db
      .select()
      .from(emails)
      .where(
        and(
          eq(emails.id, emailId),
          eq(emails.userId, session.user.id),
          isNull(emails.deletedAt)
        )
      )
      .limit(1);

    if (!email) {
      return NextResponse.json(
        { error: "Email not found" },
        { status: 404 }
      );
    }

    let urlToSave = providedUrl;

    // If no URL provided, extract from email body
    if (!urlToSave) {
      const gmailToken = await getValidAccessTokenForProvider(
        session.user.id,
        "google"
      );
      const fullEmail = await getFullEmail(gmailToken, email.externalId);
      const extracted = extractUrlsFromEmail(
        fullEmail.bodyHtml,
        fullEmail.bodyText
      );

      if (!extracted.primaryUrl) {
        return NextResponse.json(
          { error: "No URL found in this email", urls: [] },
          { status: 404 }
        );
      }

      urlToSave = extracted.primaryUrl;
    }

    // Save to Reader
    const result = await saveUrl(settings.apiToken, urlToSave);

    // Store the save in our database
    await db.insert(readerSaves).values({
      userId: session.user.id,
      emailId,
      url: urlToSave,
      readerDocumentId: result.id || null,
    });

    // Log activity
    await db.insert(activityLog).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      action: "send_to_reader",
      emailId,
    });

    return NextResponse.json({
      success: true,
      url: urlToSave,
      readerUrl: result.url || null,
    });
  } catch (error) {
    console.error("Error in POST /api/reader/save:", error);

    if (error instanceof Error && error.message.includes("Reader API error")) {
      return NextResponse.json(
        { error: "Failed to save to Reader. Please check your API token." },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { error: "Failed to save to Reader" },
      { status: 500 }
    );
  }
}
