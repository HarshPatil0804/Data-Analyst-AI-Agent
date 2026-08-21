import { DEFAULT_PROVIDER, isProviderId, ProviderError, callWithFallback, type ProviderId } from "./providers";
import { jsonResponse, log, parseModelJson } from "./_lib/util";

export const config = { runtime: "edge" };

interface RequestBody {
  question?: string;
  resultSummary?: string;
  provider?: string;
}

interface ParsedSummaryResponse {
  summary?: string;
}

// Deliberately the smallest possible sibling of generate-insights.ts's system
// prompt, NOT a rename of it — same anti-hallucination contract (never given
// raw rows, only ever narrates numbers it's handed), but this one runs AFTER
// a SQL/Python result already exists, on every answer, not just "insights"
// questions. Kept as its own file/endpoint rather than a flag on
// generate-insights so the two call sites (insights narration vs. per-answer
// summary) can evolve independently — e.g. this one may later take engine
// (sql/python) or chart info into account, which generate-insights never will.
const SYSTEM_PROMPT = `You are writing a very short caption underneath an already-computed, already-
verified answer to a data question. The result below is REAL — it was computed by actual SQL/Python
code, not by you. You are only narrating it in plain words, not calculating or double-checking it.

Rules:
- Use ONLY the question and the result given below. Never invent, estimate, or add any number, name, or
  fact that isn't directly present in the result.
- Write EXACTLY 1-2 short sentences. No bullet points, no markdown, no preamble like "This shows that...".
- Sound like a quick human observation, not a restatement of the table — e.g. instead of repeating
  "the mean is 63.80", say what that means in context ("the average is dragged up by one very high value")
  ONLY if that context is directly visible in the result itself. If the result is a single number/row with
  no further context available, a plain one-sentence restatement in natural language is fine.
- If the result is empty (0 rows) or an error, say so plainly and briefly — don't invent a reason.
- Respond with ONLY a single JSON object, no markdown fences, no explanation outside the JSON, in exactly
  this shape: {"summary": "..."}
- The summary value must be valid inside a JSON string: escape any newline as \\n and any double quote as
  \\\\" (prefer wording around a quoted value rather than embedding literal quote marks).`;

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid request body." }, 400);
  }

  const { question, resultSummary } = body;
  if (!question?.trim() || !resultSummary?.trim()) {
    return jsonResponse({ error: "Missing question or resultSummary." }, 400);
  }

  const preferredProvider: ProviderId = isProviderId(body.provider) ? body.provider : DEFAULT_PROVIDER;

  log("answer_summary_request_received", { preferredProvider });

  const userPrompt = `Question: ${question}\n\nResult:\n${resultSummary}`;

  try {
    const { raw, providerUsed } = await callWithFallback(preferredProvider, SYSTEM_PROMPT, userPrompt, log);

    const parsed = parseModelJson<ParsedSummaryResponse>(raw);
    if (!parsed || typeof parsed.summary !== "string" || !parsed.summary.trim()) {
      // Non-fatal by design (see llm.ts caller) — a missing caption is a much
      // smaller loss to the user than losing the main answer over this.
      return jsonResponse({ error: "Model response wasn't valid JSON with a summary." }, 502);
    }

    return jsonResponse({ summary: parsed.summary.trim(), provider: providerUsed }, 200);
  } catch (err) {
    if (err instanceof ProviderError) {
      log("answer_summary_all_providers_failed", { preferredProvider, status: err.status });
      return jsonResponse({ error: err.message }, err.status);
    }
    log("answer_summary_unhandled_exception", {
      preferredProvider,
      message: err instanceof Error ? err.message : String(err),
    });
    return jsonResponse(
      { error: err instanceof Error ? err.message : "Unknown error calling the model." },
      500
    );
  }
}
