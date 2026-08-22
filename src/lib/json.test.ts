import { describe, it, expect } from "vitest";
import { parseJsonFile, assertIsJsonFile } from "./json";
import { CsvValidationError } from "./csv";

function makeFile(name: string, content: string, type = "application/json"): File {
  return new File([content], name, { type });
}

describe("assertIsJsonFile", () => {
  it("accepts a .json file", () => {
    expect(() => assertIsJsonFile(makeFile("data.json", "[]"))).not.toThrow();
  });

  it("rejects a non-.json file", () => {
    expect(() => assertIsJsonFile(makeFile("data.csv", "a,b"))).toThrow(CsvValidationError);
  });

  it("rejects an empty file", () => {
    expect(() => assertIsJsonFile(makeFile("empty.json", ""))).toThrow(CsvValidationError);
  });
});

describe("parseJsonFile", () => {
  it("parses a clean array of flat objects", async () => {
    const json = JSON.stringify([
      { region: "North", units_sold: 120, revenue: 2400.5 },
      { region: "South", units_sold: 85, revenue: 1700 },
    ]);

    const result = await parseJsonFile(makeFile("clean.json", json));

    expect(result.totalRows).toBe(2);
    expect(result.warnings).toHaveLength(0);
    expect(result.rows[0]).toEqual({ region: "North", units_sold: "120", revenue: "2400.5" });

    const typeByName = Object.fromEntries(result.columns.map((c) => [c.name, c.type]));
    expect(typeByName.region).toBe("string");
    expect(typeByName.units_sold).toBe("number");
  });

  it("takes the union of keys across rows, filling missing keys with empty string", async () => {
    const json = JSON.stringify([
      { a: "1", b: "2" },
      { a: "3" }, // missing "b" entirely
    ]);

    const result = await parseJsonFile(makeFile("uneven.json", json));

    expect(result.columns.map((c) => c.name)).toEqual(["a", "b"]);
    expect(result.rows[1]).toEqual({ a: "3", b: "" });
  });

  it("converts null to empty string", async () => {
    const json = JSON.stringify([{ a: "1", b: null }]);
    const result = await parseJsonFile(makeFile("nulls.json", json));
    expect(result.rows[0].b).toBe("");
  });

  it("stringifies a nested object/array value and warns about it", async () => {
    const json = JSON.stringify([{ a: "1", tags: ["x", "y"] }]);
    const result = await parseJsonFile(makeFile("nested.json", json));

    expect(result.rows[0].tags).toBe('["x","y"]');
    expect(result.warnings.some((w) => w.includes("nested"))).toBe(true);
  });

  it("rejects invalid JSON syntax", async () => {
    await expect(parseJsonFile(makeFile("broken.json", "{not valid"))).rejects.toThrow(
      CsvValidationError
    );
  });

  it("rejects a top-level object instead of an array", async () => {
    await expect(parseJsonFile(makeFile("obj.json", '{"a": 1}'))).rejects.toThrow(CsvValidationError);
  });

  it("rejects an empty array", async () => {
    await expect(parseJsonFile(makeFile("empty-arr.json", "[]"))).rejects.toThrow(CsvValidationError);
  });

  it("rejects an array of non-objects", async () => {
    await expect(parseJsonFile(makeFile("primitives.json", "[1, 2, 3]"))).rejects.toThrow(
      CsvValidationError
    );
  });
});
