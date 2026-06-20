/**
 * Smart email classifier service
 * Provides rule-based quick classification, pattern learning from corrections, and LLM-powered deep classification
 */

import { db } from "@/db";
import { classificationCorrections, tags } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { areSimilar, SIMILARITY_THRESHOLD } from "./similarity";

// Types live in their own module; re-exported here so existing importers of
// "@/lib/services/classifier" keep working unchanged.
export type {
  SmartTag,
  ClassificationResult,
  EmailForClassification,
} from "./classifier-types";
import type { ClassificationResult, EmailForClassification, SmartTag } from "./classifier-types";

// The LLM call (cloud vs local) is factored into its own provider module.
// Imported for use in the pipeline below, and re-exported so any caller
// importing llmClassify from here still works.
import { llmClassify } from "./llm-classifier";
export { llmClassify };

// Confidence threshold for showing tags in UI
export const CONFIDENCE_THRESHOLD = 0.7;

/**
 * Quick rule-based classification for obvious cases
 * Returns null if no confident classification can be made
 *
 * Conservative approach:
 * - Only classify when multiple strong signals align
 * - Prefer false negatives over false positives
 * - Let LLM handle ambiguous cases
 */
export function quickClassify(email: EmailForClassification): ClassificationResult | null {
  const { subject, from, snippet, hasUnsubscribe, listId, isNoreply, recipientCount } = email;
  const lowerFrom = from.toLowerCase();
  const lowerSubject = (subject || "").toLowerCase();
  const lowerSnippet = (snippet || "").toLowerCase();

  // === ARCHIVABLE: High-confidence automated notifications ===

  // Transactional receipts/confirmations from known patterns
  if (isNoreply && (
    lowerSubject.includes("order confirmation") ||
    lowerSubject.includes("payment receipt") ||
    lowerSubject.includes("shipping confirmation") ||
    lowerSubject.includes("delivery notification") ||
    lowerSubject.includes("your receipt") ||
    lowerSubject.includes("invoice #")
  )) {
    return {
      tag: "archivable",
      confidence: 0.85,
      source: "rule",
      reason: "Transactional notification from automated sender",
    };
  }

  // Security/login notifications that are FYI-only
  if (isNoreply && (
    lowerSubject.includes("new sign-in") ||
    lowerSubject.includes("new login") ||
    lowerSubject.includes("security alert") ||
    lowerSubject.includes("password changed") ||
    lowerSubject.includes("account activity")
  )) {
    return {
      tag: "archivable",
      confidence: 0.8,
      source: "rule",
      reason: "Security notification - FYI only",
    };
  }

  // Calendar/scheduling notifications
  if (isNoreply && (
    lowerFrom.includes("calendar-notification") ||
    lowerFrom.includes("calendar-server") ||
    lowerSubject.includes("event reminder") ||
    lowerSubject.includes("calendar:") ||
    lowerSubject.includes("reminder:")
  )) {
    return {
      tag: "archivable",
      confidence: 0.8,
      source: "rule",
      reason: "Calendar/reminder notification",
    };
  }

  // CI/CD and developer notifications
  if (isNoreply && (
    lowerFrom.includes("github") ||
    lowerFrom.includes("gitlab") ||
    lowerFrom.includes("circleci") ||
    lowerFrom.includes("jenkins") ||
    lowerFrom.includes("vercel") ||
    lowerFrom.includes("netlify")
  ) && (
    lowerSubject.includes("build") ||
    lowerSubject.includes("deploy") ||
    lowerSubject.includes("pipeline") ||
    lowerSubject.includes("workflow")
  )) {
    return {
      tag: "archivable",
      confidence: 0.75,
      source: "rule",
      reason: "CI/CD notification",
    };
  }

  // === QUICK_ACTION: Emails clearly requiring a brief response ===

  // Meeting invitations (need RSVP)
  if (
    lowerSubject.includes("invitation:") ||
    lowerSubject.includes("invite:") ||
    (lowerSubject.includes("meeting") && lowerSnippet.includes("accept"))
  ) {
    return {
      tag: "quick_action",
      confidence: 0.8,
      source: "rule",
      reason: "Meeting invitation requiring RSVP",
    };
  }

  // Document sharing that needs acknowledgment
  if ((
    lowerFrom.includes("google") ||
    lowerFrom.includes("dropbox") ||
    lowerFrom.includes("notion")
  ) && (
    lowerSubject.includes("shared") ||
    lowerSubject.includes("invited you")
  )) {
    return {
      tag: "quick_action",
      confidence: 0.75,
      source: "rule",
      reason: "Document shared - may need acknowledgment",
    };
  }

  // === NO CONFIDENT CLASSIFICATION ===
  // Let LLM handle:
  // - Personal emails (low recipientCount, no listId, not noreply)
  // - Mailing list emails (need to assess if user engages)
  // - Unclear automated emails
  // - Anything requiring semantic understanding

  return null;
}

/**
 * Pattern-based classification from user corrections
 * Checks if similar emails have been corrected by the user
 * Returns learned classification if found
 */
export async function patternClassify(
  email: EmailForClassification,
  userId: string
): Promise<ClassificationResult | null> {
  try {
    // Fetch recent corrections for this user (limit to last 500 for performance)
    const corrections = await db
      .select({
        newTagId: classificationCorrections.newTagId,
        correctionContext: classificationCorrections.correctionContext,
        correctedAt: classificationCorrections.correctedAt,
      })
      .from(classificationCorrections)
      .where(eq(classificationCorrections.userId, userId))
      .orderBy(desc(classificationCorrections.correctedAt))
      .limit(500);

    if (corrections.length === 0) {
      return null;
    }

    // Check each correction for similarity to current email
    for (const correction of corrections) {
      const context = correction.correctionContext as any;

      if (!context) continue;

      const correctedEmailMetadata = {
        from: context.from,
        subject: context.subject,
        listId: context.listId,
        isNoreply: context.isNoreply,
        hasUnsubscribe: context.hasUnsubscribe,
      };

      const currentEmailMetadata = {
        from: email.from,
        subject: email.subject,
        listId: email.listId,
        isNoreply: email.isNoreply,
        hasUnsubscribe: email.hasUnsubscribe,
      };

      // Use HIGH threshold for pattern matching (0.8)
      if (areSimilar(correctedEmailMetadata, currentEmailMetadata, SIMILARITY_THRESHOLD.HIGH)) {
        // Found a matching pattern! Get the tag name
        const [tag] = await db
          .select({ name: tags.name })
          .from(tags)
          .where(eq(tags.id, correction.newTagId))
          .limit(1);

        if (tag && (tag.name === "archivable" || tag.name === "quick_action" || tag.name === "asana_task" || tag.name === "unsubscribable")) {
          return {
            tag: tag.name as SmartTag,
            confidence: 0.85, // High confidence from user correction
            source: "pattern",
            reason: "Similar to previously corrected email",
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Pattern classification error:", error);
    return null;
  }
}

/**
 * Full classification pipeline
 * 1. Try quick rules first (fast, free)
 * 2. Check for learned patterns from user corrections (fast, free)
 * 3. Fall back to LLM for uncertain cases (costs money)
 */
export async function classifyEmail(
  email: EmailForClassification,
  openaiApiKey: string,
  userId?: string
): Promise<ClassificationResult> {
  // Step 1: Try quick rules first
  const quickResult = quickClassify(email);

  if (quickResult && quickResult.confidence >= CONFIDENCE_THRESHOLD) {
    return quickResult;
  }

  // Step 2: Check for learned patterns (only if userId provided)
  if (userId) {
    const patternResult = await patternClassify(email, userId);

    if (patternResult && patternResult.confidence >= CONFIDENCE_THRESHOLD) {
      return patternResult;
    }
  }

  // Step 3: Fall back to LLM
  return llmClassify(email, openaiApiKey);
}
