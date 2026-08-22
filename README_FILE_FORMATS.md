# xlsx / JSON file upload support

Unzip at project root, folders mirror the real structure.

| Path | Status |
|---|---|
| `src/lib/xlsx.ts` | **new** |
| `src/lib/xlsx.test.ts` | **new** — 7 tests |
| `src/lib/json.ts` | **new** |
| `src/lib/json.test.ts` | **new** — 11 tests |
| `src/lib/dataFile.ts` | **new** — the dispatcher, routes by extension |
| `src/lib/dataFile.test.ts` | **new** — 4 tests |
| `src/lib/csv.ts` | overwrite — refactored to export shared helpers, CSV behavior unchanged (15 existing tests still pass) |
| `src/hooks/useCsvData.ts` | overwrite — one-line switch to the new dispatcher |
| `src/components/FileUpload.tsx` | overwrite — accepts `.xlsx`, `.xls`, `.json`, updated copy |
| `package.json` | overwrite — adds `xlsx` (SheetJS) |

No env vars, no setup. `npm install`, done.

## How it works

Every format (CSV, xlsx, JSON) gets parsed into the exact same internal
shape (`ParsedCsv` — fileName, columns, rows, warnings) by its own
dedicated parser, then handed to the same DuckDB/Pyodide pipeline that
already existed. Nothing downstream of `dataFile.ts` needed to change at
all — the whole rest of the app has no idea what format the data came from.

- **xlsx/xls**: first sheet only (a warning is added if the file has more
  than one); dates/numbers come through as their *displayed* string, same
  as CSV, so the existing type-inference logic works unchanged
- **JSON**: expects a top-level array of flat objects (`[{...}, {...}]`).
  Rows with inconsistent keys are handled — missing keys read as empty
  string. A nested object/array inside a cell gets kept as raw JSON text
  with a warning, rather than the whole file being rejected

## Bundle size — checked, not just assumed fine

`xlsx` (SheetJS) is a large library. It's dynamically imported inside
`dataFile.ts`, not statically at the top — so it only downloads when
someone actually uploads an Excel file. Verified with a real build:
main bundle stayed at ~327KB (unchanged from before this feature),
`xlsx` landed in its own separate ~333KB chunk. CSV and JSON uploads never
touch it.

## Verified before packaging
- `npx tsc --noEmit` — clean
- `npx vitest run` — 246/264 passing (18 pre-existing unrelated failures,
  same as flagged in earlier zips — not touched by this change)
- `npm run build` — clean, no bundle-size warning
