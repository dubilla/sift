/**
 * A/B harness: gpt-4o-mini (cloud) vs qwen3:8b (local via ollama) on sift's
 * email-classifier prompt. Uses the EXACT prompt from lib/services/classifier.ts
 * so the comparison reflects the real migration, not a paraphrase.
 *
 * Run from the sift dir:  node scripts/ab-classifier.mjs
 * Needs: OPENAI_API_KEY in .env.local, ollama running with qwen3:8b pulled.
 */
import { readFileSync } from "node:fs";

// --- config -----------------------------------------------------------------
const OLLAMA_URL = process.env.OLLAMA_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen3:8b";
const OPENAI_MODEL = "gpt-4o-mini";

function loadKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
    const line = env.split("\n").find((l) => l.startsWith("OPENAI_API_KEY="));
    if (line) return line.slice("OPENAI_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
  } catch {}
  return null;
}
const OPENAI_API_KEY = loadKey();

// --- the real sift prompt ----------------------------------------------------
function buildPrompt(email) {
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

const VALID = ["archivable", "quick_action", "asana_task", "unsubscribable"];
function parseResult(content) {
  try {
    const p = JSON.parse(content);
    const tag = String(p.tag || "").toLowerCase();
    if (!VALID.includes(tag)) return { tag: "INVALID", confidence: 0, reason: content.slice(0, 80) };
    return { tag, confidence: Math.min(1, Math.max(0, p.confidence ?? 0.5)), reason: p.reason || "" };
  } catch {
    return { tag: "PARSE_ERR", confidence: 0, reason: String(content).slice(0, 80) };
  }
}

async function classifyOpenAI(email) {
  const t = performance.now();
  const r = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: "user", content: buildPrompt(email) }],
      temperature: 0.3,
      max_tokens: 100,
    }),
  });
  const data = await r.json();
  const out = parseResult(data.choices?.[0]?.message?.content ?? "");
  return { ...out, ms: Math.round(performance.now() - t) };
}

async function classifyOllama(email) {
  const t = performance.now();
  const r = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: OLLAMA_MODEL,
      stream: false,
      think: false, // qwen3 is a reasoning model; skip the <think> phase for a quick enum
      format: "json",
      keep_alive: "10m",
      options: { temperature: 0.3, num_predict: 120 },
      messages: [{ role: "user", content: buildPrompt(email) }],
    }),
  });
  const data = await r.json();
  const out = parseResult(data.message?.content ?? "");
  return { ...out, ms: Math.round(performance.now() - t) };
}

// --- sample emails (chosen to BYPASS sift's rules → these are real LLM-hits) -
// `expected` = my human label, for a rough accuracy read (not ground truth).
const SAMPLES = [
  { expected: "asana_task", from: "Priya Nadar <priya@acme.com>", subject: "Can you own the Q3 onboarding revamp?", snippet: "We'd like you to lead this end-to-end — scope, timeline, and the cross-team handoff. Can you put together a plan?", hasUnsubscribe: false, listId: null, isNoreply: false },
  { expected: "quick_action", from: "Sam Lee <sam@acme.com>", subject: "Re: lunch thurs?", snippet: "Does 12:30 work for you instead of noon? Lmk.", hasUnsubscribe: false, listId: null, isNoreply: false },
  { expected: "unsubscribable", from: "Old Navy <promo@oldnavy.com>", subject: "🔥 50% off EVERYTHING today only", snippet: "Shop now before it's gone. Unsubscribe at the bottom.", hasUnsubscribe: true, listId: "oldnavy.promo", isNoreply: true },
  { expected: "archivable", from: "Stripe <receipts@stripe.com>", subject: "Your monthly summary is ready", snippet: "Here's a recap of your account activity for May. No action needed.", hasUnsubscribe: true, listId: "stripe.digest", isNoreply: true },
  { expected: "asana_task", from: "Legal <legal@vendor.io>", subject: "Countersignature needed on the MSA", snippet: "Please review the redlines in sections 4 and 7 and send back a signed copy by Friday.", hasUnsubscribe: false, listId: null, isNoreply: false },
  { expected: "archivable", from: "The Browser <hello@thebrowser.com>", subject: "Ten blue links for your weekend", snippet: "This week: a history of the spreadsheet, deep-sea mining, and more.", hasUnsubscribe: true, listId: "thebrowser.daily", isNoreply: false },
  { expected: "quick_action", from: "Calendly <notifications@calendly.com>", subject: "New event: Coffee with Dana — confirm?", snippet: "Dana booked 3:00pm Tuesday. Accept or propose a new time.", hasUnsubscribe: false, listId: null, isNoreply: true },
  { expected: "unsubscribable", from: "GrowthHackers <no-reply@growthio.biz>", subject: "Dan, you're missing out on 10x leads", snippet: "Our AI outreach tool books meetings on autopilot. Book a demo. Opt out here.", hasUnsubscribe: true, listId: "growthio.cold", isNoreply: true },
  { expected: "asana_task", from: "Jordan Kim <jordan@acme.com>", subject: "Bug: checkout fails for EU cards", snippet: "Repro steps attached. Can your team dig in? Customers are blocked.", hasUnsubscribe: false, listId: null, isNoreply: false },
  { expected: "archivable", from: "LinkedIn <notify@linkedin.com>", subject: "You appeared in 9 searches this week", snippet: "See who's looking at your profile.", hasUnsubscribe: true, listId: "linkedin.notify", isNoreply: true },
  { expected: "quick_action", from: "Mom <janet@gmail.com>", subject: "what time sunday?", snippet: "Should we plan on 5 for dinner? your sister's coming too", hasUnsubscribe: false, listId: null, isNoreply: false },
  { expected: "asana_task", from: "Notion <team@makenotion.com>", subject: "Renewal: your plan expires in 7 days", snippet: "Your annual workspace plan renews June 26. Update billing or change plan.", hasUnsubscribe: true, listId: null, isNoreply: true },
];

function pct(n, d) { return d ? ((100 * n) / d).toFixed(0) + "%" : "—"; }

async function main() {
  if (!OPENAI_API_KEY) { console.error("No OPENAI_API_KEY found — aborting."); process.exit(1); }

  // Warm the local model so the first timed call isn't paying the load cost.
  process.stdout.write("Warming qwen3:8b… ");
  await classifyOllama(SAMPLES[0]);
  console.log("done.\n");

  const rows = [];
  for (const e of SAMPLES) {
    const [oa, ol] = [await classifyOpenAI(e), await classifyOllama(e)];
    rows.push({ e, oa, ol });
  }

  // Per-email table
  const pad = (s, n) => String(s).padEnd(n).slice(0, n);
  console.log(pad("subject", 34), pad("expected", 14), pad("gpt-4o-mini", 22), pad("qwen3:8b", 22), "agree");
  console.log("-".repeat(100));
  let agree = 0, oaHit = 0, olHit = 0, oaMs = 0, olMs = 0, invalid = 0;
  for (const { e, oa, ol } of rows) {
    const a = oa.tag === ol.tag;
    if (a) agree++;
    if (oa.tag === e.expected) oaHit++;
    if (ol.tag === e.expected) olHit++;
    oaMs += oa.ms; olMs += ol.ms;
    if (!VALID.includes(ol.tag)) invalid++;
    console.log(
      pad(e.subject, 34), pad(e.expected, 14),
      pad(`${oa.tag} (${oa.confidence.toFixed(2)}/${oa.ms}ms)`, 22),
      pad(`${ol.tag} (${ol.confidence.toFixed(2)}/${ol.ms}ms)`, 22),
      a ? "✓" : "✗"
    );
  }
  const n = rows.length;
  console.log("\n=== SUMMARY ===");
  console.log(`Samples:                 ${n}`);
  console.log(`Tag agreement:           ${agree}/${n}  (${pct(agree, n)})`);
  console.log(`Accuracy vs my labels:   gpt-4o-mini ${oaHit}/${n} (${pct(oaHit, n)})   qwen3:8b ${olHit}/${n} (${pct(olHit, n)})`);
  console.log(`Invalid/unparsed (local):${invalid}`);
  console.log(`Avg latency:             gpt-4o-mini ${Math.round(oaMs / n)}ms   qwen3:8b ${Math.round(olMs / n)}ms`);
}

main().catch((e) => { console.error(e); process.exit(1); });
