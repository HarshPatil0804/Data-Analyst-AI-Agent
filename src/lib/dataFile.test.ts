import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { parseDataFile } from "./dataFile";
import { CsvValidationError } from "./csv";

describe("parseDataFile", () => {
  it("routes a .csv file to the CSV parser", async () => {
    const file = new File(["a,b\n1,2"], "data.csv", { type: "text/csv" });
    const result = await parseDataFile(file);
    expect(result.columns.map((c) => c.name)).toEqual(["a", "b"]);
  });

  it("routes a .json file to the JSON parser", async () => {
    const file = new File([JSON.stringify([{ a: 1 }])], "data.json", { type: "application/json" });
    const result = await parseDataFile(file);
    expect(result.columns.map((c) => c.name)).toEqual(["a"]);
  });

  it("routes a .xlsx file to the xlsx parser", async () => {
    const workbook = XLSX.utils.book_new();
    const sheet = XLSX.utils.aoa_to_sheet([["a"], ["1"]]);
    XLSX.utils.book_append_sheet(workbook, sheet, "Sheet1");
    const buffer = XLSX.write(workbook, { type: "array", bookType: "xlsx" });
    const file = new File([buffer], "data.xlsx");

    const result = await parseDataFile(file);
    expect(result.columns.map((c) => c.name)).toEqual(["a"]);
  });

  it("rejects an unsupported extension with a clear error", async () => {
    const file = new File(["hello"], "notes.txt", { type: "text/plain" });
    await expect(parseDataFile(file)).rejects.toThrow(CsvValidationError);
  });
});
