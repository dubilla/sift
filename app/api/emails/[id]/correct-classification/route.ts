import { auth } from "@/auth";
import { db } from "@/db";
import { emails, emailTags, tags, classificationCorrections } from "@/db/schema";
import { NextResponse } from "next/server";
import { eq, and, ne, isNull } from "drizzle-orm";
import { areSimilar, extractEmailAddress, SIMILARITY_THRESHOLD } from "@/lib/services/similarity";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: emailId } = await params;
    const body = await request.json();
    const { newTagId, reason, applyToSimilarIds } = body;

    if (!newTagId) {
      return NextResponse.json(
        { error: "newTagId is required" },
        { status: 400 }
      );
    }

    // Fetch the email to verify ownership
    const [email] = await db
      .select()
      .from(emails)
      .where(and(eq(emails.id, emailId), eq(emails.userId, session.user.id)))
      .limit(1);

    if (!email) {
      return NextResponse.json(
        { error: "Email not found" },
        { status: 404 }
      );
    }

    // Fetch the new tag to verify it exists
    const [newTag] = await db
      .select()
      .from(tags)
      .where(eq(tags.id, newTagId))
      .limit(1);

    if (!newTag) {
      return NextResponse.json({ error: "Tag not found" }, { status: 404 });
    }

    // Get current classification (if any)
    const currentClassifications = await db
      .select({
        tagId: emailTags.tagId,
        source: emailTags.source,
        confidence: emailTags.confidence,
      })
      .from(emailTags)
      .where(eq(emailTags.emailId, emailId));

    const currentClassification = currentClassifications[0] || null;

    // Delete old classification(s) if they exist
    if (currentClassifications.length > 0) {
      await db.delete(emailTags).where(eq(emailTags.emailId, emailId));
    }

    // Insert new classification with source='user' and confidence=1.0
    await db.insert(emailTags).values({
      id: crypto.randomUUID(),
      emailId: emailId,
      tagId: newTagId,
      source: "user",
      confidence: 1.0,
    });

    // Store correction context (email metadata snapshot)
    const correctionContext = {
      from: email.from,
      subject: email.subject,
      snippet: email.snippet,
      listId: email.listId,
      isNoreply: email.isNoreply,
      recipientCount: email.recipientCount,
      hasUnsubscribe: email.hasUnsubscribe,
    };

    // Insert correction record
    await db.insert(classificationCorrections).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      emailId: emailId,
      oldTagId: currentClassification?.tagId || null,
      newTagId: newTagId,
      oldSource: currentClassification?.source || null,
      oldConfidence: currentClassification?.confidence || null,
      appliedToSimilar: false,
      correctionContext: correctionContext,
    });

    // If applying to similar emails, do that now
    if (applyToSimilarIds && Array.isArray(applyToSimilarIds) && applyToSimilarIds.length > 0) {
      // Verify all IDs belong to the user
      const similarEmails = await db
        .select()
        .from(emails)
        .where(
          and(
            eq(emails.userId, session.user.id),
            ne(emails.id, emailId) // Exclude the original email
          )
        );

      const validIds = new Set(similarEmails.map(e => e.id));
      const idsToUpdate = applyToSimilarIds.filter(id => validIds.has(id));

      // Apply correction to each similar email
      for (const similarEmailId of idsToUpdate) {
        const similarEmail = similarEmails.find(e => e.id === similarEmailId);
        if (!similarEmail) continue;

        // Get current classification
        const currentTags = await db
          .select()
          .from(emailTags)
          .where(eq(emailTags.emailId, similarEmailId));

        const oldTag = currentTags[0] || null;

        // Delete old classification
        if (currentTags.length > 0) {
          await db.delete(emailTags).where(eq(emailTags.emailId, similarEmailId));
        }

        // Insert new classification
        await db.insert(emailTags).values({
          id: crypto.randomUUID(),
          emailId: similarEmailId,
          tagId: newTagId,
          source: "pattern", // Mark as pattern-learned
          confidence: 0.9, // High confidence from user correction
        });

        // Store correction record
        await db.insert(classificationCorrections).values({
          id: crypto.randomUUID(),
          userId: session.user.id,
          emailId: similarEmailId,
          oldTagId: oldTag?.tagId || null,
          newTagId: newTagId,
          oldSource: oldTag?.source || null,
          oldConfidence: oldTag?.confidence || null,
          appliedToSimilar: true, // Mark as auto-applied
          correctionContext: {
            from: similarEmail.from,
            subject: similarEmail.subject,
            snippet: similarEmail.snippet,
            listId: similarEmail.listId,
            isNoreply: similarEmail.isNoreply,
            recipientCount: similarEmail.recipientCount,
            hasUnsubscribe: similarEmail.hasUnsubscribe,
          },
        });
      }

      return NextResponse.json({
        success: true,
        message: `Classification corrected successfully and applied to ${idsToUpdate.length} similar emails`,
        appliedCount: idsToUpdate.length,
      });
    }

    // Find similar emails to suggest for bulk correction
    const senderEmail = extractEmailAddress(email.from);

    // Get other unarchived emails from the same sender
    const candidateEmails = await db
      .select({
        id: emails.id,
        subject: emails.subject,
        from: emails.from,
        snippet: emails.snippet,
        date: emails.date,
        listId: emails.listId,
        isNoreply: emails.isNoreply,
        hasUnsubscribe: emails.hasUnsubscribe,
        currentTagId: emailTags.tagId,
        currentTagName: tags.name,
        currentTagDisplayName: tags.displayName,
        currentTagIcon: tags.icon,
      })
      .from(emails)
      .leftJoin(emailTags, eq(emails.id, emailTags.emailId))
      .leftJoin(tags, eq(emailTags.tagId, tags.id))
      .where(
        and(
          eq(emails.userId, session.user.id),
          ne(emails.id, emailId), // Exclude the email we just corrected
          isNull(emails.archivedAt),
          isNull(emails.deletedAt)
        )
      )
      .limit(200); // Limit candidates for performance

    // Filter by similarity
    const similarEmails = candidateEmails.filter(candidate => {
      const candidateMetadata = {
        from: candidate.from,
        subject: candidate.subject,
        listId: candidate.listId,
        isNoreply: candidate.isNoreply,
        hasUnsubscribe: candidate.hasUnsubscribe,
      };

      const correctedMetadata = {
        from: email.from,
        subject: email.subject,
        listId: email.listId,
        isNoreply: email.isNoreply,
        hasUnsubscribe: email.hasUnsubscribe,
      };

      return areSimilar(candidateMetadata, correctedMetadata, SIMILARITY_THRESHOLD.HIGH);
    }).map(e => ({
      id: e.id,
      subject: e.subject,
      from: e.from,
      snippet: e.snippet,
      date: e.date?.toISOString(),
      currentTag: e.currentTagId ? {
        id: e.currentTagId,
        name: e.currentTagName!,
        displayName: e.currentTagDisplayName!,
        icon: e.currentTagIcon,
      } : null,
    }));

    return NextResponse.json({
      success: true,
      message: "Classification corrected successfully",
      similarEmails: similarEmails.slice(0, 50), // Limit to 50 for UX
      similarCount: similarEmails.length,
    });
  } catch (error) {
    console.error("Error correcting classification:", error);
    return NextResponse.json(
      { error: "Failed to correct classification" },
      { status: 500 }
    );
  }
}
