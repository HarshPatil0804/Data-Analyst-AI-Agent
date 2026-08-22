import { buildParsedTable, MAX_ACCEPTED_SIZE_BYTES, CsvValidationError, type ParsedCsv } from "./csv";

export function assertIsJsonFile(file: File): void {
  if (!file.name.toLowerCase().endsWith(".json")) {
    throw new CsvValidationError(`"${file.name}" doesn't look like a JSON file. Please upload a .json file.`);
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Only a top-level array of flat-ish objects is supported — this tool works
// on tabular data, and JSON's whole appeal is that it CAN be deeply nested,
// so rather than guess how to flatten an arbitrary shape (and risk silently
// producing something the person didn't intend), a nested value inside a
// row just gets turned into its raw JSON text with a warning, rather than
// the file being rejected outright — the row is still usable, just with
// that one column not fully broken out.
export async function parseJsonFile(file: File): Promise<ParsedCsv> {
  assertIsJsonFile(file);

  let text: string;
  try {
    text = await file.text();
  } catch (err) {
    throw new CsvValidationError(
      `Failed to read "${file.name}": ${err instanceof Error ? err.message : String(err)}`
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    throw new CsvValidationError(
      `"${file.name}" isn't valid JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new CsvValidationError(
      `"${file.name}" needs to be a JSON array of objects, e.g. [{"col1": "a", "col2": 1}, ...]. ` +
        `A single object or an empty array isn't something this tool can turn into a table.`
    );
  }

  if (!data.every(isPlainRecord)) {
    throw new CsvValidationError(
      `"${file.name}" needs to be an array of objects (one per row) — found an entry that isn't a plain object.`
    );
  }

  const records = data as Record<string, unknown>[];

  // JSON objects, unlike a CSV/xlsx header row, aren't guaranteed to share
  // the exact same keys — take the union across every row, in first-seen
  // order, so a row missing an occasional key doesn't get silently dropped
  // as a column, and a row lacking that key just reads as empty for it.
  const rawColumns: string[] = [];
  const seen = new Set<string>();
  for (const record of records) {
    for (const key of Object.keys(record)) {
      if (!seen.has(key)) {
        seen.add(key);
        rawColumns.push(key);
      }
    }
  }

  let nestedValueCount = 0;
  const rows: Record<string, string>[] = records.map((record) => {
    const row: Record<string, string> = {};
    for (const col of rawColumns) {
      const value = record[col];
      if (value === undefined || value === null) {
        row[col] = "";
      } else if (typeof value === "object") {
        nestedValueCount++;
        row[col] = JSON.stringify(value);
      } else {
        row[col] = String(value);
      }
    }
    return row;
  });

  const extraWarnings: string[] = [];
  if (nestedValueCount > 0) {
    extraWarnings.push(
      `${nestedValueCount} cell(s) contained a nested object or array and were kept as raw JSON text ` +
        `rather than broken into separate columns.`
    );
  }

  return buildParsedTable(file.name, rawColumns, rows, { extraWarnings });
}
