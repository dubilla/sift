/**
 * Smart email classifier service
 * Provides rule-based quick classification, pattern learning from corrections, and LLM-powered deep classification
 */

import { db } from "@/db";
import { classificationCorrections, tags } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { areSimilar, SIMILARITY_THRESHOLD } from "./similarity";

export type SmartTag = "archivable" | "quick_action" | "asana_task" | "unsubscribable";

export interface ClassificationResult {
  tag: SmartTag | null;
  confidence: number;
  source: "rule" | "llm" | "pattern";
  reason: string;
}

export interface EmailForClassification {
  id: string;
  subject: string | null;
  from: string;
  to: string | null;
  snippet: string | null;
  hasUnsubscribe: boolean;
  listId: string | null;
  isNoreply: boolean;
  recipientCount: number;
}

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
 * Classify email using OpenAI
 * Called for emails that quickClassify cannot confidently handle
 */
export async function llmClassify(
  email: EmailForClassification,
  openaiApiKey: string
): Promise<ClassificationResult> {
  const prompt = `You are an email classifier. Analyze this email and classify it into exactly ONE category.

Categories:
- ARCHIVABLE: Newsletter, notification, marketing, FYI-only content that doesn't need action
- QUICK_ACTION: Needs brief response, RSVP, simple confirmation, quick decision (< 2 min to handle)
- ASANA_TASK: Represents real work - requests needing follow-up, assignments, projects, complex decisions
- UNSUBSCRIBABLE: Clearly unwanted marketing or spam the user likely wants to stop receiving

Email:
From: ${email.from}
Subject: ${email.subject || "(no subject)"}
Preview: ${email.snippet || "(no preview)"}
Has unsubscribe link: ${email.hasUnsubscribe}
Is from mailing list: ${!!email.listId}
Is from noreply address: ${email.isNoreply}

Respond with ONLY valid JSON (no markdown):
{"tag": "archivable|quick_action|asana_task|unsubscribable", "confidence": 0.0-1.0, "reason": "brief explanation"}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.3, // Lower temperature for more consistent classification
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error("No response from OpenAI");
    }

    // Parse JSON response
    const parsed = JSON.parse(content);

    // Validate and normalize
    const validTags: SmartTag[] = ["archivable", "quick_action", "asana_task", "unsubscribable"];
    const tag = parsed.tag?.toLowerCase() as SmartTag;

    if (!validTags.includes(tag)) {
      throw new Error(`Invalid tag: ${parsed.tag}`);
    }

    return {
      tag,
      confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
      source: "llm",
      reason: parsed.reason || "LLM classification",
    };
  } catch (error) {
    console.error("LLM classification error:", error);
    // Return low-confidence result on error
    return {
      tag: null,
      confidence: 0,
      source: "llm",
      reason: `Classification failed: ${error instanceof Error ? error.message : "unknown error"}`,
    };
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
