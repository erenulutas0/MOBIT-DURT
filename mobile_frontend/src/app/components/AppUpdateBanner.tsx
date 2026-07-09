import { AlertTriangle, Download } from "lucide-react";
import type { MobileAppUpdateInfo } from "../api";
import { appUpdateBannerView } from "../utils/mobileWorkflow";

export function AppUpdateBanner({ update }: { update: MobileAppUpdateInfo }) {
  const banner = appUpdateBannerView(update);
  const openStore = () => {
    window.open(update.play_store_url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className={`bg-card rounded-xl border p-4 overflow-hidden relative ${banner.required ? "border-amber-400/40 bg-amber-500/10" : "border-primary/30 bg-primary/10"}`}>
      <div className="absolute -right-8 -top-8 w-24 h-24 rounded-full bg-white/5" />
      <div className="flex items-start gap-3 relative">
        <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${banner.required ? "bg-amber-500/15" : "bg-primary/15"}`}>
          {banner.required
            ? <AlertTriangle className="w-5 h-5 text-amber-300" aria-hidden="true" />
            : <Download className="w-5 h-5 text-primary" aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">{banner.title}</p>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            {banner.message}
          </p>
          <div className="flex items-center justify-between gap-3 mt-3">
            <span className="text-[10px] font-mono text-muted-foreground">
              {banner.versionLabel}
            </span>
            <button
              type="button"
              onClick={openStore}
              className={`px-3 py-2 rounded-xl text-xs font-bold text-white ${banner.required ? "bg-amber-500" : "bg-primary"}`}
            >
              {banner.buttonLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
