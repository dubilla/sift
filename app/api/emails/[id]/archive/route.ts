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

    // Get valid access token (refreshes if expired)
    const accessToken = await getValidAccessToken(session.user.id);

    await archiveEmail(accessToken, existingEmail[0].externalId);

    await db
      .update(emails)
      .set({ archivedAt: new Date() })
      .where(eq(emails.id, emailId));

    await db
      .insert(activityLog)
      .values({
        id: crypto.randomUUID(),
        userId: session.user.id,
        action: "archive",
        emailId: emailId,
      });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error in /api/emails/[id]/archive:", error);
    return NextResponse.json(
      { error: "Failed to archive email" },
      { status: 500 }
    );
  }
}
