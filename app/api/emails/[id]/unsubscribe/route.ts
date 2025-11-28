import { auth } from "@/auth";
import { db } from "@/db";
import { emails, activityLog } from "@/db/schema";
import { archiveEmail } from "@/lib/services/gmail";
import { eq, and, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getValidAccessToken } from "@/lib/services/token";

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailId = params.id;

    const existingEmail = await db
      .select()
      .from(emails)
      .where(
        and(
          eq(emails.id, emailId),
          eq(emails.userId, session.user.id),
          isNull(emails.archivedAt)
        )
      )
      .limit(1);

    if (!existingEmail.length) {
      return NextResponse.json(
        { error: "Email not found or already archived" },
        { status: 404 }
      );
    }

    const email = existingEmail[0];

    if (!email.hasUnsubscribe || !email.unsubscribeUrl) {
      return NextResponse.json(
        { error: "Email does not have unsubscribe information" },
        { status: 400 }
      );
    }

    // Handle different unsubscribe methods
    if (email.unsubscribeUrl.startsWith("mailto:")) {
      // For mailto links, return the URL to the client to open
      return NextResponse.json({
        success: false,
        requiresMailto: true,
        mailtoUrl: email.unsubscribeUrl,
      });
    } else if (
      email.unsubscribeUrl.startsWith("https://") ||
      email.unsubscribeUrl.startsWith("http://")
    ) {
      // Make HTTP request to unsubscribe
      try {
        const unsubscribeResponse = await fetch(email.unsubscribeUrl, {
          method: "GET",
          redirect: "follow",
        });

        if (!unsubscribeResponse.ok) {
          console.error(
            "Unsubscribe request failed:",
            unsubscribeResponse.status
          );
          return NextResponse.json(
            { error: "Failed to unsubscribe" },
            { status: 500 }
          );
        }
      } catch (error) {
        console.error("Error making unsubscribe request:", error);
        return NextResponse.json(
          { error: "Failed to unsubscribe" },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json(
        { error: "Unsupported unsubscribe URL format" },
        { status: 400 }
      );
    }

    // Get valid access token (refreshes if expired)
    const accessToken = await getValidAccessToken(session.user.id);

    // Archive the email in Gmail
    await archiveEmail(accessToken, email.externalId);

    // Update database
    await db
      .update(emails)
      .set({ archivedAt: new Date() })
      .where(eq(emails.id, emailId));

    // Log activity
    await db.insert(activityLog).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      action: "unsubscribe",
      emailId: emailId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in /api/emails/[id]/unsubscribe:", error);
    return NextResponse.json(
      { error: "Failed to unsubscribe" },
      { status: 500 }
    );
  }
}
