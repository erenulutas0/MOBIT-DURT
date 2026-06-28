import { useEffect, useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileText,
  Download,
  Info,
  Eye,
} from "lucide-react";
import {
  ApiTreeNode,
  downloadBlob,
  getDashboardTreeFileBlob,
  getFolderTree,
  openBlob,
} from "../api";

type FolderNode = {
  id: string;
  name: string;
  children?: FolderNode[];
  fileCount?: number;
  files?: FileRow[];
};

type FileRow = {
  id: string;
  name: string;
  type: string;
  size: string;
  source: string;
  timestamp: string;
  status: "classified" | "processing" | "unclassified";
  downloadUrl?: string | null;
  viewUrl?: string | null;
};

const statusBadge = {
  classified: { label: "Classified", bg: "var(--success-bg)", color: "var(--success)", border: "#a7f3d0" },
  processing: { label: "Processing", bg: "#fffbeb", color: "#d97706", border: "#fde68a" },
  unclassified: { label: "Unclassified", bg: "#fff1f2", color: "#e11d48", border: "#fecdd3" },
};

function TreeNode({
  node,
  depth,
  selectedId,
  onSelect,
}: {
  node: FolderNode;
  depth: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;
  const isLeaf = !hasChildren;
  const selected = selectedId === node.id;

  return (
    <div>
      <div
        className="flex items-center gap-1.5 rounded cursor-pointer py-1 pr-2 select-none"
        style={{
          paddingLeft: depth * 14 + 8,
          background: selected ? "var(--secondary)" : "transparent",
          color: selected ? "var(--primary)" : "var(--foreground)",
          fontSize: 13,
          fontFamily: "Inter, sans-serif",
        }}
        onClick={() => {
          if (hasChildren) setOpen(!open);
          onSelect(node.id);
        }}
      >
        {hasChildren ? (
          open ? (
            <ChevronDown size={13} style={{ flexShrink: 0, color: "var(--muted-foreground)" }} />
          ) : (
            <ChevronRight size={13} style={{ flexShrink: 0, color: "var(--muted-foreground)" }} />
          )
        ) : (
          <span style={{ width: 13, display: "inline-block", flexShrink: 0 }} />
        )}
        {open && hasChildren ? (
          <FolderOpen size={14} style={{ color: "var(--primary)", flexShrink: 0 }} />
        ) : isLeaf ? (
          <Folder size={14} style={{ color: "#f59e0b", flexShrink: 0 }} />
        ) : (
          <Folder size={14} style={{ color: "var(--primary)", flexShrink: 0 }} />
        )}
        <span className="flex-1 truncate">{node.name}</span>
        {node.fileCount !== undefined && (
          <span
            className="rounded-full px-1.5"
            style={{ background: "var(--muted)", color: "var(--muted-foreground)", fontSize: 10, fontFamily: "JetBrains Mono, monospace" }}
          >
            {node.fileCount}
          </span>
        )}
      </div>
      {open && hasChildren && node.children!.map((child) => (
        <TreeNode key={child.id} node={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  );
}

export function FolderTreeView() {
  const [folderTree, setFolderTree] = useState<FolderNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [fileActionId, setFileActionId] = useState<string | null>(null);
  const files = selectedId ? (findNode(folderTree, selectedId)?.files ?? []) : [];
  const selectedNode = selectedId ? findNode(folderTree, selectedId) : null;

  useEffect(() => {
    getFolderTree()
      .then((tree) => {
        const roots = [toFolderNode(tree.data_originals), toFolderNode(tree.obsidian_vault)];
        setFolderTree(roots);
        setSelectedId(firstFolderWithFiles(roots)?.id || roots[0]?.id || null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Folder tree could not be loaded"));
  }, []);

  async function handleFile(file: FileRow, download: boolean) {
    const target = download ? file.downloadUrl : file.viewUrl || file.downloadUrl;
    if (!target) return;
    setError("");
    setFileActionId(file.id);
    try {
      const blob = await getDashboardTreeFileBlob(target);
      if (download) downloadBlob(blob, file.name);
      else openBlob(blob);
    } catch (err) {
      setError(err instanceof Error ? err.message : "File could not be opened");
    } finally {
      setFileActionId(null);
    }
  }

  return (
    <div className="flex h-full" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Left: tree */}
      <div
        className="flex flex-col"
        style={{ width: 260, borderRight: "1px solid var(--border)", flexShrink: 0, background: "var(--card)" }}
      >
        <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--border)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>Folder Tree</div>
          <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 1 }}>Live data + Obsidian vault</div>
          {error && <div style={{ fontSize: 11, color: "var(--warning)", marginTop: 4 }}>{error}</div>}
        </div>
        <div className="py-2 overflow-y-auto flex-1 px-1">
          {folderTree.map((node) => (
            <TreeNode key={node.id} node={node} depth={0} selectedId={selectedId} onSelect={setSelectedId} />
          ))}
        </div>
      </div>

      {/* Right: contents */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Breadcrumb */}
        <div className="px-5 py-3 flex items-center gap-1.5" style={{ borderBottom: "1px solid var(--border)", background: "var(--card)", flexShrink: 0 }}>
          {selectedId ? (
            <>
              {getPath(folderTree, selectedId).map((seg, i, arr) => (
                <span key={seg} className="flex items-center gap-1.5">
                  <span style={{ fontSize: 12, color: i === arr.length - 1 ? "var(--foreground)" : "var(--muted-foreground)", fontWeight: i === arr.length - 1 ? 500 : 400 }}>
                    {seg}
                  </span>
                  {i < arr.length - 1 && <ChevronRight size={11} style={{ color: "var(--muted-foreground)" }} />}
                </span>
              ))}
            </>
          ) : (
            <span style={{ fontSize: 12, color: "var(--muted-foreground)" }}>Select a folder</span>
          )}
        </div>

        {/* File table */}
        {files.length > 0 ? (
          <div className="overflow-auto flex-1">
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "Inter, sans-serif" }}>
              <thead>
                <tr style={{ background: "var(--muted)" }}>
                  {["Filename", "Type", "Size", "Source", "Uploaded", "Status", "Actions"].map((h) => (
                    <th
                      key={h}
                      style={{
                        textAlign: "left",
                        padding: "8px 14px",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--muted-foreground)",
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                        position: "sticky",
                        top: 0,
                        background: "var(--muted)",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {files.map((file, i) => {
                  const badge = statusBadge[file.status];
                  return (
                    <tr
                      key={file.id}
                      style={{
                        background: i % 2 === 0 ? "var(--card)" : "var(--background)",
                        borderBottom: "1px solid var(--border)",
                      }}
                    >
                      <td style={{ padding: "9px 14px" }}>
                        <div className="flex items-center gap-2">
                          <FileText size={13} style={{ color: "var(--primary)", flexShrink: 0 }} />
                          <span style={{ fontWeight: 500, color: "var(--foreground)" }}>{file.name}</span>
                        </div>
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "var(--muted-foreground)" }}>{file.type}</span>
                      </td>
                      <td style={{ padding: "9px 14px", fontFamily: "JetBrains Mono, monospace", color: "var(--muted-foreground)" }}>{file.size}</td>
                      <td style={{ padding: "9px 14px" }}>
                        <span className="px-2 py-0.5 rounded" style={{ background: "var(--muted)", fontSize: 11, color: "var(--muted-foreground)" }}>
                          {file.source}
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px", color: "var(--muted-foreground)", whiteSpace: "nowrap", fontFamily: "JetBrains Mono, monospace", fontSize: 11 }}>
                        {file.timestamp}
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <span
                          className="px-2 py-0.5 rounded"
                          style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, fontSize: 11, whiteSpace: "nowrap" }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: "9px 14px" }}>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={!file.downloadUrl || fileActionId === file.id}
                            onClick={() => handleFile(file, true)}
                            title="Download"
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 2 }}
                          >
                            <Download size={14} />
                          </button>
                          <button title="Metadata" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 2 }}>
                            <Info size={14} />
                          </button>
                          <button
                            type="button"
                            disabled={(!file.viewUrl && !file.downloadUrl) || fileActionId === file.id}
                            onClick={() => handleFile(file, false)}
                            title="Open / Preview"
                            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 2 }}
                          >
                            <Eye size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : selectedId ? (
          <div className="flex flex-col items-center justify-center flex-1 gap-3" style={{ color: "var(--muted-foreground)" }}>
            <Folder size={40} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: 13 }}>This folder contains subfolders — select a tender workspace to view files.</div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 gap-3" style={{ color: "var(--muted-foreground)" }}>
            <FolderOpen size={40} style={{ opacity: 0.3 }} />
            <div style={{ fontSize: 13 }}>Select a folder from the tree to view its contents.</div>
          </div>
        )}
      </div>
    </div>
  );
}

function toFolderNode(node: ApiTreeNode): FolderNode {
  const childFolders = node.children.filter((child) => child.type !== "file").map(toFolderNode);
  const files = node.children
    .filter((child) => child.type === "file")
    .map((child, index) => ({
      id: `${node.path}-${index}`,
      name: child.name,
      type: child.name.includes(".") ? child.name.split(".").pop()!.toUpperCase() : "FILE",
      size: child.size ? `${(child.size / 1024).toFixed(1)} KB` : "-",
      source: node.path.startsWith("ihaleler") ? "Obsidian" : "Local",
      timestamp: "-",
      status: "classified" as const,
      downloadUrl: child.download_url,
      viewUrl: child.view_url,
    }));
  return {
    id: node.path || node.name,
    name: node.name,
    children: childFolders,
    files,
    fileCount: files.length || undefined,
  };
}

function firstFolderWithFiles(nodes: FolderNode[]): FolderNode | null {
  for (const node of nodes) {
    if (node.files?.length) return node;
    const found = firstFolderWithFiles(node.children || []);
    if (found) return found;
  }
  return null;
}

function findNode(nodes: FolderNode[], id: string): FolderNode | null {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children) {
      const found = findNode(n.children, id);
      if (found) return found;
    }
  }
  return null;
}

function getPath(nodes: FolderNode[], id: string, path: string[] = []): string[] {
  for (const n of nodes) {
    const curr = [...path, n.name];
    if (n.id === id) return curr;
    if (n.children) {
      const found = getPath(n.children, id, curr);
      if (found.length) return found;
    }
  }
  return [];
}
