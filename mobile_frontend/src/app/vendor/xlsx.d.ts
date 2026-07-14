// Minimal typings for the vendored SheetJS build (src/app/vendor/xlsx.mjs). Only the members the
// app uses are declared.
declare module "*/vendor/xlsx.mjs" {
  export function read(
    data: ArrayBuffer | Uint8Array,
    opts?: { type?: string }
  ): { SheetNames: string[]; Sheets: Record<string, unknown> };
  export const utils: {
    sheet_to_html(sheet: unknown, opts?: unknown): string;
  };
}
