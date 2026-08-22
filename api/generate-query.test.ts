import { describe, it, expect } from "vitest";
import { cleanSql } from "./generate-query";

describe("cleanSql", () => {
  it("leaves a plain query with no fences or semicolon unchanged", () => {
    expect(cleanSql("SELECT * FROM data")).toBe("SELECT * FROM data");
  });

  it("strips a ```sql ... ``` fence", () => {
    expect(cleanSql("```sql\nSELECT * FROM data\n```")).toBe("SELECT * FROM data");
  });

  it("strips a bare ``` ... ``` fence with no language tag", () => {
    expect(cleanSql("```\nSELECT * FROM data\n```")).toBe("SELECT * FROM data");
  });

  it("strips the fence marker case-insensitively", () => {
    expect(cleanSql("```SQL\nSELECT * FROM data\n```")).toBe("SELECT * FROM data");
  });

  it("removes a trailing semicolon", () => {
    expect(cleanSql("SELECT * FROM data;")).toBe("SELECT * FROM data");
  });

  it("removes a trailing semicolon followed by trailing whitespace", () => {
    expect(cleanSql("SELECT * FROM data;   \n")).toBe("SELECT * FROM data");
  });

  it("trims leading and trailing whitespace", () => {
    expect(cleanSql("   SELECT * FROM data   ")).toBe("SELECT * FROM data");
  });

  it("handles a fenced query with a trailing semicolon and surrounding whitespace together", () => {
    expect(cleanSql("  ```sql\n  SELECT * FROM data;  \n```  ")).toBe("SELECT * FROM data");
  });

  it("does not touch a semicolon that isn't at the very end of the query", () => {
    // Multi-statement input isn't expected from the model (the prompt forbids
    // it), but cleanSql itself should only ever strip a TRAILING semicolon,
    // never rewrite the query body.
    expect(cleanSql("SELECT * FROM data WHERE region = 'A;B'")).toBe(
      "SELECT * FROM data WHERE region = 'A;B'"
    );
  });

  it("handles a multi-line query preserving internal newlines", () => {
    const raw = "```sql\nSELECT region,\n  SUM(revenue) AS total\nFROM data\nGROUP BY region\n```";
    expect(cleanSql(raw)).toBe("SELECT region,\n  SUM(revenue) AS total\nFROM data\nGROUP BY region");
  });
});
