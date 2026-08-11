import { useEffect, useRef, useState } from "react";
import { Bell, ChevronLeft, Clock, FileText, X } from "lucide-react";

type Role = "admin" | "user";
type AuthUser = { id: number | null; name: string; email: string; role: Role; dept: string };

// messageId opens the thread containing that message; userId/userName instead opens (or starts)
// the person's thread directly — used by "Mesaj At" on profile sheets.
type DirectMessageOpenRequest = { messageId: number; nonce: number; userId?: number; userName?: string };
/** A null groupId means "show the Alanlar list", for somebody who has no room to open yet. */
type RoomOpenRequest = { groupId: number | null; view: "chat" | "documents"; nonce: number };

/** Muted-tone identity palette; a stable hash keeps each person's color consistent. */
const AVATAR_TONES = [
  "bg-teal-600", "bg-blue-600", "bg-violet-600",
  "bg-emerald-600", "bg-amber-600", "bg-rose-600",
];

function avatarTone(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

function Avatar({ name, size = "sm", color, src }: { name: string; size?: "sm" | "md" | "lg"; color?: string; src?: string | null }) {
  const sz = size === "sm" ? "w-8 h-8 text-xs" : size === "md" ? "w-10 h-10 text-sm" : "w-16 h-16 text-lg";
  const bg = color || avatarTone(name);
  if (src) {
    return <img src={src} alt={name} className={`${sz} rounded-full object-cover shrink-0`} />;
  }
  return (
    <div className={`${sz} rounded-full ${bg} flex items-center justify-center font-bold text-white shrink-0`}>
      {name.split(" ").map(n => n[0]).slice(0, 2).join("").toUpperCase()}
    </div>
  );
}

function Card({ children, className = "", onPress }: {
  children: React.ReactNode; className?: string; onPress?: () => void;
}) {
  return (
    <div onClick={onPress}
      className={`bg-card rounded-xl border border-border surface-elevated ${onPress ? "cursor-pointer active:scale-[0.98] active:brightness-110 transition-all duration-150" : ""} ${className}`}>
      {children}
    </div>
  );
}

function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold text-foreground tracking-wide">{title}</h2>
      {action && <button onClick={onAction} className="text-xs text-primary font-medium active:opacity-70">{action}</button>}
    </div>
  );
}

/** Shimmering placeholder block for loading states. */
function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`skeleton ${className}`} />;
}

function TopBar({ title, onBack, actions }: {
  title: string | React.ReactNode; onBack?: () => void; actions?: React.ReactNode;
}) {
  return (
    <div className="flex items-center h-14 px-4 gap-3 border-b border-border bg-background sticky top-0 z-10 shrink-0">
      {onBack && (
        <button onClick={onBack} className="w-8 h-8 flex items-center justify-center rounded-full bg-muted text-foreground -ml-1 shrink-0">
          <ChevronLeft className="w-5 h-5" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        {typeof title === "string"
          ? <h1 className="text-base font-semibold text-foreground truncate">{title}</h1>
          : title}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

function EmptyState({ icon: Icon, title, desc, action, onAction }: {
  icon: any; title: string; desc: string; action?: string; onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
      <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold text-foreground mb-1">{title}</p>
      <p className="text-xs text-muted-foreground mb-4">{desc}</p>
      {action && onAction && (
        <button onClick={onAction} className="px-4 py-2 bg-primary rounded-xl text-xs font-semibold text-white">
          {action}
        </button>
      )}
    </div>
  );
}

function isPdfFile(file: { name: string; type: string }) {
  return file.type.toLowerCase().includes("pdf") || file.name.toLowerCase().endsWith(".pdf");
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Dosya okunamadı."));
    reader.readAsDataURL(blob);
  });
}

function profilePhotoKey(userIdOrEmail: number | string | null | undefined) {
  return `docsbot.profile.photo.${userIdOrEmail || "anon"}`;
}

function readProfilePhoto(userIdOrEmail: number | string | null | undefined) {
  try {
    return window.localStorage.getItem(profilePhotoKey(userIdOrEmail)) || "";
  } catch {
    return "";
  }
}

// Pinch-to-zoom + pan image for preview lightboxes (important for reviewers inspecting scanned
// documents). Two-pointer pinch scales 1×–5×; single-pointer drags when zoomed; double-tap toggles.
function ZoomableImage({ src, alt }: { src: string; alt: string }) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gesture = useRef({ dist: 1, scale: 1 });
  const pan = useRef<{ x: number; y: number } | null>(null);

  const clampScale = (value: number) => Math.min(5, Math.max(1, value));

  const handleDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, scale };
    } else if (scale > 1) {
      pan.current = { x: event.clientX - offset.x, y: event.clientY - offset.y };
    }
  };
  const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(event.pointerId)) return;
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      setScale(clampScale(gesture.current.scale * (dist / gesture.current.dist)));
    } else if (scale > 1 && pan.current) {
      setOffset({ x: event.clientX - pan.current.x, y: event.clientY - pan.current.y });
    }
  };
  const handleUp = (event: React.PointerEvent<HTMLDivElement>) => {
    pointers.current.delete(event.pointerId);
    pan.current = null;
    if (pointers.current.size === 0 && scale <= 1.01) setOffset({ x: 0, y: 0 });
  };
  const toggleZoom = () => {
    if (scale > 1) {
      setScale(1);
      setOffset({ x: 0, y: 0 });
    } else {
      setScale(2.5);
    }
  };

  return (
    <div
      className="w-full h-full overflow-hidden flex items-center justify-center touch-none select-none"
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={handleUp}
      onPointerCancel={handleUp}
      onDoubleClick={toggleZoom}
    >
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-w-full max-h-full object-contain"
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transition: pan.current ? "none" : "transform 0.12s ease-out",
        }}
      />
    </div>
  );
}

/**
 * PDF viewer: every page rendered crisp (2× scale), streamed in as it renders, with a page counter.
 * Tapping a page opens it full-screen with pinch-zoom/pan — the "sayfa sayfa tam ekran" flow.
 */
function PdfCanvasPreview({ url }: { url: string }) {
  const [pages, setPages] = useState<string[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [error, setError] = useState("");
  const [fullscreenPage, setFullscreenPage] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      setError("");
      setPages([]);
      setTotalPages(0);
      setFullscreenPage(null);
      try {
        const [pdfjsLib, pdfWorker] = await Promise.all([
          import("pdfjs-dist"),
          import("pdfjs-dist/build/pdf.worker.mjs?url"),
        ]);
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker.default;
        const pdf = await pdfjsLib.getDocument(url).promise;
        if (cancelled) return;
        setTotalPages(pdf.numPages);
        // Stream pages into state one by one so the first page is visible immediately even in a
        // long document; 2× scale keeps text readable when zoomed in full screen.
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");
          if (!context) continue;
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          await page.render({ canvasContext: context, viewport }).promise;
          if (cancelled) return;
          const rendered = canvas.toDataURL("image/jpeg", 0.9);
          setPages(prev => [...prev, rendered]);
        }
      } catch {
        if (!cancelled) setError("PDF görüntülenemedi. İndirerek açabilirsiniz.");
      }
    };
    void render();
    return () => { cancelled = true; };
  }, [url]);

  if (error) return <EmptyState icon={FileText} title="PDF açılamadı" desc={error} />;
  if (pages.length === 0) return <EmptyState icon={Clock} title="PDF hazırlanıyor" desc="Sayfalar oluşturuluyor." />;

  return (
    <div className="h-full overflow-y-auto bg-slate-950 px-3 py-4 space-y-4">
      <p className="text-center text-[11px] text-slate-400">
        Sayfaya dokunun: tam ekran + yakınlaştırma
      </p>
      {pages.map((page, index) => (
        <button key={index} onClick={() => setFullscreenPage(index)} className="block w-full text-left">
          <img src={page} alt={`PDF sayfa ${index + 1}`} className="w-full rounded-lg bg-white" />
          <p className="mt-1 text-center text-[10px] text-slate-400">
            Sayfa {index + 1} / {totalPages || pages.length}
          </p>
        </button>
      ))}
      {pages.length < totalPages && (
        <p className="text-center text-[11px] text-slate-400 animate-pulse">
          Sayfa {pages.length + 1} hazırlanıyor…
        </p>
      )}
      {fullscreenPage !== null && pages[fullscreenPage] && (
        <div className="fixed inset-0 z-[70] bg-black flex flex-col">
          <div className="shrink-0 flex items-center justify-between px-4 pt-12 pb-3">
            <p className="text-sm font-semibold text-white">
              Sayfa {fullscreenPage + 1} / {totalPages || pages.length}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setFullscreenPage(page => (page !== null && page > 0 ? page - 1 : page))}
                disabled={fullscreenPage === 0}
                className="px-3 h-9 rounded-full bg-white/10 text-sm font-bold text-white disabled:opacity-30"
              >
                ‹ Önceki
              </button>
              <button
                onClick={() => setFullscreenPage(page => (page !== null && page < pages.length - 1 ? page + 1 : page))}
                disabled={fullscreenPage >= pages.length - 1}
                className="px-3 h-9 rounded-full bg-white/10 text-sm font-bold text-white disabled:opacity-30"
              >
                Sonraki ›
              </button>
              <button
                onClick={() => setFullscreenPage(null)}
                className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"
                aria-label="Tam ekrandan çık"
              >
                <X className="w-4 h-4 text-white" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
            <ZoomableImage src={pages[fullscreenPage]} alt={`PDF sayfa ${fullscreenPage + 1}`} />
          </div>
        </div>
      )}
    </div>
  );
}

// Notification bell with an unread badge, shown in every tab header so notifications are reachable
// from anywhere — not just the ERP tab.
function NotificationBell({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative w-9 h-9 rounded-full bg-muted flex items-center justify-center active:scale-95"
      aria-label="Bildirimler"
    >
      <Bell className="w-4 h-4 text-muted-foreground" />
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}

export { Avatar, Card, SectionHeader, Skeleton, TopBar, EmptyState, NotificationBell, isPdfFile, blobToDataUrl, profilePhotoKey, readProfilePhoto, PdfCanvasPreview, ZoomableImage };
export type { Role, AuthUser, DirectMessageOpenRequest, RoomOpenRequest };
