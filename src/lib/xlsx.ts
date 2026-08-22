import * as XLSX from "xlsx";
import { buildParsedTable, MAX_ACCEPTED_SIZE_BYTES, CsvValidationError, type ParsedCsv } from "./csv";

export function assertIsXlsxFile(file: File): void {
  const lower = file.name.toLowerCase();
  if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) {
    throw new CsvValidationError(
      `"${file.name}" doesn't look like an Excel file. Please upload a .xlsx or .xls file.`
    );
  }
  if (file.size === 0) {
    throw new CsvValidationError(`"${file.name}" is empty.`);
  }
  if (file.size > MAX_ACCEPTED_SIZE_BYTES) {
    throw new CsvValidationError(
      `"${file.name}" is larger than 25MB. Try a smaller file for this demo.`
    );
  }
}

export async function parseXlsxFile(file: File): Promise<ParsedCsv> {
  assertIsXlsxFile(file);

  let workbook: XLSX.WorkBook;
  try {
    const buffer = await file.arrayBuffer();
    workbook = XLSX.read(buffer, { type: "array" });
  } catch (err) {
    throw new CsvValidationError(
      `Failed to read "${file.name}": ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (workbook.SheetNames.length === 0) {
    throw new CsvValidationError(`"${file.name}" doesn't contain any sheets.`);
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];

  // header: 1 gives an array of arrays (row 0 = header) instead of guessing
  // column names itself; raw: false formats values as their DISPLAYED
  // string (e.g. a date cell becomes "2024-01-30", not an Excel serial
  // number) so this flows through the exact same string-based type
  // inference the CSV path already uses — no separate number/date handling
  // needed for this format.
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    blankrows: false,
  });

  if (grid.length < 2) {
    throw new CsvValidationError(
      `Couldn't find any data in "${file.name}". Check that it has a header row and at least one data row.`
    );
  }

  const [headerRow, ...dataRows] = grid;
  const rawColumns = headerRow.map((cell, i) => {
    const name = String(cell ?? "").trim();
    return name || `column_${i + 1}`; // guard against a blank header cell
  });

  const rows: Record<string, string>[] = dataRows.map((row) =>
    Object.fromEntries(rawColumns.map((col, i) => [col, String(row[i] ?? "")]))
  );

  const extraWarnings: string[] = [];
  if (workbook.SheetNames.length > 1) {
    extraWarnings.push(
      `This file has ${workbook.SheetNames.length} sheets — only "${sheetName}" (the first one) was loaded.`
    );
  }

  return buildParsedTable(file.name, rawColumns, rows, { extraWarnings });
}
