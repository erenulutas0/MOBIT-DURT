import { useEffect, useState } from "react";
import { Upload, ChevronRight, ChevronDown, Search, Download, Folder, File } from "lucide-react";
import {
  ApiTreeNode,
  formatBytes,
  getDashboardTreeFileBlob,
} from "../api";
import type { LiveData, FilePreview } from "../lib/types";
import { createFilePreview } from "../lib/helpers";
import { FilePreviewModal } from "../components/FilePreviewModal";

// ─── FOLDER TREE ──────────────────────────────────────────────────────────────
export function FolderTreePage({ live }: { live: LiveData }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({ originals: true, ihaleler: true });
  const [selectedPath, setSelectedPath] = useState<string>("");
  const [treeError, setTreeError] = useState("");
  const [previewFile, setPreviewFile] = useState<FilePreview | null>(null);
  const toggle = (key: string) => setExpanded(p => ({ ...p, [key]: !p[key] }));
  const roots = [live.folderTree?.data_originals, live.folderTree?.obsidian_vault].filter(Boolean) as ApiTreeNode[];
  const flattenTree = (node: ApiTreeNode, depth = 0, parent?: string): Array<ApiTreeNode & { depth: number; parent?: string }> => {
    const current = [{ ...node, depth, parent }];
    if (expanded[node.path] || depth === 0) {
      return [...current, ...node.children.flatMap((child) => flattenTree(child, depth + 1, node.path))];
    }
    return current;
  };
  const rows = roots.flatMap((root) => flattenTree(root));
  const selectedNode = rows.find((row) => row.path === selectedPath) || roots[0];
  const selectedChildren = selectedNode?.children || [];

  useEffect(() => {
    return () => {
      if (previewFile) URL.revokeObjectURL(previewFile.url);
    };
  }, [previewFile]);

  async function openTreeFile(item: ApiTreeNode) {
    if (!item.view_url) return;
    setTreeError("");
    try {
      const blob = await getDashboardTreeFileBlob(item.view_url);
      setPreviewFile((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return createFilePreview(blob, item.name, item.name);
      });
    } catch (error) {
      setTreeError(error instanceof Error ? error.message : "Dosya açılamadı.");
    }
  }

  return (
    <div className="p-6 flex gap-4 h-[calc(100vh-112px)]">
      <div className="w-72 bg-white border border-border rounded flex flex-col shrink-0">
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <Search className="w-3.5 h-3.5 text-slate-400" />
          <input placeholder="Klasörde ara..." className="text-xs bg-transparent outline-none flex-1" />
        </div>
        <div className="flex-1 overflow-y-auto p-2 font-mono text-xs">
          {rows.length === 0 && <div className="p-3 text-[11px] text-muted-foreground">Klasör ağacı yüklenemedi veya boş.</div>}
          {rows.map((item, i) => (
            <div key={i}
              style={{ paddingLeft: item.depth * 16 + 8 }}
              onClick={() => setSelectedPath(item.path)}
              className={`flex items-center gap-1.5 py-1 rounded cursor-pointer hover:bg-slate-50 transition-colors ${selectedPath === item.path ? "bg-teal-50 text-teal-700" : "text-foreground"}`}>
              {item.type === "folder" && item.children.length > 0 ? (
                <button onClick={(event) => { event.stopPropagation(); toggle(item.path); }} className="shrink-0">
                  {expanded[item.path]
                    ? <ChevronDown className="w-3 h-3 text-slate-400" />
                    : <ChevronRight className="w-3 h-3 text-slate-400" />}
                </button>
              ) : <div className="w-3 shrink-0" />}
              {item.type === "folder"
                ? <Folder className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                : <File className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
              <span className="truncate text-[11px]">{item.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex-1 bg-white border border-border rounded flex flex-col">
        {treeError && <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{treeError}</div>}
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-border text-[10px] text-muted-foreground font-mono">
          {(selectedNode?.path || "data").split(/[\\/]/).filter(Boolean).slice(-5).map((part, index, parts) => (
            <span key={part + index} className="flex items-center gap-1.5">
              <span className={index === parts.length - 1 ? "text-foreground font-semibold" : ""}>{part}</span>
              {index < parts.length - 1 && <ChevronRight className="w-3 h-3" />}
            </span>
          ))}
        </div>
        <div className="flex-1 p-4">
          <div className="grid grid-cols-4 gap-3">
            {selectedChildren.length === 0 && <div className="col-span-4 text-xs text-muted-foreground">Bu klasörde alt öğe yok.</div>}
            {selectedChildren.map((item, i) => (
              <div key={i} onClick={() => item.type === "folder" ? setSelectedPath(item.path) : openTreeFile(item)} className="border border-border rounded p-3 hover:border-teal-300 cursor-pointer transition-all hover:shadow-sm">
                {item.type === "folder" ? <Folder className="w-8 h-8 text-amber-400 mb-2" /> : <File className="w-8 h-8 text-slate-400 mb-2" />}
                <p className="text-[10px] font-mono font-medium text-foreground break-all">{item.name}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{item.type === "folder" ? `${item.children.length} öğe` : formatBytes(item.size)}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="border-t border-border px-4 py-3 flex items-center gap-3">
          <button disabled title="Java upload migration is pending" className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded px-3 py-1.5 opacity-50 cursor-not-allowed">
            <Upload className="w-3.5 h-3.5" /> Yükle
          </button>
          <button disabled title="Bulk download is not available yet" className="flex items-center gap-1.5 text-xs text-muted-foreground border border-border rounded px-3 py-1.5 opacity-50 cursor-not-allowed">
            <Download className="w-3.5 h-3.5" /> Tümünü İndir
          </button>
        </div>
      </div>
      {previewFile && (
        <FilePreviewModal
          preview={previewFile}
          onClose={() => {
            URL.revokeObjectURL(previewFile.url);
            setPreviewFile(null);
          }}
        />
      )}
    </div>
  );
}

