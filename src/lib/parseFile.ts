import Papa from "papaparse";
import * as XLSX from "xlsx";

export type ParsedRow = Record<string, string | number | boolean | null>;

export async function parseFile(file: File): Promise<{ rows: ParsedRow[]; columns: string[] }> {
  const ext = file.name.split(".").pop()?.toLowerCase();

  if (ext === "csv") {
    return new Promise((resolve, reject) => {
      Papa.parse<ParsedRow>(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data.filter((row) => Object.keys(row).length > 0);
          resolve({ rows, columns: results.meta.fields ?? [] });
        },
        error: (error) => reject(error)
      });
    });
  }

  if (ext === "xlsx" || ext === "xls") {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    if (workbook.SheetNames.length === 0) return { rows: [], columns: [] };
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<ParsedRow>(firstSheet, { defval: null });
    return { rows, columns: Object.keys(rows[0] ?? {}) };
  }

  throw new Error("Unsupported file type");
}
