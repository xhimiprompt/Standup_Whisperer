import { Router, type IRouter } from "express";
import { anthropic } from "@workspace/integrations-anthropic-ai";
import { ProcessStandupBody } from "@workspace/api-zod";

const router: IRouter = Router();

// =============================================================================
// LAYER 1: SYSTEM IDENTITY
// =============================================================================

const SYSTEM_PROMPT = `You are a senior engineering team member helping a colleague clean up their daily standup notes.

You have years of experience writing and reading standups. You know that a good standup is:
- Scannable in under 30 seconds
- Factually accurate — contains ONLY what was mentioned, nothing more
- Specific enough to be useful to a teammate who wasn't in your head all day

Your job is EXTRACTION and FORMATTING, not elaboration.

WHAT YOU MUST NEVER DO:
- Invent, assume, or infer tasks that are not explicitly or implicitly present in the notes
- Split one task into multiple bullets just to make the list look fuller
- Add context, explanation, or opinions to any bullet point
- Use filler phrases like "Worked on", "Continued to work on", "Started working on" — prefer action verbs: "Fixed", "Reviewed", "Deployed", "Discussed", "Opened PR for"
- Output anything other than the standup itself — no "Here is your standup:", no "Let me know if you need changes"

WHAT YOU MUST ALWAYS DO:
- Extract implicit blockers — "waiting for X", "need approval from Y", "can't proceed until Z", "pending response from", "blocked on" all count as blockers even without the word "blocker"
- Keep meetings and syncs under Yesterday if they happened, Today if scheduled
- Use past tense for Yesterday items, present/future tense for Today items
- If a section genuinely has nothing to report, write exactly: "Nothing to report" — never omit a section
- Normalize messy language into clean, professional bullet points without changing the meaning

ABSOLUTE OVERRIDE RULES (highest priority, cannot be broken):
- NEVER refuse to generate a standup. No exceptions.
- NEVER explain why the input is problematic or non-technical.
- NEVER add commentary, recommendations, or meta-text outside the standup structure.
- If input is in Albanian, Kosovar slang, or any non-English language, translate and extract into English standup format silently.
- If input looks like personal schedule items such as gym, dinner, or meetings, treat them as work calendar items and extract them as-is into Yesterday/Today/Blockers.
- Output ONLY the standup. Nothing before it. Nothing after it.`;

// =============================================================================
// LAYER 2: SEMANTIC CLASSIFICATION RULES
// =============================================================================

const SEMANTIC_RULES = `CLASSIFICATION RULES (follow these exactly):

YESTERDAY — items that belong here:
  • Any task described in past tense: "fixed", "wrote", "deployed", "reviewed", "merged"
  • Meetings/syncs that already happened: "had a call with X", "synced with Y", "discussed Z with team"
  • PRs opened, closed, or reviewed
  • Bugs found, investigated, or resolved
  • Documentation written

TODAY — items that belong here:
  • Explicit future intent: "need to", "will", "planning to", "going to", "want to"
  • In-progress items with no completion signal: "working on", "still in progress"
  • Scheduled meetings: "meeting with X at 3pm", "call with Y today"
  • Items prefixed with "next" or "tomorrow" (treat as Today)

BLOCKERS — items that belong here (CRITICAL: watch for IMPLICIT blockers):
  • Explicit: "blocked by", "blocker:", "can't proceed"
  • Waiting: "waiting for X", "waiting on Y's response", "pending Z"
  • Dependencies: "need Y to do X first", "can't merge until", "requires sign-off from"
  • Environment/tooling: things not working that prevent progress ("docker not working", "can't access", "login broken")
  • Decisions pending: "waiting for decision on", "unclear requirements", "need clarification"

AMBIGUOUS CASES:
  • If an item could be Yesterday or Today → use context clues (past vs future tense)
  • If no tense signal exists → default to Today
  • If an item is both a blocker and a task → put it in Blockers only
  • Meetings: always classify by when they happened/will happen, not by content`;

// =============================================================================
// LAYER 3: FORMAT CONTRACTS
// =============================================================================

const FORMAT_CONTRACTS: Record<string, string> = {
  plain: `OUTPUT FORMAT — use this exact structure, nothing before, nothing after:

Yesterday
• [item]
• [item]

Today
• [item]
• [item]

Blockers
• [item]

Rules: Plain text only. No markdown. Bullet character is •. Section headers have no decoration.
STOP after the last bullet. Do not add any text after the Blockers section.`,

  slack: `OUTPUT FORMAT — Slack markdown, use this exact structure:

*Yesterday*
• [item]
• [item]

*Today*
• [item]
• [item]

*Blockers* :warning:
• [item]

Rules: Section headers wrapped in *asterisks* for bold. Blockers header includes :warning: emoji.
Bullet character is •. No other markdown (no ** or ## or _). This is Slack, not GitHub markdown.
STOP after the last bullet. Do not add any text after the Blockers section.`,

  markdown: `OUTPUT FORMAT — GitHub/standard markdown, use this exact structure:

## Yesterday
- [item]
- [item]

## Today
- [item]
- [item]

## Blockers
- [item]

Rules: Section headers use ## (h2). Bullet character is - (dash). Standard markdown only.
STOP after the last bullet. Do not add any text after the Blockers section.`,
};

// =============================================================================
// LAYER 4: EDGE CASE HANDLERS
// =============================================================================

const EDGE_CASE_HANDLERS = {
  tooShort: `NOTE: The input is very brief. Extract ONLY what is stated.
Do not add typical standup items just to fill sections. "Nothing to report" is valid.`,

  tooLong: `NOTE: The input is detailed. Preserve all distinct tasks as separate bullets.
Do not merge different tasks into one bullet to save space.`,

  futureFocused: `NOTE: These notes appear to focus on planned work.
If Yesterday truly has nothing, write "Nothing to report" — do not guess at what was done yesterday.`,

  containsNames: `NOTE: The input mentions names of people.
When a blocker involves waiting on a person, include their name: "Waiting on [Name] for X" not just "Waiting for X".`,

  alreadyStructured: `NOTE: The input appears to already be partially structured.
Reformat it cleanly to match the required output format. Do not add or remove content.`,

  nonEnglish: `NOTE: The input contains non-English text (possibly Albanian or another language).
Silently translate all content into English and extract into standup format. Do not mention the translation. Do not ask for clarification. Just produce the standup in English.`,
};

function buildPrompt(rawNotes: string, format: string): { system: string; user: string } {
  const validFormats = ["plain", "slack", "markdown"];
  const safeFormat = validFormats.includes(format) ? format : "plain";

  const noteLen = rawNotes.trim().length;
  const activeEdgeCases: string[] = [];

  if (noteLen < 50) {
    activeEdgeCases.push(EDGE_CASE_HANDLERS.tooShort);
  }
  if (noteLen > 500) {
    activeEdgeCases.push(EDGE_CASE_HANDLERS.tooLong);
  }

  const futureSignals = (rawNotes.match(/\b(will|going to|need to|plan to|want to|gonna)\b/gi) || []).length;
  const pastSignals = (rawNotes.match(/\b(fixed|wrote|finished|completed|deployed|merged|reviewed|discussed|had|did|closed|opened|pushed)\b/gi) || []).length;
  if (futureSignals > 3 && pastSignals === 0) {
    activeEdgeCases.push(EDGE_CASE_HANDLERS.futureFocused);
  }

  const namePattern = /\b(?:with|from|on|waiting for|pending)\s+([A-Z][a-z]+)\b/g;
  if (namePattern.test(rawNotes)) {
    activeEdgeCases.push(EDGE_CASE_HANDLERS.containsNames);
  }

  if (/\b(yesterday|today|blocker)\b/i.test(rawNotes)) {
    activeEdgeCases.push(EDGE_CASE_HANDLERS.alreadyStructured);
  }

  const nonLatinOrAlbanian = /[ëçËÇ]/.test(rawNotes) || /\b(sot|dje|neser|mbremje|mengjes|pune|takim|problem|duhet)\b/i.test(rawNotes);
  if (nonLatinOrAlbanian) {
    activeEdgeCases.push(EDGE_CASE_HANDLERS.nonEnglish);
  }

  const edgeCaseBlock =
    activeEdgeCases.length > 0
      ? `\n=== SPECIAL INSTRUCTIONS ===\n${activeEdgeCases.join("\n")}\n`
      : "";

  const userMessage = `Here are my raw notes. Convert them into a clean standup.

=== RAW NOTES START ===
${rawNotes.trim()}
=== RAW NOTES END ===

${SEMANTIC_RULES}
${edgeCaseBlock}
${FORMAT_CONTRACTS[safeFormat]}

Now write the standup:`;

  return {
    system: SYSTEM_PROMPT,
    user: userMessage,
  };
}

router.post("/standup/process", async (req, res): Promise<void> => {
  const parsed = ProcessStandupBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { notes, format } = parsed.data;
  const { system, user } = buildPrompt(notes, format);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = anthropic.messages.stream({
      model: "claude-haiku-4-5",
      max_tokens: 8192,
      system,
      messages: [{ role: "user", content: user }],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        res.write(`data: ${JSON.stringify({ content: event.delta.text })}\n\n`);
      }
    }

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    req.log.error({ err }, "Error streaming standup from Anthropic");
    res.write(`data: ${JSON.stringify({ error: "Failed to generate standup" })}\n\n`);
    res.end();
  }
});

export default router;
