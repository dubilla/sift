/**
 * Shared types for the email classifier. Kept in their own module so the
 * pipeline (classifier.ts) and the LLM provider layer (llm-classifier.ts) can
 * both import them without a circular dependency.
 */

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

export const VALID_TAGS: SmartTag[] = [
  "archivable",
  "quick_action",
  "asana_task",
  "unsubscribable",
];
