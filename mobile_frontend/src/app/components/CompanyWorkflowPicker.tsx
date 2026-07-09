import { useMemo, useState } from "react";
import { Building2, ChevronRight, Plus, Search } from "lucide-react";
import type { Tender } from "../api";
import {
  canCreateCompanyOption,
  companyOptionsFromTenders,
  filterCompanyOptions,
} from "../utils/mobileWorkflow";

export function CompanyWorkflowPicker({
  tenders,
  value,
  onSelect,
  onCreateCompany,
}: {
  tenders: Tender[];
  value: string;
  onSelect: (next: { tenderId: string; companyName: string; year?: number }) => void;
  onCreateCompany?: (companyName: string) => Promise<Tender>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const companyOptions = useMemo(() => companyOptionsFromTenders(tenders), [tenders]);
  const filteredCompanies = useMemo(() => filterCompanyOptions(tenders, query), [tenders, query]);
  const trimmedQuery = query.trim();
  const canCreateCompany = Boolean(onCreateCompany && canCreateCompanyOption(tenders, trimmedQuery));

  const selectCompany = (tender: Tender) => {
    onSelect({ tenderId: tender.tender_id, companyName: tender.organization, year: tender.year });
    setOpen(false);
    setQuery("");
  };

  const createAndSelectCompany = async () => {
    if (!onCreateCompany || !canCreateCompany) return;
    setCreating(true);
    try {
      const tender = await onCreateCompany(trimmedQuery);
      selectCompany(tender);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen(value ? !open : true)}
        className="w-full flex items-center gap-3 bg-muted rounded-xl px-3 py-3 text-left"
      >
        <Search className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold truncate ${value ? "text-foreground" : "text-muted-foreground"}`}>
            {value || "Şirket ara ve seç"}
          </p>
          <p className="text-[10px] text-muted-foreground mt-0.5">Kayıtlı şirket listesi</p>
        </div>
        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} aria-hidden="true" />
      </button>

      {open && (
        <div className="bg-card rounded-xl border border-border p-3 space-y-3">
          <div className="flex items-center gap-2 bg-background rounded-xl px-3 py-2.5 border border-border">
            <Search className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
            <input
              autoFocus
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Şirket adı ara..."
              className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground px-1">
              Şirketler
            </p>
            <div className="max-h-72 overflow-y-auto pr-1 space-y-2">
              {canCreateCompany && (
                <button
                  type="button"
                  onClick={() => void createAndSelectCompany()}
                  disabled={creating}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-3 bg-primary/10 border border-primary/30 active:bg-primary/15 text-left disabled:opacity-60"
                >
                  <Plus className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground truncate">Yeni şirket ekle</p>
                    <p className="text-xs text-primary truncate">{trimmedQuery}</p>
                  </div>
                </button>
              )}
              {filteredCompanies.length === 0 ? (
                <p className="text-xs text-muted-foreground px-1 py-2">Eşleşen şirket yok.</p>
              ) : filteredCompanies.map(tender => (
                <button
                  type="button"
                  key={tender.id}
                  onClick={() => selectCompany(tender)}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-3 bg-background/60 active:bg-muted text-left"
                >
                  <Building2 className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                  <p className="min-w-0 flex-1 text-sm font-semibold text-foreground truncate">
                    {tender.organization}
                  </p>
                </button>
              ))}
              {companyOptions.length === 0 && !canCreateCompany && (
                <p className="text-xs text-muted-foreground px-1 py-2">Kayıtlı şirket yok.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
