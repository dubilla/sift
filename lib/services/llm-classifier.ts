/**
 * LLM provider layer for email classification.
 *
 * Isolated from the classification pipeline (classifier.ts) so the transport —
 * which model, which host — is a single, swappable concern. Two backends:
 *
 *   - openai: gpt-4o-mini (cloud)
 *   - ollama: a local model (default qwen3:8b) on the Mac via ollama's chat API
 *
 * Pick the backend with CLASSIFIER_PROVIDER. The default is `openai`, so this
 * change is inert until you flip it — and flipping back is a one-line env edit.
 *
 * A/B note (2026-06-19): on the hard, rule-bypassing emails that actually reach
 * the LLM, qwen3:8b agreed with gpt-4o-mini on 11/12; the lone diff was a
 * genuinely ambiguous LinkedIn notification. Local is ~3s/email vs ~1s cloud.
 * qwen3 reports a flat ~0.95 confidence, so don't read its confidence as signal.
 */
import type {
  ClassificationResult,
  EmailForClassification,
  SmartTag,
} from "./classifier-types";
import { VALID_TAGS } from "./classifier-types";

type LlmProvider = "openai" | "ollama";

// --- config (env, with safe defaults) ---------------------------------------
const PROVIDER: LlmProvider =
  process.env.CLASSIFIER_PROVIDER === "ollama" ? "ollama" : "openai";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3:8b";
const OPENAI_MODEL = "gpt-4o-mini";

function buildPrompt(email: EmailForClassification): string {
  return `You are an email classifier. Analyze this email and classify it into exactly ONE category.

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
}

/** Parse + validate a model's JSON reply into a ClassificationResult. Throws on
 *  malformed output or an out-of-vocabulary tag, so the caller can fall back. */
function parseClassification(content: string | null | undefined): ClassificationResult {
  if (!content) throw new Error("Empty LLM response");

  const parsed = JSON.parse(content);
  const tag = parsed.tag?.toLowerCase() as SmartTag;

  if (!VALID_TAGS.includes(tag)) {
    throw new Error(`Invalid tag: ${parsed.tag}`);
  }

  return {
    tag,
    confidence: Math.min(1, Math.max(0, parsed.confidence || 0.5)),
    source: "llm",
    reason: parsed.reason || "LLM classification",
  };
}

async function callOpenAI(email: EmailForClassification, apiKey: string): Promise<string | null> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content: buildPrompt(email) }],
      temperature: 0.3, // consistent classification
      max_tokens: 100,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }
  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? null;
}

async function callOllama(email: EmailForClassification): Promise<string | null> {
  const response = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      think: false, // qwen3 is a reasoning model; skip the <think> phase for an enum
      format: "json", // constrain output to a JSON object
      keep_alive: "10m", // keep the model resident between bursts of classification
      options: { temperature: 0.3, num_predict: 120 },
      messages: [{ role: "user", content: buildPrompt(email) }],
    }),
  });

  if (!response.ok) {
    throw new Error(`Ollama API error: ${response.status}`);
  }
  const data = await response.json();
  return data.message?.content ?? null;
}

/**
 * Classify an email with the configured LLM backend. Never throws — on any
 * failure (bad provider response, model down, malformed JSON) it returns a
 * null-tag, zero-confidence result, matching the pre-refactor contract so the
 * pipeline degrades gracefully.
 *
 * `openaiApiKey` is required only by the openai backend; the ollama backend
 * ignores it. The signature is unchanged so existing call sites don't move.
 */
export async function llmClassify(
  email: EmailForClassification,
  openaiApiKey: string
): Promise<ClassificationResult> {
  try {
    const content =
      PROVIDER === "ollama" ? await callOllama(email) : await callOpenAI(email, openaiApiKey);
    return parseClassification(content);
  } catch (error) {
    console.error(`LLM classification error (provider=${PROVIDER}):`, error);
    return {
      tag: null,
      confidence: 0,
      source: "llm",
      reason: `Classification failed: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}
