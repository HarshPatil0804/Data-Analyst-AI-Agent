import { parseCsvFile, CsvValidationError, type ParsedCsv } from "./csv";
import { parseJsonFile } from "./json";

export const SUPPORTED_EXTENSIONS = [".csv", ".xlsx", ".xls", ".json"] as const;

/**
 * Routes a file to the right format-specific parser based on its extension.
 * Every parser produces the exact same ParsedCsv shape, so nothing
 * downstream (DuckDB, Pyodide, the schema/query layer, the UI) needs to
 * know or care which format the data actually came from — this dispatcher
 * is the ONLY place that decision gets made.
 *
 * The xlsx parser is imported dynamically, not at the top of this file.
 * SheetJS (the `xlsx` package) is a large library, and CSV/JSON uploads
 * are the common case — statically importing it would put its full weight
 * in the main bundle for every visitor, even someone who never touches an
 * Excel file. A dynamic import means that cost is only ever paid by
 * someone who actually uploads a .xlsx/.xls file.
 */
export async function parseDataFile(file: File): Promise<ParsedCsv> {
  const lower = file.name.toLowerCase();

  if (lower.endsWith(".csv")) return parseCsvFile(file);
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const { parseXlsxFile } = await import("./xlsx");
    return parseXlsxFile(file);
  }
  if (lower.endsWith(".json")) return parseJsonFile(file);

  throw new CsvValidationError(
    `"${file.name}" isn't a supported file type. Please upload a ${SUPPORTED_EXTENSIONS.join(", ")} file.`
  );
}
