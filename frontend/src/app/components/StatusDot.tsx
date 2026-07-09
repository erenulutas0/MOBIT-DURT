export function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    Online: "bg-emerald-500",
    Away: "bg-amber-400",
    Offline: "bg-slate-300",
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status] || "bg-slate-300"}`} />;
}
