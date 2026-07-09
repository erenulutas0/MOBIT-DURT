import { useState } from "react";
import {
  approveERPAccountRequest,
  rejectERPAccountRequest,
} from "../api";
import type { LiveData } from "../lib/types";
import { shortName } from "../lib/helpers";

// ─── ACCOUNT REQUESTS ─────────────────────────────────────────────────────────
export function AccountRequestsPage({ live }: { live: LiveData }) {
  const [actionError, setActionError] = useState("");
  const requests = live.accountRequests.map((request) => ({
    id: request.id,
    name: request.name,
    email: request.email,
    phone: request.phone || "-",
    dept: "-",
    role: request.requested_role,
    created: new Date(request.created_at).toLocaleString("tr-TR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
  }));
  return (
    <div className="p-6 space-y-4">
      {actionError && <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-3 py-2">{actionError}</div>}
      <div className="bg-white border border-border rounded overflow-hidden">
        <div className="px-4 py-3 border-b border-border bg-slate-50">
          <h3 className="text-xs font-semibold">Bekleyen Hesap Talepleri ({requests.length})</h3>
        </div>
        <div className="divide-y divide-border">
          {requests.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground">Bekleyen hesap talebi yok.</div>
          ) : requests.map((r) => (
            <div key={r.id} className="px-4 py-4 flex items-center gap-4">
              <div className="w-9 h-9 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 text-xs font-bold shrink-0">
                {shortName(r.name)}
              </div>
              <div className="flex-1 grid grid-cols-4 gap-4">
                <div>
                  <p className="text-xs font-semibold text-foreground">{r.name}</p>
                  <p className="text-[10px] text-muted-foreground font-mono">{r.email}</p>
                  <p className="text-[10px] text-muted-foreground">{r.phone}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Departman</p>
                  <p className="text-xs font-medium text-foreground">{r.dept}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Talep Edilen Rol</p>
                  <p className="text-xs font-medium text-foreground">{r.role}</p>
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Tarih</p>
                  <p className="text-xs font-mono text-muted-foreground">{r.created}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={async () => {
                    setActionError("");
                    try {
                      await approveERPAccountRequest(r.id);
                      live.refresh();
                    } catch (error) {
                      setActionError(error instanceof Error ? error.message : "Talep onaylanamadı");
                    }
                  }}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded transition-colors"
                >
                  Onayla
                </button>
                <button
                  onClick={async () => {
                    setActionError("");
                    try {
                      await rejectERPAccountRequest(r.id);
                      live.refresh();
                    } catch (error) {
                      setActionError(error instanceof Error ? error.message : "Talep reddedilemedi");
                    }
                  }}
                  className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium rounded border border-red-200 transition-colors"
                >
                  Reddet
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

