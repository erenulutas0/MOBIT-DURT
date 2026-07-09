import { STATUS_COLORS } from "../lib/constants";

export function Badge({ label }: { label: string }) {
  const cls = STATUS_COLORS[label] || "bg-slate-100 text-slate-600";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}
