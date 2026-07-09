import { Send, Trash2, X } from "lucide-react";

export function DeleteActionSheet({
  title,
  onClose,
  onDeleteForMe,
  onDeleteForEveryone,
}: {
  title: string;
  onClose: () => void;
  onDeleteForMe: () => void;
  onDeleteForEveryone: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end px-4 pb-4">
      <div className="bg-card rounded-xl border border-border w-full p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">Silme seçeneği</p>
            <p className="text-xs text-muted-foreground truncate">{title}</p>
          </div>
          <button
            type="button"
            aria-label="Kapat"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          onClick={onDeleteForEveryone}
          className="w-full py-3 rounded-xl bg-red-500/15 text-sm font-semibold text-red-300 flex items-center justify-center gap-2"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" /> Herkesten Sil
        </button>
        <button
          type="button"
          onClick={onDeleteForMe}
          className="w-full py-3 rounded-xl bg-muted text-sm font-semibold text-foreground"
        >
          Benden Sil
        </button>
      </div>
    </div>
  );
}

export function MessageOptionsSheet({
  title,
  onClose,
  onDelete,
  onForward,
}: {
  title: string;
  onClose: () => void;
  onDelete: () => void;
  onForward: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end px-4 pb-4">
      <div className="bg-card rounded-xl border border-border w-full p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">Mesaj seçenekleri</p>
            <p className="text-xs text-muted-foreground truncate">{title}</p>
          </div>
          <button
            type="button"
            aria-label="Kapat"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0"
          >
            <X className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
          </button>
        </div>
        <button
          type="button"
          onClick={onForward}
          className="w-full py-3 rounded-xl bg-muted text-sm font-semibold text-foreground flex items-center justify-center gap-2"
        >
          <Send className="w-4 h-4" aria-hidden="true" /> İlet
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="w-full py-3 rounded-xl bg-red-500/15 text-sm font-semibold text-red-300 flex items-center justify-center gap-2"
        >
          <Trash2 className="w-4 h-4" aria-hidden="true" /> Sil
        </button>
      </div>
    </div>
  );
}
