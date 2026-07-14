import { useEffect, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";

type OfficeKind = "docx" | "xlsx" | "unsupported";

function officeKind(name: string, type: string): OfficeKind {
  const lower = (name || "").toLowerCase();
  if (lower.endsWith(".docx") || type.includes("wordprocessingml")) return "docx";
  if (
    lower.endsWith(".xlsx") ||
    lower.endsWith(".xls") ||
    type.includes("spreadsheetml") ||
    type.includes("ms-excel")
  ) {
    return "xlsx";
  }
  return "unsupported";
}

export function isOfficeDocument(name: string, type: string): boolean {
  return officeKind(name, type) !== "unsupported";
}

// Renders docx (via mammoth) and xlsx/xls (via SheetJS) as HTML. The converted markup comes from
// an untrusted uploaded file, so it is displayed inside a script-less sandboxed iframe — the
// content renders but cannot execute JavaScript, neutralising any embedded XSS payload.
export function OfficeDocPreview({
  url,
  name,
  type,
  onDownload,
}: {
  url: string;
  name: string;
  type: string;
  onDownload: () => void;
}) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [doc, setDoc] = useState("");
  const kind = officeKind(name, type);

  useEffect(() => {
    let active = true;
    if (kind === "unsupported") {
      setState("error");
      return;
    }
    setState("loading");
    (async () => {
      try {
        const buffer = await (await fetch(url)).arrayBuffer();
        let body: string;
        if (kind === "docx") {
          const mammoth = await import("mammoth");
          const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
          body = result.value || "<p>(Belge boş görünüyor.)</p>";
        } else {
          // Vendored SheetJS (patched 0.20.3) — imported from the repo, not npm, because the
          // patched build lives only on the SheetJS CDN (which CI can't fetch) and the npm
          // `xlsx` package has unpatched advisories.
          const XLSX = await import("../vendor/xlsx.mjs");
          const workbook = XLSX.read(buffer, { type: "array" });
          body = workbook.SheetNames
            .map(sheetName => `<h3>${sheetName}</h3>${XLSX.utils.sheet_to_html(workbook.Sheets[sheetName])}`)
            .join("");
        }
        if (active) {
          setDoc(wrapHtml(body));
          setState("ready");
        }
      } catch {
        if (active) setState("error");
      }
    })();
    return () => {
      active = false;
    };
  }, [url, kind]);

  if (state === "loading") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-muted-foreground">
        <Loader2 className="w-6 h-6 animate-spin" />
        <p className="text-sm">Belge açılıyor…</p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
        <FileText className="w-10 h-10 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Bu belge önizlenemedi. İndirip cihazınızda açabilirsiniz.</p>
        <button
          onClick={onDownload}
          className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"
        >
          <Download className="w-4 h-4" /> İndir
        </button>
      </div>
    );
  }

  return (
    <iframe
      sandbox=""
      srcDoc={doc}
      title={name}
      className="w-full h-full border-0 bg-white"
    />
  );
}

function wrapHtml(body: string): string {
  return (
    "<!doctype html><html><head><meta charset=\"utf-8\">" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
    "<style>" +
    "body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:14px;color:#111;background:#fff;line-height:1.5;font-size:14px}" +
    "table{border-collapse:collapse;width:100%;overflow-x:auto;display:block}" +
    "td,th{border:1px solid #ccc;padding:5px 8px;font-size:13px;white-space:nowrap}" +
    "h1,h2,h3{margin:16px 0 8px}img{max-width:100%;height:auto}p{margin:8px 0}" +
    "</style></head><body>" +
    body +
    "</body></html>"
  );
}
