import { useState, useRef } from "react";
import { useEffect } from "react";
import { Upload, FileText, X, CheckCircle, AlertCircle, Plus, ChevronDown } from "lucide-react";
import { ApiTender, getTenders } from "../api";

type UploadStatus = "idle" | "uploading" | "success" | "error";

type UploadResult = {
  filename: string;
  tenderId: string;
  branch: string;
  org: string;
  size: string;
  obsidianNote: string;
};

const branches = ["MOBIT", "STOK_ENERJI", "DEPART", "AREA", "MOBISER"];
const orgs = ["BEDAS", "AYEDAS", "TEDAS", "IGDAS", "IBB", "EPDK", "TEIAS", "ASELSAN", "DESKI", "TURKSAT"];

function StyledSelect({ label, value, options, onChange, placeholder }: {
  label: string; value: string; options: string[]; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label style={{ fontSize: 12, fontWeight: 500, color: "var(--foreground)", fontFamily: "Inter, sans-serif" }}>{label}</label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{
            width: "100%",
            padding: "8px 32px 8px 12px",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            background: "var(--card)",
            fontSize: 13,
            fontFamily: "Inter, sans-serif",
            color: value ? "var(--foreground)" : "var(--muted-foreground)",
            appearance: "none",
            outline: "none",
            cursor: "pointer",
          }}
        >
          <option value="">{placeholder || "Select…"}</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
        <ChevronDown size={13} style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }} />
      </div>
    </div>
  );
}

export function UploadView() {
  const [dragging, setDragging] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [branch, setBranch] = useState("");
  const [org, setOrg] = useState("");
  const [tender, setTender] = useState("");
  const [newTender, setNewTender] = useState(false);
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [existingTenders, setExistingTenders] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getTenders().then((items: ApiTender[]) => setExistingTenders(items.map((item) => item.tender_id)));
  }, []);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    setFiles((prev) => [...prev, ...dropped]);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (i: number) => {
    setFiles((prev) => prev.filter((_, idx) => idx !== i));
  };

  const handleUpload = async () => {
    if (!files.length || !branch || !org) return;
    setStatus("uploading");
    const tenderId = newTender ? "" : tender || existingTenders[0] || "";
    for (const selectedFile of files) {
      const form = new FormData();
      form.append("file", selectedFile);
      form.append("internal_unit", branch);
      form.append("organization", org);
      form.append("tender_id", tenderId);
      form.append("year", String(new Date().getFullYear()));
      form.append("caption", notes);
      const response = await fetch("/dashboard/upload", { method: "POST", body: form });
      if (!response.ok) {
        setStatus("error");
        return;
      }
    }
    setResult({
      filename: files[0].name,
      tenderId: tenderId || `${org}-${new Date().getFullYear()}-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-new`,
      branch,
      org,
      size: `${(files.reduce((s, f) => s + f.size, 0) / 1024 / 1024).toFixed(1)} MB`,
      obsidianNote: `${tenderId}/${files[0].name.replace(/\.[^.]+$/, "")}.md`,
    });
    setStatus("success");
  };

  const reset = () => {
    setFiles([]);
    setBranch("");
    setOrg("");
    setTender("");
    setNewTender(false);
    setNotes("");
    setStatus("idle");
    setResult(null);
  };

  const canUpload = files.length > 0 && branch && org && (newTender || tender);

  return (
    <div className="p-5 max-w-2xl" style={{ fontFamily: "Inter, sans-serif" }}>
      <div className="mb-5">
        <h1 style={{ fontSize: 16, fontWeight: 600, color: "var(--foreground)", margin: 0 }}>Upload Documents</h1>
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 2 }}>
          Manually upload files and assign them to a tender workspace.
        </p>
      </div>

      {status === "success" && result ? (
        <div className="rounded p-5 flex flex-col gap-4" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          <div className="flex items-center gap-3">
            <CheckCircle size={22} style={{ color: "var(--success)" }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>Upload processed successfully</div>
              <div style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 1 }}>
                {files.length} file{files.length !== 1 ? "s" : ""} classified and stored.
              </div>
            </div>
          </div>
          <div className="rounded p-4 flex flex-col gap-2.5" style={{ background: "var(--muted)", border: "1px solid var(--border)" }}>
            {[
              ["Tender ID", result.tenderId],
              ["Branch", result.branch],
              ["Organization", result.org],
              ["Total size", result.size],
              ["Obsidian note", result.obsidianNote],
            ].map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span style={{ fontSize: 11, color: "var(--muted-foreground)", width: 100, flexShrink: 0, fontWeight: 500 }}>{k}</span>
                <span style={{ fontSize: 12, color: "var(--foreground)", fontFamily: k === "Obsidian note" || k === "Tender ID" ? "JetBrains Mono, monospace" : "Inter, sans-serif" }}>
                  {v}
                </span>
              </div>
            ))}
          </div>
          <button
            onClick={reset}
            className="px-4 py-2 rounded"
            style={{ background: "var(--primary)", color: "#fff", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer", alignSelf: "flex-start" }}
          >
            Upload more files
          </button>
        </div>
      ) : (
        <div className="rounded p-5 flex flex-col gap-5" style={{ background: "var(--card)", border: "1px solid var(--border)" }}>
          {/* Drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className="rounded flex flex-col items-center justify-center gap-2 py-10 cursor-pointer transition-colors"
            style={{
              border: `2px dashed ${dragging ? "var(--primary)" : "var(--border)"}`,
              background: dragging ? "var(--secondary)" : "var(--background)",
            }}
          >
            <Upload size={28} style={{ color: dragging ? "var(--primary)" : "var(--muted-foreground)" }} />
            <div style={{ fontSize: 13, color: dragging ? "var(--primary)" : "var(--foreground)", fontWeight: 500 }}>
              {dragging ? "Drop files here" : "Drag & drop files, or click to browse"}
            </div>
            <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
              PDF, DOCX, XLSX, DWG, images — max 50 MB per file
            </div>
            <input ref={fileInputRef} type="file" multiple style={{ display: "none" }} onChange={handleFileInput} />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-2 px-3 py-2 rounded" style={{ background: "var(--muted)", border: "1px solid var(--border)" }}>
                  <FileText size={14} style={{ color: "var(--primary)", flexShrink: 0 }} />
                  <span className="flex-1 truncate" style={{ fontSize: 12, color: "var(--foreground)" }}>{f.name}</span>
                  <span style={{ fontSize: 11, color: "var(--muted-foreground)", fontFamily: "JetBrains Mono, monospace" }}>
                    {(f.size / 1024 / 1024).toFixed(1)} MB
                  </span>
                  <button onClick={() => removeFile(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", padding: 2 }}>
                    <X size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Classification fields */}
          <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <StyledSelect label="Internal Company Branch *" value={branch} options={branches} onChange={setBranch} placeholder="Select branch…" />
            <StyledSelect label="Tender Organization *" value={org} options={orgs} onChange={setOrg} placeholder="Select org…" />
          </div>

          {/* Tender selector */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setNewTender(false)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded"
                style={{
                  border: `1px solid ${!newTender ? "var(--primary)" : "var(--border)"}`,
                  background: !newTender ? "var(--secondary)" : "var(--card)",
                  color: !newTender ? "var(--primary)" : "var(--foreground)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                Use existing tender
              </button>
              <button
                onClick={() => setNewTender(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded"
                style={{
                  border: `1px solid ${newTender ? "var(--primary)" : "var(--border)"}`,
                  background: newTender ? "var(--secondary)" : "var(--card)",
                  color: newTender ? "var(--primary)" : "var(--foreground)",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                <Plus size={12} />
                Create new tender
              </button>
            </div>
            {!newTender && (
              <StyledSelect label="Select Tender *" value={tender} options={existingTenders} onChange={setTender} placeholder="Select tender ID…" />
            )}
            {newTender && (
              <div className="rounded p-3" style={{ background: "var(--info-bg)", border: "1px solid #bfdbfe" }}>
                <p style={{ fontSize: 12, color: "var(--info)", margin: 0 }}>
                  A new tender workspace will be auto-generated as <strong>{`${org || "ORG"}-2026-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-001`}</strong> after upload.
                </p>
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <label style={{ fontSize: 12, fontWeight: 500, color: "var(--foreground)" }}>Caption / Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional note about these files…"
              rows={3}
              style={{
                width: "100%",
                padding: "8px 12px",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                background: "var(--input-background)",
                fontSize: 13,
                fontFamily: "Inter, sans-serif",
                color: "var(--foreground)",
                resize: "vertical",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {/* Validation warning */}
          {!canUpload && files.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded" style={{ background: "var(--warning-bg)", border: "1px solid var(--warning-border)" }}>
              <AlertCircle size={13} style={{ color: "var(--warning)", flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "var(--warning)" }}>
                Please select a branch, organization, and tender before uploading.
              </span>
            </div>
          )}

          {/* Upload button */}
          <button
            onClick={handleUpload}
            disabled={!canUpload || status === "uploading"}
            className="flex items-center justify-center gap-2 py-2.5 rounded"
            style={{
              background: canUpload ? "var(--primary)" : "var(--muted)",
              color: canUpload ? "#fff" : "var(--muted-foreground)",
              border: "none",
              fontSize: 13,
              fontWeight: 500,
              cursor: canUpload ? "pointer" : "not-allowed",
              transition: "background 0.2s",
            }}
          >
            {status === "uploading" ? (
              <>
                <span className="animate-spin" style={{ display: "inline-block", width: 14, height: 14, border: "2px solid rgba(255,255,255,0.3)", borderTopColor: "#fff", borderRadius: "50%" }} />
                Processing…
              </>
            ) : (
              <>
                <Upload size={14} />
                Upload {files.length > 0 ? `${files.length} file${files.length !== 1 ? "s" : ""}` : "files"}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
