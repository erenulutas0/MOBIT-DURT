import { useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Brain,
  Download,
  ExternalLink,
  FileText,
  Folder,
  GitBranch,
  Hash,
  Link2,
  Network,
  Paperclip,
  Search,
} from "lucide-react";
import { ApiVaultNote, getVaultNote, getVaultNotes } from "../api";

function pathParts(path: string) {
  return path.split(/[\\/]/).filter(Boolean);
}

function ObsidianGraph() {
  return (
    <div style={{ height: 170, background: "#13131f", border: "1px solid rgba(255,255,255,.06)", borderRadius: 4, overflow: "hidden" }}>
      <svg width="100%" height="100%" viewBox="0 0 260 170">
        <line x1="130" y1="80" x2="62" y2="42" stroke="#7c3aed" strokeOpacity=".45" />
        <line x1="130" y1="80" x2="202" y2="42" stroke="#2563eb" strokeOpacity=".45" />
        <line x1="130" y1="80" x2="58" y2="128" stroke="#d97706" strokeOpacity=".45" />
        <line x1="130" y1="80" x2="204" y2="128" stroke="#059669" strokeOpacity=".45" />
        <line x1="130" y1="80" x2="130" y2="142" stroke="#0d9488" strokeOpacity=".45" />
        <circle cx="130" cy="80" r="24" fill="#0d9488" fillOpacity=".28" stroke="#5eead4" />
        <text x="130" y="84" textAnchor="middle" fill="#ccfbf1" fontSize="9">Tender</text>
        <circle cx="62" cy="42" r="16" fill="#7c3aed" fillOpacity=".22" stroke="#a78bfa" />
        <text x="62" y="46" textAnchor="middle" fill="#ddd6fe" fontSize="8">Şube</text>
        <circle cx="202" cy="42" r="17" fill="#2563eb" fillOpacity=".22" stroke="#93c5fd" />
        <text x="202" y="46" textAnchor="middle" fill="#bfdbfe" fontSize="8">Kurum</text>
        <circle cx="58" cy="128" r="15" fill="#d97706" fillOpacity=".22" stroke="#fcd34d" />
        <text x="58" y="132" textAnchor="middle" fill="#fde68a" fontSize="8">Görev</text>
        <circle cx="204" cy="128" r="15" fill="#059669" fillOpacity=".22" stroke="#6ee7b7" />
        <text x="204" y="132" textAnchor="middle" fill="#bbf7d0" fontSize="8">Belge</text>
        <circle cx="130" cy="142" r="12" fill="#0f172a" stroke="#64748b" />
        <text x="130" y="146" textAnchor="middle" fill="#cbd5e1" fontSize="7">AI</text>
      </svg>
    </div>
  );
}

export function ObsidianVaultView() {
  const [notes, setNotes] = useState<ApiVaultNote[]>([]);
  const [vaultRoot, setVaultRoot] = useState("vault/ihaleler");
  const [selected, setSelected] = useState<ApiVaultNote | null>(null);
  const [content, setContent] = useState("");
  const [query, setQuery] = useState("");
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

  const filteredNotes = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return notes;
    return notes.filter((note) => `${note.name} ${note.path} ${(note.tags || []).join(" ")}`.toLocaleLowerCase("tr-TR").includes(needle));
  }, [notes, query]);

  const selectedParts = selected ? pathParts(selected.path) : [];
  const selectedTags = selected?.tags || [];

  return (
    <div style={{ height: "100%", minHeight: 0, display: "grid", gridTemplateColumns: "280px minmax(440px, 1fr) 300px", background: "#0b1020", color: "#d8dee9", fontFamily: "Inter, sans-serif" }}>
      <aside style={{ borderRight: "1px solid rgba(255,255,255,.08)", background: "#0f172a", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <BookOpen size={16} color="#5eead4" />
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#f8fafc" }}>Obsidian Demo</div>
              <div style={{ fontSize: 10, color: "#64748b" }}>{notes.length} not · {vaultRoot}</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, background: "#111827", border: "1px solid rgba(255,255,255,.08)", borderRadius: 4, padding: "7px 9px" }}>
            <Search size={13} color="#64748b" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Vault içinde ara..."
              style={{ flex: 1, minWidth: 0, background: "transparent", border: 0, outline: 0, color: "#e2e8f0", fontSize: 12 }}
            />
          </div>
          {error && <div style={{ color: "#fbbf24", fontSize: 11, marginTop: 8 }}>{error}</div>}
        </div>

        <div style={{ padding: 10, overflow: "auto", minHeight: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#94a3b8", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", margin: "4px 0 8px" }}>
            <Folder size={13} /> Vault Ağacı
          </div>
          {filteredNotes.length === 0 ? (
            <div style={{ fontSize: 12, color: "#64748b", padding: 10 }}>Not bulunamadı.</div>
          ) : filteredNotes.map((note) => {
            const active = selected?.path === note.path;
            const parts = pathParts(note.path);
            return (
              <button
                key={note.path}
                onClick={() => setSelected(note)}
                style={{
                  width: "100%",
                  border: 0,
                  borderRadius: 4,
                  background: active ? "rgba(13,148,136,.18)" : "transparent",
                  color: active ? "#5eead4" : "#cbd5e1",
                  padding: "8px 8px",
                  cursor: "pointer",
                  textAlign: "left",
                  marginBottom: 2,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <FileText size={13} />
                  <span style={{ fontSize: 12, fontWeight: active ? 750 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{note.name}</span>
                </div>
                <div style={{ fontSize: 10, color: active ? "#99f6e4" : "#64748b", marginTop: 3, paddingLeft: 20, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {parts.slice(0, -1).join(" / ") || "root"}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      <main style={{ minHeight: 0, display: "flex", flexDirection: "column", background: "#111827" }}>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,.08)", display: "flex", alignItems: "center", gap: 10 }}>
          <FileText size={16} color="#5eead4" />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 800, color: "#f8fafc", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {selected?.name || "Bir not seçin"}
            </div>
            <div style={{ fontSize: 10, color: "#64748b", fontFamily: "JetBrains Mono, Consolas, monospace" }}>
              {selected?.path || "vault"}
            </div>
          </div>
          <button style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid rgba(255,255,255,.08)", background: "#0f172a", color: "#cbd5e1", borderRadius: 4, padding: "6px 10px", fontSize: 11 }}>
            <ExternalLink size={12} /> Obsidian'da Aç
          </button>
        </div>

        <div style={{ padding: 18, overflow: "auto", minHeight: 0 }}>
          <div style={{ background: "#0f172a", border: "1px solid rgba(255,255,255,.08)", borderRadius: 4, padding: 16, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <GitBranch size={14} color="#5eead4" />
              <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em" }}>Frontmatter & Bağlantılar</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
              {[
                ["Yıl", selectedParts.find((part) => /^20\d{2}$/.test(part)) || "2026"],
                ["Şube", selectedParts[2] || "MOBIT"],
                ["İhale", selectedParts[selectedParts.length - 2] || "INBOX"],
                ["Link", `${selected?.linked_files ?? 0}`],
              ].map(([label, value]) => (
                <div key={label} style={{ background: "#111827", border: "1px solid rgba(255,255,255,.06)", borderRadius: 4, padding: 10 }}>
                  <div style={{ fontSize: 10, color: "#64748b" }}>{label}</div>
                  <div style={{ fontSize: 12, fontWeight: 800, color: "#e2e8f0", marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
                </div>
              ))}
            </div>
          </div>

          <pre
            style={{
              margin: 0,
              background: "#0f172a",
              border: "1px solid rgba(255,255,255,.08)",
              borderRadius: 4,
              padding: 18,
              minHeight: 420,
              fontSize: 12,
              lineHeight: 1.62,
              color: "#dbeafe",
              fontFamily: "JetBrains Mono, Consolas, monospace",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
            }}
          >
            {content || "Bir Obsidian notu seçin."}
          </pre>
        </div>
      </main>

      <aside style={{ borderLeft: "1px solid rgba(255,255,255,.08)", background: "#0f172a", minHeight: 0, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: 14, borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, fontWeight: 800, color: "#f8fafc" }}>
            <Network size={15} color="#5eead4" /> Graph Görünümü
          </div>
        </div>
        <div style={{ padding: 10 }}>
          <ObsidianGraph />
        </div>

        <div style={{ padding: "12px 14px", borderTop: "1px solid rgba(255,255,255,.08)", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Etiketler</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {(selectedTags.length ? selectedTags : ["ihale", "dokuman", "vault"]).slice(0, 8).map((tag) => (
              <span key={tag} style={{ display: "inline-flex", alignItems: "center", gap: 4, background: "rgba(13,148,136,.12)", color: "#5eead4", border: "1px solid rgba(94,234,212,.18)", borderRadius: 4, padding: "4px 6px", fontSize: 10 }}>
                <Hash size={9} /> {tag}
              </span>
            ))}
          </div>
        </div>

        <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Backlinks</div>
          {["[[ERP Görevleri]]", "[[Telegram Grubu]]", "[[İhale Belgeleri]]", "[[Maliyet Karşılaştırma]]"].map((link) => (
            <div key={link} style={{ display: "flex", alignItems: "center", gap: 6, color: "#5eead4", fontSize: 11, padding: "5px 0" }}>
              <Link2 size={11} /> {link}
            </div>
          ))}
        </div>

        <div style={{ padding: "12px 14px", borderBottom: "1px solid rgba(255,255,255,.08)" }}>
          <div style={{ fontSize: 10, color: "#64748b", fontWeight: 800, textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 8 }}>Meta Veri</div>
          {[
            ["Güncelleme", selected ? new Date(selected.updated).toLocaleDateString("tr-TR") : "-"],
            ["Bağlı dosya", String(selected?.linked_files ?? 0)],
            ["Not sayısı", String(notes.length)],
            ["Vault", vaultRoot],
          ].map(([label, value]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 11, padding: "6px 0", borderBottom: "1px solid rgba(255,255,255,.04)" }}>
              <span style={{ color: "#64748b" }}>{label}</span>
              <span style={{ color: "#cbd5e1", textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</span>
            </div>
          ))}
        </div>

        <div style={{ padding: 14, marginTop: "auto" }}>
          <div style={{ background: "rgba(13,148,136,.12)", border: "1px solid rgba(94,234,212,.18)", borderRadius: 4, padding: 10, color: "#99f6e4", fontSize: 11, lineHeight: 1.45 }}>
            <Brain size={14} style={{ marginBottom: 6 }} />
            AI önerisi: Bu ihale notundan görev oluşturup ilgili dokümanları ERP görev kartına bağlayabilirsin.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
            <button style={{ border: "1px solid rgba(255,255,255,.08)", background: "#111827", color: "#cbd5e1", borderRadius: 4, padding: "8px 6px", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              <Download size={12} /> İndir
            </button>
            <button style={{ border: 0, background: "#0d9488", color: "#fff", borderRadius: 4, padding: "8px 6px", fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
              <Paperclip size={12} /> Göreve Ekle
            </button>
          </div>
        </div>
      </aside>
    </div>
  );
}
