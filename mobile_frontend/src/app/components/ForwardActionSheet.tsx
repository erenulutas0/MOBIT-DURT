import { Users, X } from "lucide-react";
import type { DocumentGroupSummary, ERPUser } from "../api";

function initials(name: string) {
  return name.split(" ").map(part => part[0]).slice(0, 2).join("").toLocaleUpperCase("tr-TR");
}

export function ForwardActionSheet({
  title,
  people,
  rooms,
  onClose,
  onForwardToPerson,
  onForwardToRoom,
}: {
  title: string;
  people: ERPUser[];
  rooms: DocumentGroupSummary[];
  onClose: () => void;
  onForwardToPerson: (person: ERPUser) => void;
  onForwardToRoom: (room: DocumentGroupSummary) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-end px-4 pb-4">
      <div className="bg-card rounded-xl border border-border w-full max-h-[78dvh] p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <p className="text-sm font-bold text-foreground">İlet</p>
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
        <div className="overflow-y-auto space-y-4 pr-1">
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground px-1">Kişi Seç</p>
            {people.length === 0 ? (
              <p className="text-xs text-muted-foreground px-1">Uygun kişi yok.</p>
            ) : people.map(person => (
              <button
                type="button"
                key={person.id}
                onClick={() => onForwardToPerson(person)}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-3 bg-muted text-left"
              >
                <div className="w-8 h-8 rounded-full bg-teal-600 flex items-center justify-center font-bold text-xs text-white shrink-0">
                  {initials(person.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{person.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{person.role === "admin" ? "Yönetici" : "Kullanıcı"}</p>
                </div>
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground px-1">Oda Seç</p>
            {rooms.length === 0 ? (
              <p className="text-xs text-muted-foreground px-1">Uygun oda yok.</p>
            ) : rooms.map(room => (
              <button
                type="button"
                key={room.id}
                onClick={() => onForwardToRoom(room)}
                className="w-full flex items-center gap-3 rounded-xl px-3 py-3 bg-muted text-left"
              >
                <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                  <Users className="w-4 h-4 text-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground truncate">{room.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{room.member_count} üye</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
