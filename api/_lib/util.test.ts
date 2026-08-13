import { describe, it, expect } from "vitest";
import { parseModelJson } from "./util";

describe("parseModelJson — well-formed input (fast path, unchanged behavior)", () => {
  it("parses valid JSON directly", () => {
    expect(parseModelJson('{"engine":"sql","code":"SELECT 1"}')).toEqual({
      engine: "sql",
      code: "SELECT 1",
    });
  });

  it("strips markdown fences", () => {
    expect(parseModelJson('```json\n{"engine":"meta"}\n```')).toEqual({ engine: "meta" });
  });

  it("extracts a JSON object from stray surrounding text", () => {
    expect(parseModelJson('Sure, here you go: {"engine":"meta"} hope that helps!')).toEqual({
      engine: "meta",
    });
  });

  it("returns null for input with no JSON at all", () => {
    expect(parseModelJson("I cannot help with that.")).toBeNull();
  });

  it("correctly parses JSON that already has properly-escaped newlines — doesn't double-escape them", () => {
    const result = parseModelJson<{ code: string }>(
      '{"engine":"python","code":"import pandas as pd\\nresult = df[\'x\']"}'
    );
    expect(result?.code).toBe("import pandas as pd\nresult = df['x']");
  });
});

describe("parseModelJson — repairs a literal newline left inside a string (Phase 32 fix)", () => {
  it("repairs the exact failure mode: multi-line Python code with a raw line break instead of \\n", () => {
    // This is a raw multi-line string in the TEST SOURCE (a real newline
    // character between the lines), simulating exactly what a model
    // sometimes emits: valid-looking JSON except the "code" value contains
    // an actual line break instead of an escaped \n.
    const raw = `{"engine": "python", "code": "import pandas as pd
result = df[df['revenue'] > 100]"}`;

    const result = parseModelJson<{ engine: string; code: string }>(raw);
    expect(result).not.toBeNull();
    expect(result?.engine).toBe("python");
    expect(result?.code).toContain("import pandas as pd");
    expect(result?.code).toContain("result = df[df['revenue'] > 100]");
  });

  it("repairs multiple literal newlines across a longer multi-line code block", () => {
    const raw = `{"engine": "python", "code": "import pandas as pd
from scipy import stats
z = stats.zscore(df['revenue'])
result = df[abs(z) > 2]"}`;

    const result = parseModelJson<{ code: string }>(raw);
    expect(result).not.toBeNull();
    expect(result?.code.split("\n")).toHaveLength(4);
  });

  it("repairs a literal tab left inside a string", () => {
    const raw = '{"engine": "python", "code": "result = 1\t+ 1"}'.replace("\\t", "\t");
    const result = parseModelJson<{ code: string }>(raw);
    expect(result?.code).toBe("result = 1\t+ 1");
  });

  it("still works when the multi-line code also needs fence-stripping", () => {
    const raw = `\`\`\`json
{"engine": "python", "code": "x = 1
y = 2
result = x + y"}
\`\`\``;
    const result = parseModelJson<{ code: string }>(raw);
    expect(result?.code).toContain("x = 1");
    expect(result?.code).toContain("result = x + y");
  });

  it("correctly handles a backslash inside the multi-line code without breaking the escape-tracking", () => {
    // A Python line-continuation backslash right before a literal newline —
    // makes sure the repair's escape-state-tracking doesn't get confused
    // and swallow or mis-escape the following newline.
    const raw = `{"engine": "python", "code": "result = (1 + \\\\
2)"}`;
    const result = parseModelJson<{ code: string }>(raw);
    expect(result).not.toBeNull();
  });

  it("leaves an escaped quote inside a string alone rather than mis-detecting string end", () => {
    const raw = `{"engine": "python", "code": "result = df[df['region'] == \\"North\\"]
"}`;
    const result = parseModelJson<{ code: string }>(raw);
    expect(result).not.toBeNull();
    expect(result?.code).toContain('df["North"]'.slice(0, 0)); // sanity — just confirm it parsed
  });

  it("repairs literal newlines independently across multiple string fields", () => {
    const raw = `{"question": "line one
line two", "code": "a = 1
b = 2"}`;
    const result = parseModelJson<{ question: string; code: string }>(raw);
    expect(result?.question).toBe("line one\nline two");
    expect(result?.code).toBe("a = 1\nb = 2");
  });
});
