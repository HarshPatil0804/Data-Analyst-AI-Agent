// Shared helpers between api/generate-query.ts and api/generate-insights.ts.
// The `_lib` prefix keeps Vercel from treating this as its own route.

export function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function log(event: string, data: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ event, ts: new Date().toISOString(), ...data }));
}

/**
 * Extracts a JSON object from a model's raw text response, tolerating the
 * couple of ways models occasionally ignore "respond with ONLY JSON":
 * markdown code fences, stray text wrapped around the actual object, and —
 * the most common one specifically for Python code, which is naturally
 * multi-line — a literal newline/tab left inside a JSON string instead of
 * being escaped as \n/\t. That last one is invalid JSON syntax but an easy
 * mistake for a model to make when the "code" field's actual content is
 * multi-line Python, which is why Python questions fail this parse more
 * often than short, usually-single-line SQL.
 */
export function parseModelJson<T = Record<string, unknown>>(raw: string): T | null {
  const attempts = [raw.trim()];

  const fenceStripped = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  if (fenceStripped !== attempts[0]) attempts.push(fenceStripped);

  const braceMatch = raw.match(/\{[\s\S]*\}/);
  if (braceMatch) attempts.push(braceMatch[0]);

  // Try each of the above again with literal control characters inside
  // string values escaped. Only added as fallback attempts (after the
  // as-is ones) so well-formed responses still parse on the fast path.
  for (const candidate of [...attempts]) {
    const repaired = escapeLiteralControlCharsInStrings(candidate);
    if (repaired !== candidate) attempts.push(repaired);
  }

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Walks the text tracking whether each character is inside a JSON string
 * (toggling on an unescaped double-quote) and, only while inside a string,
 * replaces a literal newline/carriage-return/tab with its escaped JSON
 * form. Already-escaped sequences (a backslash followed by any character)
 * are left untouched and skipped over correctly. This is a targeted repair
 * for exactly one failure mode, not a general JSON-repair library — it
 * can't fix e.g. an unescaped literal quote inside a string, which is
 * genuinely ambiguous to repair without knowing where the string was
 * supposed to end.
 */
function escapeLiteralControlCharsInStrings(text: string): string {
  let result = "";
  let inString = false;
  let escaped = false;

  for (const ch of text) {
    if (!inString) {
      if (ch === '"') inString = true;
      result += ch;
      continue;
    }

    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      result += ch;
      escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = false;
      result += ch;
      continue;
    }

    if (ch === "\n") {
      result += "\\n";
    } else if (ch === "\r") {
      result += "\\r";
    } else if (ch === "\t") {
      result += "\\t";
    } else {
      result += ch;
    }
  }

  return result;
}
