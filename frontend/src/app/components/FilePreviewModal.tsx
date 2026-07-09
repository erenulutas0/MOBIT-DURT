import { FileText, Download, X } from "lucide-react";
import {
  downloadBlob,
} from "../api";
import type { FilePreview } from "../lib/types";

export function FilePreviewModal({ preview, onClose }: { preview: FilePreview; onClose: () => void }) {
  const lowerName = preview.filename.toLowerCase();
  const isImage = preview.mimeType.startsWith("image/");
  const isPdf = preview.mimeType === "application/pdf" || lowerName.endsWith(".pdf");
  const isText = preview.mimeType.startsWith("text/")
    || lowerName.endsWith(".txt")
    || lowerName.endsWith(".csv")
    || lowerName.endsWith(".md")
    || lowerName.endsWith(".json");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60" onMouseDown={(event) => event.currentTarget === event.target && onClose()}>
      <div className="flex h-[86vh] w-[min(980px,calc(100vw-32px))] flex-col overflow-hidden rounded border border-border bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-slate-50 px-4 py-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">{preview.title}</h3>
            <p className="mt-0.5 truncate text-[10px] text-muted-foreground">{preview.filename} · {preview.mimeType || "application/octet-stream"}</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              title="İndir"
              onClick={() => downloadBlob(preview.blob, preview.filename)}
              className="rounded p-1.5 text-slate-500 hover:bg-white hover:text-teal-600"
            >
              <Download className="h-4 w-4" />
            </button>
            <button title="Kapat" onClick={onClose} className="rounded p-1.5 text-slate-500 hover:bg-white hover:text-slate-700">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-hidden bg-slate-100">
          {isImage ? (
            <div className="flex h-full items-center justify-center p-4">
              <img src={preview.url} alt={preview.filename} className="max-h-full max-w-full rounded border border-border bg-white object-contain" />
            </div>
          ) : isPdf || isText ? (
            <iframe title={preview.filename} src={preview.url} className="h-full w-full border-0 bg-white" />
          ) : (
            <div className="flex h-full items-center justify-center p-8">
              <div className="max-w-sm rounded border border-border bg-white p-5 text-center">
                <FileText className="mx-auto mb-3 h-8 w-8 text-slate-400" />
                <p className="text-sm font-semibold text-foreground">Bu dosya tipi panel içinde önizlenemiyor.</p>
                <p className="mt-1 text-xs text-muted-foreground">Dosyayı indirme düğmesiyle açabilirsiniz.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
