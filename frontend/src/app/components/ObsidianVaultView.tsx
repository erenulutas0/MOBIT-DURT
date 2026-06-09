import { useEffect, useState } from "react";
import { BookOpen, FileText, ExternalLink, FolderOpen, Hash, Clock } from "lucide-react";
import { ApiVaultNote, getVaultNote, getVaultNotes } from "../api";

export function ObsidianVaultView() {
  const [notes, setNotes] = useState<ApiVaultNote[]>([]);
  const [vaultRoot, setVaultRoot] = useState("vault/ihaleler");
  const [selected, setSelected] = useState<ApiVaultNote | null>(null);
  const [content, setContent] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    getVaultNotes()
      .then((data) => {
        setVaultRoot(data.vault_root);
        setNotes(data.notes);
        setSelected(data.notes[0] || null);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selected) {
      setContent("");
      return;
    }
    getVaultNote(selected.path)
      .then((note) => setContent(note.content))
      .catch((err) => setContent(`Not okunamadi: ${err.message}`));
  }, [selected]);

  return (
    <div className="p-5 flex flex-col gap-5 h-full" style={{ fontFamily: "Inter, sans-serif" }}>
      <div className="flex items-center justify-between">
        <div>
          <h1 style={{ fontSize: 16, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Obsidian Vault</h1>
          <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>
            {notes.length} live notes · Vault path: {vaultRoot}
          </p>
          {error && <p style={{ fontSize: 12, color: "var(--warning)", marginTop: 3 }}>{error}</p>}
        </div>
        <button className="flex items-center gap-1.5 px-3 py-1.5 rounded" style={{ border: "1px solid var(--border)", background: "var(--card)", fontSize: 12, cursor: "pointer", color: "var(--foreground)" }}>
          <ExternalLink size={12} />
          Open in Obsidian
        </button>
      </div>

      <div className="flex items-center gap-2 px-4 py-3 rounded" style={{ background: "var(--success-bg)", border: "1px solid #a7f3d0" }}>
        <BookOpen size={14} style={{ color: "var(--success)" }} />
        <span style={{ fontSize: 12, color: "var(--success)", fontWeight: 500 }}>Vault synchronized from project folder</span>
        <span style={{ fontSize: 12, color: "#065f46", marginLeft: 4 }}>· Uses relative repo paths, portable across computers</span>
      </div>

      <div className="grid gap-4 min-h-0 flex-1" style={{ gridTemplateColumns: "minmax(360px, 0.9fr) minmax(420px, 1.1fr)" }}>
        <div className="rounded overflow-hidden min-h-0" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div style={{ borderBottom: "1px solid var(--border)", padding: "10px 16px", background: "var(--muted)" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Vault Notes
            </span>
          </div>
          <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 220px)" }}>
            {notes.length === 0 ? (
              <div style={{ padding: 24, color: "var(--muted-foreground)", fontSize: 13 }}>Henuz Obsidian notu yok.</div>
            ) : notes.map((note, i) => (
              <button
                key={note.path}
                onClick={() => setSelected(note)}
                className="flex items-center gap-3 px-4 py-3 w-full text-left"
                style={{
                  border: "none",
                  borderBottom: i < notes.length - 1 ? "1px solid var(--border)" : "none",
                  background: selected?.path === note.path ? "var(--secondary)" : i % 2 === 0 ? "var(--card)" : "var(--background)",
                  cursor: "pointer",
                }}
              >
                <FileText size={15} style={{ color: "var(--primary)", flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>{note.name}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <FolderOpen size={10} style={{ color: "var(--muted-foreground)" }} />
                    <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "JetBrains Mono, monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {note.path}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <div className="flex items-center gap-1">
                    <Clock size={10} style={{ color: "var(--muted-foreground)" }} />
                    <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "JetBrains Mono, monospace" }}>
                      {new Date(note.updated).toLocaleDateString("tr-TR")}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: "var(--muted-foreground)" }}>{note.linked_files} links</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded min-h-0 flex flex-col" style={{ border: "1px solid var(--border)", background: "var(--card)" }}>
          <div className="flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)", padding: "10px 16px", background: "var(--muted)" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              Markdown Preview
            </span>
            <div className="flex items-center gap-1">
              {(selected?.tags || []).slice(0, 4).map((tag) => (
                <span key={tag} className="flex items-center gap-0.5 px-1.5 py-0.5 rounded" style={{ background: "var(--secondary)", color: "var(--primary)", fontSize: 10 }}>
                  <Hash size={8} />
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <pre
            style={{
              margin: 0,
              padding: 16,
              overflow: "auto",
              flex: 1,
              fontSize: 12,
              lineHeight: 1.55,
              color: "var(--foreground)",
              fontFamily: "JetBrains Mono, Consolas, monospace",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {content || "Bir Obsidian notu secin."}
          </pre>
        </div>
      </div>
    </div>
  );
}
