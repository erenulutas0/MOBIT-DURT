// Minimal typings for the vendored SheetJS build (src/app/vendor/xlsx.mjs). Only the members the
// app uses are declared.
declare module "*/vendor/xlsx.mjs" {
  export function read(
    data: ArrayBuffer | Uint8Array,
    opts?: { type?: string }
  ): { SheetNames: string[]; Sheets: Record<string, unknown> };
  export function write(
    workbook: unknown,
    opts: { bookType: string; type: "array" }
  ): ArrayBuffer;
  export const utils: {
    sheet_to_html(sheet: unknown, opts?: unknown): string;
    aoa_to_sheet(rows: unknown[][]): unknown;
    book_new(): unknown;
    book_append_sheet(workbook: unknown, sheet: unknown, name: string): void;
  };
}
