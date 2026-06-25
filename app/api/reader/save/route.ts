import { getCurrentSession } from "@/lib/mobile-auth";
import { db } from "@/db";
import { activityLog, emails, readerSettings } from "@/db/schema";
import { getFullEmail } from "@/lib/services/gmail";
import { saveToReader } from "@/lib/services/reader";
import { getValidAccessTokenForProvider } from "@/lib/services/token";
import { reauthErrorResponse } from "@/lib/api/token-error";
import { parseFromHeader } from "@/lib/utils/email";
import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function POST(request: Request) {
  try {
    const session = await getCurrentSession(request);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const emailId = typeof body.emailId === "string" ? body.emailId : "";

    if (!emailId) {
      return NextResponse.json(
        { error: "emailId is required" },
        { status: 400 }
      );
    }

    const settings = await db
      .select()
      .from(readerSettings)
      .where(eq(readerSettings.userId, session.user.id))
      .limit(1);

    if (settings.length === 0) {
      return NextResponse.json(
        { error: "Readwise Reader not connected" },
        { status: 403 }
      );
    }

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
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    const accessToken = await getValidAccessTokenForProvider(
      session.user.id,
      "google"
    );
    const fullEmail = await getFullEmail(accessToken, email.externalId);

    const { email: senderEmail } = parseFromHeader(email.from);
    const senderDomain = senderEmail.includes("@")
      ? senderEmail.split("@")[1]
      : null;

    const threadRef = email.threadId || email.externalId;
    const url = `https://mail.google.com/mail/u/0/#all/${threadRef}`;
    const html = fullEmail.bodyHtml
      ? fullEmail.bodyHtml
      : fullEmail.bodyText
        ? `<pre>${escapeHtml(fullEmail.bodyText)}</pre>`
        : undefined;
    const title = email.subject || "(no subject)";
    const tags = senderDomain ? [senderDomain] : undefined;

    const doc = await saveToReader(settings[0].accessToken, {
      url,
      html,
      title,
      tags,
      location: "new",
    });

    await db.insert(activityLog).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      action: "save_to_reader",
      emailId,
    });

    return NextResponse.json({
      success: true,
      document: { id: doc.id, url: doc.url },
    });
  } catch (error) {
    console.error("Error in /api/reader/save:", error);
    const reauth = reauthErrorResponse(error);
    if (reauth) return reauth;
    return NextResponse.json(
      { error: "Failed to save to Reader" },
      { status: 500 }
    );
  }
}
