/**
 * Email similarity detection for pattern learning
 */

interface EmailMetadata {
  from: string;
  subject: string | null;
  listId: string | null;
  isNoreply: boolean | null;
  hasUnsubscribe: boolean | null;
}

/**
 * Extract email address from "Name <email@domain.com>" format
 */
export function extractEmailAddress(from: string): string {
  const match = from.match(/<(.+?)>/);
  return match ? match[1] : from;
}

/**
 * Extract domain from email address
 */
export function extractDomain(email: string): string {
  const parts = email.split('@');
  return parts.length > 1 ? parts[1].toLowerCase() : '';
}

/**
 * Normalize subject for pattern matching
 * Removes common variable parts like numbers, dates, IDs
 */
export function normalizeSubject(subject: string | null): string {
  if (!subject) return '';

  return subject
    .toLowerCase()
    // Remove message IDs, ticket numbers, PR numbers, etc.
    .replace(/#\d+/g, '#NUM')
    .replace(/\b\d{4,}\b/g, 'NUM')
    // Remove dates
    .replace(/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/g, 'DATE')
    // Remove common variable tokens
    .replace(/\b[a-f0-9]{7,40}\b/g, 'HASH')
    .trim();
}

/**
 * Calculate similarity score between two emails
 * Returns 0-1, where 1 is identical
 */
export function calculateSimilarity(email1: EmailMetadata, email2: EmailMetadata): number {
  let score = 0;
  let maxScore = 0;

  // Same sender email (high weight)
  maxScore += 50;
  const sender1 = extractEmailAddress(email1.from);
  const sender2 = extractEmailAddress(email2.from);
  if (sender1.toLowerCase() === sender2.toLowerCase()) {
    score += 50;
  } else {
    // Same domain (medium weight)
    const domain1 = extractDomain(sender1);
    const domain2 = extractDomain(sender2);
    if (domain1 && domain1 === domain2) {
      score += 20;
    }
  }

  // Same mailing list (high weight)
  maxScore += 30;
  if (email1.listId && email1.listId === email2.listId) {
    score += 30;
  }

  // Similar subject pattern (medium weight)
  maxScore += 20;
  const subject1 = normalizeSubject(email1.subject);
  const subject2 = normalizeSubject(email2.subject);
  if (subject1 && subject2) {
    // Calculate string similarity (simple approach: common words)
    const words1 = new Set(subject1.split(/\s+/));
    const words2 = new Set(subject2.split(/\s+/));
    const commonWords = Array.from(words1).filter(w => words2.has(w)).length;
    const totalWords = Math.max(words1.size, words2.size);
    if (totalWords > 0) {
      score += (commonWords / totalWords) * 20;
    }
  }

  return maxScore > 0 ? score / maxScore : 0;
}

/**
 * Determine similarity threshold based on context
 * - High threshold (0.8): Very confident - same sender
 * - Medium threshold (0.6): Moderate confidence - same domain/list
 * - Low threshold (0.4): Low confidence - similar patterns
 */
export const SIMILARITY_THRESHOLD = {
  HIGH: 0.8,    // Same sender - auto-suggest
  MEDIUM: 0.6,  // Same domain/list - show as option
  LOW: 0.4,     // Similar patterns - maybe show
};

/**
 * Check if two emails are similar enough to apply the same tag
 */
export function areSimilar(email1: EmailMetadata, email2: EmailMetadata, threshold: number = SIMILARITY_THRESHOLD.HIGH): boolean {
  return calculateSimilarity(email1, email2) >= threshold;
}
