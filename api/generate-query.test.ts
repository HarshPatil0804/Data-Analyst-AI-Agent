import { describe, it, expect } from "vitest";
import { parseEngineResponse } from "./generate-query";

describe("parseEngineResponse — sql/python with a fenced code block", () => {
  it("parses a basic SQL response", () => {
    const raw = "ENGINE: sql\n```sql\nSELECT region, SUM(revenue) FROM data GROUP BY region\n```";
    expect(parseEngineResponse(raw)).toEqual({
      engine: "sql",
      code: "SELECT region, SUM(revenue) FROM data GROUP BY region\n",
    });
  });

  it("parses multi-line Python code with NO escaping needed at all — this is the whole point of Phase 33", () => {
    const raw = `ENGINE: python
\`\`\`python
import pandas as pd
from scipy import stats
z = stats.zscore(df["revenue"])
result = df[abs(z) > 2]
\`\`\``;
    const parsed = parseEngineResponse(raw);
    expect(parsed?.engine).toBe("python");
    expect(parsed?.code).toContain("import pandas as pd");
    expect(parsed?.code).toContain('df["revenue"]'); // a literal double quote — would have broken the old JSON contract
    expect(parsed?.code?.split("\n").length).toBeGreaterThanOrEqual(4);
  });

  it("handles code containing single quotes, double quotes, and backslashes together — the exact combination that broke JSON parsing before", () => {
    const raw = `ENGINE: python
\`\`\`python
result = df[(df['region'] == "North") & (df['product'].str.contains("Widget\\\\d"))]
\`\`\``;
    const parsed = parseEngineResponse(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.code).toContain(`df['region'] == "North"`);
  });

  it("works without a language tag on the fence", () => {
    const raw = "ENGINE: sql\n```\nSELECT 1\n```";
    expect(parseEngineResponse(raw)?.code).toBe("SELECT 1\n");
  });

  it("is case-insensitive on the ENGINE keyword and value", () => {
    const raw = "engine: SQL\n```sql\nSELECT 1\n```";
    expect(parseEngineResponse(raw)?.engine).toBe("sql");
  });

  it("tolerates stray whitespace/text around the ENGINE line", () => {
    const raw = "  \nENGINE: sql  \n```sql\nSELECT 1\n```\n";
    expect(parseEngineResponse(raw)?.engine).toBe("sql");
  });

  it("handles Windows (CRLF) line endings inside the code fence", () => {
    const raw = "ENGINE: sql\r\n```sql\r\nSELECT 1\r\n```";
    const parsed = parseEngineResponse(raw);
    expect(parsed?.engine).toBe("sql");
    expect(parsed?.code).toContain("SELECT 1");
  });

  it("returns null when sql/python has no code fence at all", () => {
    expect(parseEngineResponse("ENGINE: sql\nSELECT 1")).toBeNull();
  });
});

describe("parseEngineResponse — insights/meta (no code block needed)", () => {
  it("parses insights with just the ENGINE line", () => {
    expect(parseEngineResponse("ENGINE: insights")).toEqual({ engine: "insights" });
  });

  it("parses meta with just the ENGINE line", () => {
    expect(parseEngineResponse("ENGINE: meta")).toEqual({ engine: "meta" });
  });

  it("ignores a stray code fence if the model adds one anyway for insights/meta", () => {
    // Shouldn't happen per the prompt, but shouldn't break parsing either —
    // insights/meta return before ever looking for a code fence.
    expect(parseEngineResponse("ENGINE: meta\n```\nunexpected\n```")).toEqual({ engine: "meta" });
  });
});

describe("parseEngineResponse — errors", () => {
  it("parses NO_QUERY_POSSIBLE", () => {
    expect(parseEngineResponse("ERROR: NO_QUERY_POSSIBLE")).toEqual({ error: "NO_QUERY_POSSIBLE" });
  });

  it("parses OFF_TOPIC", () => {
    expect(parseEngineResponse("ERROR: OFF_TOPIC")).toEqual({ error: "OFF_TOPIC" });
  });

  it("is case-insensitive", () => {
    expect(parseEngineResponse("error: off_topic")).toEqual({ error: "OFF_TOPIC" });
  });

  it("prioritizes an ERROR line over any ENGINE line if both somehow appear", () => {
    const raw = "ERROR: NO_QUERY_POSSIBLE\nENGINE: sql";
    expect(parseEngineResponse(raw)).toEqual({ error: "NO_QUERY_POSSIBLE" });
  });
});

describe("parseEngineResponse — malformed input", () => {
  it("returns null for text with no ENGINE or ERROR line at all", () => {
    expect(parseEngineResponse("I'm not sure how to answer that.")).toBeNull();
  });

  it("returns null for an empty string", () => {
    expect(parseEngineResponse("")).toBeNull();
  });

  it("returns null for an unrecognized engine value", () => {
    expect(parseEngineResponse("ENGINE: javascript\n```js\nconsole.log(1)\n```")).toBeNull();
  });
});
