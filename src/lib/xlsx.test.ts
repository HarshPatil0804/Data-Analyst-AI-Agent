import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseXlsxFile, assertIsXlsxFile } from "./xlsx";
import { CsvValidationError } from "./csv";

function makeWorkbookFile(name: string, sheets: Record<string, unknown[][]>): File {
  const workbook = XLSX.utils.book_new();
  for (const [sheetName, rows] of Object.entries(sheets)) {
    const sheet = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(workbook, sheet, sheetName);
  }
  const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
  return new File([buffer], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("assertIsXlsxFile", () => {
  it("accepts a .xlsx file", () => {
    const file = makeWorkbookFile("data.xlsx", { Sheet1: [["a"], ["1"]] });
    expect(() => assertIsXlsxFile(file)).not.toThrow();
  });

  it("rejects a non-Excel file", () => {
    const file = new File(["a,b"], "data.csv", { type: "text/csv" });
    expect(() => assertIsXlsxFile(file)).toThrow(CsvValidationError);
  });

  it("rejects an empty file", () => {
    const file = new File([], "empty.xlsx", { type: "application/octet-stream" });
    expect(() => assertIsXlsxFile(file)).toThrow(CsvValidationError);
  });
});

describe("parseXlsxFile", () => {
  it("parses a clean sheet and infers column types correctly", async () => {
    const file = makeWorkbookFile("clean.xlsx", {
      Sheet1: [
        ["region", "units_sold", "revenue"],
        ["North", 120, 2400.5],
        ["South", 85, 1700],
      ],
    });

    const result = await parseXlsxFile(file);

    expect(result.totalRows).toBe(2);
    expect(result.warnings).toHaveLength(0);
    expect(result.rows[0]).toEqual({ region: "North", units_sold: "120", revenue: "2400.5" });

    const typeByName = Object.fromEntries(result.columns.map((c) => [c.name, c.type]));
    expect(typeByName.region).toBe("string");
    expect(typeByName.units_sold).toBe("number");
  });

  it("uses the first sheet and warns when there are multiple sheets", async () => {
    const file = makeWorkbookFile("multi.xlsx", {
      First: [["a"], ["1"]],
      Second: [["b"], ["2"]],
    });

    const result = await parseXlsxFile(file);

    expect(result.columns.map((c) => c.name)).toEqual(["a"]);
    expect(result.warnings.some((w) => w.includes("2 sheets"))).toBe(true);
  });

  it("fills a blank header cell with a fallback column name", async () => {
    const file = makeWorkbookFile("blank-header.xlsx", {
      Sheet1: [
        ["a", "", "c"],
        ["1", "2", "3"],
      ],
    });

    const result = await parseXlsxFile(file);
    expect(result.columns.map((c) => c.name)).toEqual(["a", "column_2", "c"]);
  });

  it("rejects a sheet with only a header row and no data", async () => {
    const file = makeWorkbookFile("header-only.xlsx", { Sheet1: [["a", "b"]] });
    await expect(parseXlsxFile(file)).rejects.toThrow(CsvValidationError);
  });
});
