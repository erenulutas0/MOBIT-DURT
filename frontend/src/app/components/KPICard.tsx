export function KPICard({ label, value, sub, icon: Icon, trend, color, onClick }: {
  label: string; value: string | number; sub?: string; icon: any; trend?: string; color?: string; onClick?: () => void;
}) {
  const content = (
    <>
      <div className="flex items-start justify-between">
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
        <div className={`w-7 h-7 rounded flex items-center justify-center ${color || "bg-slate-100"}`}>
          <Icon className="w-3.5 h-3.5 text-slate-600" />
        </div>
      </div>
      <div className="text-2xl font-bold text-foreground font-mono">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
      {trend && <div className="text-xs text-emerald-600 font-medium">{trend}</div>}
    </>
  );
  const className = "bg-white border border-border rounded p-4 flex flex-col gap-2";
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${className} text-left hover:border-teal-300 hover:shadow-sm transition-all`}>
        {content}
      </button>
    );
  }
  return (
    <div className={className}>
      {content}
    </div>
  );
}
