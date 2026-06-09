export type ApiDocument = {
  id: number;
  source: string;
  timestamp: string;
  mime_type: string | null;
  original_filename: string | null;
  stored_filename: string | null;
  file_size: number | null;
  internal_unit: string | null;
  organization: string | null;
  year: number | null;
  tender_id: string;
  document_type: string;
  status: string;
  file_path: string | null;
};

export type ApiTender = {
  id: number;
  tender_id: string;
  organization: string;
  year: number;
  sequence: number;
  internal_unit: string | null;
  title: string | null;
  status: string;
  created_at: string;
};

export type ApiTreeNode = {
  name: string;
  path: string;
  type: "folder" | "file" | "missing";
  size?: number | null;
  children: ApiTreeNode[];
};

export type ApiTree = {
  data_originals: ApiTreeNode;
  obsidian_vault: ApiTreeNode;
};

export type ApiVaultNote = {
  name: string;
  path: string;
  updated: string;
  linked_files: number;
  tags: string[];
};

export type ApiVaultNotes = {
  vault_root: string;
  notes: ApiVaultNote[];
};

export async function getDocuments(): Promise<ApiDocument[]> {
  const response = await fetch("/api/documents");
  if (!response.ok) throw new Error("Documents could not be loaded");
  return response.json();
}

export async function getTenders(): Promise<ApiTender[]> {
  const response = await fetch("/api/tenders");
  if (!response.ok) throw new Error("Tenders could not be loaded");
  return response.json();
}

export async function getFolderTree(): Promise<ApiTree> {
  const response = await fetch("/api/dashboard/tree");
  if (!response.ok) throw new Error("Folder tree could not be loaded");
  return response.json();
}

export async function getVaultNotes(): Promise<ApiVaultNotes> {
  const response = await fetch("/api/dashboard/vault/notes");
  if (!response.ok) throw new Error("Vault notes could not be loaded");
  return response.json();
}

export async function getVaultNote(path: string): Promise<{ path: string; content: string }> {
  const response = await fetch(`/api/dashboard/vault/notes/${encodeURI(path)}`);
  if (!response.ok) throw new Error("Vault note could not be loaded");
  return response.json();
}

export function formatBytes(value: number | null | undefined): string {
  if (!value) return "-";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function fileType(document: ApiDocument): string {
  const name = document.stored_filename || document.original_filename || "";
  const extension = name.includes(".") ? name.split(".").pop() : "";
  return (extension || document.mime_type || "FILE").toUpperCase();
}

export function displayStatus(status: string): "classified" | "processing" | "unclassified" {
  if (status === "stored" || status === "duplicate") return "classified";
  if (status === "received") return "processing";
  return "unclassified";
}
