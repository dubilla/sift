import { auth } from "@/auth";
import { db } from "@/db";
import { emails } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
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
    const { emailId } = body;

    if (!emailId) {
      return NextResponse.json(
        { error: "emailId is required" },
        { status: 400 }
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

    const gmailToken = await getValidAccessTokenForProvider(
      session.user.id,
      "google"
    );
    const fullEmail = await getFullEmail(gmailToken, email.externalId);
    const extracted = extractUrlsFromEmail(
      fullEmail.bodyHtml,
      fullEmail.bodyText
    );

    return NextResponse.json({
      urls: extracted.urls,
      primaryUrl: extracted.primaryUrl,
    });
  } catch (error) {
    console.error("Error in POST /api/reader/extract-urls:", error);
    return NextResponse.json(
      { error: "Failed to extract URLs" },
      { status: 500 }
    );
  }
}
