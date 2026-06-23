import { auth } from "@/auth";
import { db } from "@/db";
import { emails } from "@/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { getValidAccessTokenForProvider } from "@/lib/services/token";
import { getFullEmail } from "@/lib/services/gmail";
import { reauthErrorResponse } from "@/lib/api/token-error";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const emailId = params.id;

    // Get email from database to verify ownership and get external ID
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

    // Fetch full email from Gmail
    const accessToken = await getValidAccessTokenForProvider(
      session.user.id,
      "google"
    );

    const fullEmail = await getFullEmail(accessToken, email.externalId);

    return NextResponse.json({
      id: email.id,
      subject: email.subject,
      from: email.from,
      to: email.to,
      date: email.date?.toISOString(),
      snippet: email.snippet,
      bodyText: fullEmail.bodyText,
      bodyHtml: fullEmail.bodyHtml,
    });
  } catch (error) {
    console.error("Error in /api/emails/[id]:", error);
    const reauth = reauthErrorResponse(error);
    if (reauth) return reauth;
    return NextResponse.json(
      { error: "Failed to fetch email" },
      { status: 500 }
    );
  }
}
