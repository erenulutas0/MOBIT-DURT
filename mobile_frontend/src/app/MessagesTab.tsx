import { useEffect, useMemo, useRef, useState } from "react";
import { CompanyWorkflowPicker } from "./components/CompanyWorkflowPicker";
import { ForwardActionSheet } from "./components/ForwardActionSheet";
import { DeleteActionSheet, MessageOptionsSheet } from "./components/MessageActionSheets";
import {
  addDocumentGroupMember,
  createCompanyWorkflow,
  createDocumentGroup,
  deleteERPDirectMessage,
  deleteDocumentGroupDocument,
  deleteDocumentGroupMessage,
  getDocumentGroup,
  getDocumentGroupFileBlob,
  getDocumentGroupFileVersionBlob,
  getDocumentGroupFileVersions,
  getDocumentGroupMessages,
  getCompanyChatMessages,
  getDocumentGroups,
  getERPDirectMessages,
  searchCommunication,
  sendCompanyChatMessage,
  getAuthenticatedMediaBlob,
  getERPUsers,
  getTendersPage,
  markDocumentGroupMessagesRead,
  markERPDirectMessageRead,
  openChatEventStream,
  removeDocumentGroupMember,
  replaceDocumentGroupFile,
  sendERPDirectMessage,
  updateERPUserDocumentNetworkVisibility,
  updateDocumentGroup,
  sendDocumentGroupMessage,
  uploadDocumentGroupFile,
  uploadDocumentGroupFileWithProgress,
} from "./api";
import type { CommunicationSearchResult, CompanyChatMessage, DocumentGroupDetail, DocumentGroupDocument, DocumentGroupDocumentVersion, DocumentGroupMember, DocumentGroupMessage, DocumentGroupSummary, ERPDirectMessage, ERPUser, Tender } from "./api";
import { dayKey, formatDate, formatDayLabel, formatVoiceDuration } from "./utils/formatters";
import { reconcileNewestWindow } from "./utils/messageReconcile";
import {
  forwardedBodyText,
  forwardedDocumentName,
  groupDocumentsByYearTender,
  isForwardedLabel,
  microphoneErrorMessage,
} from "./utils/mobileWorkflow";
import {
  Avatar,
  Card,
  EmptyState,
  PdfCanvasPreview,
  SectionHeader,
  Skeleton,
  TopBar,
  blobToDataUrl,
  isPdfFile,
  readProfilePhoto,
} from "./shared";
import type { AuthUser, DirectMessageOpenRequest, RoomOpenRequest } from "./shared";
import {
  Users, MessageSquare, UserPlus, FileText, Send, FolderOpen, Upload,
  ChevronRight, Search, MoreHorizontal, Download, Eye, Paperclip,
  X, Plus, Clock, Share2, Mic, Square, Image as ImageIcon,
  Loader2, RefreshCw, ChevronUp, Megaphone,
} from "lucide-react";

type MsgScreen = "inbox" | "thread" | "room-thread" | "company-chat";

type RecordingTarget = "direct" | "room";
type RoomDeleteTarget =
  | { kind: "message"; id: number; title: string }
  | { kind: "document"; id: number; title: string };
type RoomActionTarget = RoomDeleteTarget & { action: "options" | "delete" | "forward" };
type DirectActionTarget = { action: "options" | "delete" | "forward"; messageId: number; title: string };
type MessageWithMedia = ERPDirectMessage | DocumentGroupMessage;
type PendingMessageStatus = "sending" | "failed";
type ReplyTarget = { kind: "direct" | "room"; messageId: number; authorLabel: string; preview: string };
type PendingDirectMessage = {
  local_id: string;
  client_message_id: string;
  recipient_user_id: number | null;
  recipient_name: string;
  body: string;
  created_at: string;
  status: PendingMessageStatus;
  error?: string;
  reply_to_message_id?: number | null;
};
type PendingRoomMessage = {
  local_id: string;
  client_message_id: string;
  group_id: number;
  body: string;
  author_name: string;
  created_at: string;
  status: PendingMessageStatus;
  error?: string;
  reply_to_message_id?: number | null;
};

const MESSAGE_REFRESH_INTERVAL_MS = 8_000;

function createClientMessageId() {
  return globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function DaySeparator({ value }: { value: string | null }) {
  return (
    <div className="flex justify-center py-1">
      <span className="rounded-full bg-muted/80 border border-border px-3 py-1 text-[10px] font-semibold text-muted-foreground">
        {formatDayLabel(value)}
      </span>
    </div>
  );
}

const PULL_TO_REFRESH_THRESHOLD = 56;

/** Touch-driven pull-to-refresh for a scrollable container; only engages when the container is already scrolled to top. */
function usePullToRefresh(onRefresh: () => Promise<void> | void) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startYRef = useRef<number | null>(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (refreshing) return;
    startYRef.current = (containerRef.current?.scrollTop ?? 0) <= 0 ? event.touches[0].clientY : null;
  };

  const onTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (startYRef.current === null || refreshing) return;
    const delta = event.touches[0].clientY - startYRef.current;
    if (delta > 0 && (containerRef.current?.scrollTop ?? 0) <= 0) {
      setPullDistance(Math.min(delta * 0.5, 90));
    } else {
      setPullDistance(0);
    }
  };

  const onTouchEnd = async () => {
    const shouldRefresh = pullDistance >= PULL_TO_REFRESH_THRESHOLD;
    startYRef.current = null;
    setPullDistance(0);
    if (shouldRefresh) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
  };

  return { containerRef, pullDistance, refreshing, onTouchStart, onTouchMove, onTouchEnd };
}

function PullToRefreshIndicator({ pullDistance, refreshing }: { pullDistance: number; refreshing: boolean }) {
  if (pullDistance <= 0 && !refreshing) return null;
  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-[height]"
      style={{ height: refreshing ? 40 : Math.min(pullDistance, 60) }}
    >
      <RefreshCw
        className={`w-4 h-4 text-primary ${refreshing ? "animate-spin" : ""}`}
        style={refreshing ? undefined : { opacity: Math.min(pullDistance / PULL_TO_REFRESH_THRESHOLD, 1), transform: `rotate(${pullDistance * 3}deg)` }}
      />
    </div>
  );
}

function ConversationListSkeleton() {
  return (
    <div className="px-4 py-2 space-y-1">
      {[0, 1, 2, 3, 4, 5].map(index => (
        <div key={index} className="flex items-center gap-3 py-2.5">
          <Skeleton className="w-11 h-11 rounded-full shrink-0" />
          <div className="flex-1 min-w-0 space-y-2">
            <Skeleton className="h-3 w-2/5" />
            <Skeleton className="h-2.5 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function MessageThreadSkeleton() {
  const widths = ["w-40", "w-56", "w-32", "w-48", "w-28"];
  return (
    <div className="flex-1 px-4 py-4 space-y-3">
      {widths.map((width, index) => (
        <div key={index} className={`flex ${index % 2 === 0 ? "justify-start" : "justify-end"}`}>
          <Skeleton className={`h-10 rounded-2xl ${width}`} />
        </div>
      ))}
    </div>
  );
}

function BusyBanner({ message, progressPercent }: { message: string; progressPercent?: number | null }) {
  return (
    <div className="px-4 pt-3 shrink-0">
      <Card className="p-3 border-primary/30 bg-primary/10">
        <div className="flex items-center gap-2">
          <Loader2 className="w-4 h-4 text-primary animate-spin shrink-0" />
          <p className="text-xs font-semibold text-primary flex-1">{message}</p>
          {typeof progressPercent === "number" && (
            <span className="text-xs font-bold text-primary shrink-0">%{progressPercent}</span>
          )}
        </div>
        {typeof progressPercent === "number" && (
          <div className="mt-2 h-1.5 rounded-full bg-primary/15 overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progressPercent}%` }} />
          </div>
        )}
      </Card>
    </div>
  );
}

function PendingTextBubble({ body, createdAt, status, onRetry }: {
  body: string;
  createdAt: string;
  status: PendingMessageStatus;
  onRetry: () => void;
}) {
  const failed = status === "failed";
  return (
    <div className="flex justify-end">
      <div className={`max-w-[78%] rounded-2xl rounded-br-sm px-4 py-2.5 text-white ${
        failed ? "bg-red-500/20 border border-red-400/30" : "bg-primary/70"
      }`}>
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{body}</p>
        <div className={`mt-1 flex items-center justify-end gap-2 text-[10px] ${failed ? "text-red-100" : "text-white/70"}`}>
          <span>{formatDate(createdAt)}</span>
          <span>{failed ? "Gönderilemedi" : "Gönderiliyor"}</span>
          {failed && (
            <button onClick={onRetry} className="inline-flex items-center gap-1 font-semibold underline decoration-red-100/50">
              <RefreshCw className="w-3 h-3" /> Tekrar dene
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function isImageDocument(document: DocumentGroupDocument) {
  const name = `${document.document.original_filename || document.document.stored_filename || ""}`.toLowerCase();
  const mime = `${document.document.mime_type || ""}`.toLowerCase();
  return mime.startsWith("image/") || /\.(png|jpe?g|webp|gif|bmp)$/i.test(name);
}

function readNumberSet(key: string) {
  try {
    const raw = window.localStorage.getItem(key);
    const values = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(values) ? values.filter(value => Number.isFinite(value)) : []);
  } catch {
    return new Set<number>();
  }
}

function writeNumberSet(key: string, values: Set<number>) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...values]));
  } catch {
    // Local hiding is a convenience feature; failing storage must not block chat.
  }
}

function readStoredArray<T>(key: string, isValid: (value: unknown) => value is T) {
  try {
    const raw = window.localStorage.getItem(key);
    const values = raw ? JSON.parse(raw) : [];
    return Array.isArray(values) ? values.filter(isValid) : [];
  } catch {
    return [];
  }
}

function writeStoredArray<T>(key: string, values: T[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(values));
  } catch {
    // Pending chat state is best-effort; storage failures should not block sending.
  }
}

function isPendingDirectMessage(value: unknown): value is PendingDirectMessage {
  const item = value as PendingDirectMessage;
  return Boolean(item)
    && typeof item.local_id === "string"
    && typeof item.client_message_id === "string"
    && (typeof item.recipient_user_id === "number" || item.recipient_user_id === null)
    && typeof item.recipient_name === "string"
    && typeof item.body === "string"
    && typeof item.created_at === "string"
    && (item.status === "sending" || item.status === "failed");
}

function isPendingRoomMessage(value: unknown): value is PendingRoomMessage {
  const item = value as PendingRoomMessage;
  return Boolean(item)
    && typeof item.local_id === "string"
    && typeof item.client_message_id === "string"
    && typeof item.group_id === "number"
    && typeof item.body === "string"
    && typeof item.author_name === "string"
    && typeof item.created_at === "string"
    && (item.status === "sending" || item.status === "failed");
}

function GroupImagePreview({
  groupId,
  document,
  onOpen,
}: {
  groupId: number;
  document: DocumentGroupDocument;
  onOpen: () => void;
}) {
  const [url, setUrl] = useState("");

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    getDocumentGroupFileBlob(groupId, document.id, false)
      .then(blob => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch(() => setUrl(""));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [groupId, document.id]);

  if (!url) return null;

  return (
    <button onClick={onOpen} className="mt-3 overflow-hidden rounded-xl border border-border bg-muted block">
      <img src={url} alt={document.document.original_filename || "Görsel"} className="max-h-64 w-full object-cover" />
    </button>
  );
}

// ─── MESSAGES TAB ─────────────────────────────────────────────────────────────
function MessagesTab({
  user,
  openRequest,
  roomOpenRequest,
  profilePhotoVersion = 0,
}: {
  user: AuthUser;
  openRequest?: DirectMessageOpenRequest | null;
  roomOpenRequest?: RoomOpenRequest | null;
  profilePhotoVersion?: number;
}) {
  const hiddenStorageSuffix = user.id ?? user.email;
  const hiddenDirectMessageStorageKey = `docsbot.hidden.direct.messages.${hiddenStorageSuffix}`;
  const hiddenRoomMessageStorageKey = `docsbot.hidden.room.messages.${hiddenStorageSuffix}`;
  const hiddenRoomDocumentStorageKey = `docsbot.hidden.room.documents.${hiddenStorageSuffix}`;
  const pendingDirectMessageStorageKey = `docsbot.pending.direct.messages.${hiddenStorageSuffix}`;
  const pendingRoomMessageStorageKey = `docsbot.pending.room.messages.${hiddenStorageSuffix}`;
  const [screen, setScreen] = useState<MsgScreen>("inbox");
  const [activeTab, setActiveTab] = useState<"all" | "rooms" | "people">("all");
  const [communicationSearch, setCommunicationSearch] = useState("");
  const [contentSearchResults, setContentSearchResults] = useState<CommunicationSearchResult[]>([]);
  const [contentSearchLoading, setContentSearchLoading] = useState(false);
  const [companyChatMessages, setCompanyChatMessages] = useState<CompanyChatMessage[]>([]);
  const [companyChatLoading, setCompanyChatLoading] = useState(false);
  const [companyChatError, setCompanyChatError] = useState("");
  const [companyChatText, setCompanyChatText] = useState("");
  const [companyChatSending, setCompanyChatSending] = useState(false);
  const [threadSearch, setThreadSearch] = useState("");
  const [msgText, setMsgText] = useState("");
  const [directMessages, setDirectMessages] = useState<ERPDirectMessage[]>([]);
  const [selectedDirectUser, setSelectedDirectUser] = useState<ERPUser | null>(null);
  const [groups, setGroups] = useState<DocumentGroupSummary[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<DocumentGroupDetail | null>(null);
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [groupTenderId, setGroupTenderId] = useState("");
  const [groupYear, setGroupYear] = useState(String(new Date().getFullYear()));
  const [uploadNote, setUploadNote] = useState("");
  const [roomMessages, setRoomMessages] = useState<DocumentGroupMessage[]>([]);
  const [roomMessageText, setRoomMessageText] = useState("");
  const [roomView, setRoomView] = useState<"chat" | "documents">("chat");
  const [roomTenders, setRoomTenders] = useState<Tender[]>([]);
  const [selectedRoomTenderId, setSelectedRoomTenderId] = useState("");
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; type: string } | null>(null);
  const [messageMediaUrls, setMessageMediaUrls] = useState<Record<string, string>>({});
  const [roomUsers, setRoomUsers] = useState<ERPUser[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [roomLoading, setRoomLoading] = useState(false);
  const [directMessagesLoadingOlder, setDirectMessagesLoadingOlder] = useState(false);
  const [roomMessagesLoadingOlder, setRoomMessagesLoadingOlder] = useState(false);
  const [roomBusyMessage, setRoomBusyMessage] = useState("");
  const [uploadProgressPercent, setUploadProgressPercent] = useState<number | null>(null);
  const [memberLoading, setMemberLoading] = useState(false);
  const [visibilityLoadingUserId, setVisibilityLoadingUserId] = useState<number | null>(null);
  const [roomError, setRoomError] = useState("");
  const [roomNotice, setRoomNotice] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [recordingMs, setRecordingMs] = useState(0);
  const [voiceSending, setVoiceSending] = useState(false);
  const [showMissingCompanyPrompt, setShowMissingCompanyPrompt] = useState(false);
  const [missingCompanyPromptShown, setMissingCompanyPromptShown] = useState(false);
  const [hiddenDirectMessageIds, setHiddenDirectMessageIds] = useState<Set<number>>(() => readNumberSet(hiddenDirectMessageStorageKey));
  const [hiddenRoomMessageIds, setHiddenRoomMessageIds] = useState<Set<number>>(() => readNumberSet(hiddenRoomMessageStorageKey));
  const [hiddenRoomDocumentIds, setHiddenRoomDocumentIds] = useState<Set<number>>(() => readNumberSet(hiddenRoomDocumentStorageKey));
  const [pendingDirectMessages, setPendingDirectMessages] = useState<PendingDirectMessage[]>(() =>
    readStoredArray(pendingDirectMessageStorageKey, isPendingDirectMessage)
  );
  const [pendingRoomMessages, setPendingRoomMessages] = useState<PendingRoomMessage[]>(() =>
    readStoredArray(pendingRoomMessageStorageKey, isPendingRoomMessage)
  );
  const [documentVersionsTarget, setDocumentVersionsTarget] = useState<DocumentGroupDocument | null>(null);
  const [documentVersions, setDocumentVersions] = useState<DocumentGroupDocumentVersion[]>([]);
  const [documentVersionsLoading, setDocumentVersionsLoading] = useState(false);
  const [directActionTarget, setDirectActionTarget] = useState<DirectActionTarget | null>(null);
  const [roomActionTarget, setRoomActionTarget] = useState<RoomActionTarget | null>(null);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const messageRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const [highlightedMessageId, setHighlightedMessageId] = useState<number | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const voiceChunksRef = useRef<Blob[]>([]);
  const recordStartedAtRef = useRef(0);
  const recordCancelRef = useRef(false);
  const recordingTargetRef = useRef<RecordingTarget>("direct");
  const recordStreamRef = useRef<MediaStream | null>(null);
  const recordTimerRef = useRef<number | null>(null);
  const directThreadScrollRef = useRef<HTMLDivElement | null>(null);
  const roomThreadScrollRef = useRef<HTMLDivElement | null>(null);
  const messageMediaUrlsRef = useRef<Record<string, string>>({});

  const mergeMessagesById = <T extends { id: number }>(current: T[], incoming: T[]) => {
    const merged = new Map<number, T>();
    [...current, ...incoming].forEach(item => merged.set(item.id, item));
    return Array.from(merged.values());
  };

  useEffect(() => {
    writeNumberSet(hiddenDirectMessageStorageKey, hiddenDirectMessageIds);
  }, [hiddenDirectMessageIds, hiddenDirectMessageStorageKey]);

  useEffect(() => {
    writeNumberSet(hiddenRoomMessageStorageKey, hiddenRoomMessageIds);
  }, [hiddenRoomMessageIds, hiddenRoomMessageStorageKey]);

  useEffect(() => {
    writeNumberSet(hiddenRoomDocumentStorageKey, hiddenRoomDocumentIds);
  }, [hiddenRoomDocumentIds, hiddenRoomDocumentStorageKey]);

  useEffect(() => {
    writeStoredArray(pendingDirectMessageStorageKey, pendingDirectMessages);
  }, [pendingDirectMessages, pendingDirectMessageStorageKey]);

  useEffect(() => {
    writeStoredArray(pendingRoomMessageStorageKey, pendingRoomMessages);
  }, [pendingRoomMessages, pendingRoomMessageStorageKey]);

  const userPhoto = (target: ERPUser | AuthUser | DocumentGroupMember | null | undefined) => {
    void profilePhotoVersion;
    if (!target) return "";
    if ("user_id" in target) return readProfilePhoto(target.user_id || target.email || target.name);
    return readProfilePhoto(target.id || target.email);
  };

  const availableRoomUsers = useMemo(() => {
    if (!selectedGroup) return roomUsers;
    const memberIds = new Set(selectedGroup.members.map(member => member.user_id));
    return roomUsers.filter(roomUser => roomUser.id !== user.id && !memberIds.has(roomUser.id));
  }, [roomUsers, selectedGroup, user.id]);

  const roomFeed = useMemo(() => {
    const messageItems = roomMessages.filter(message => !hiddenRoomMessageIds.has(message.id)).map(message => ({
      kind: "message" as const,
      id: `message-${message.id}`,
      time: message.created_at,
      message,
      document: null,
    }));
    const documentItems = (selectedGroup?.documents || []).filter(document => !hiddenRoomDocumentIds.has(document.id)).map(document => ({
      kind: "document" as const,
      id: `document-${document.id}`,
      time: document.created_at,
      message: null,
      document,
    }));
    return [...messageItems, ...documentItems].sort((left, right) =>
      new Date(left.time).getTime() - new Date(right.time).getTime()
    );
  }, [hiddenRoomDocumentIds, hiddenRoomMessageIds, roomMessages, selectedGroup]);
  const groupedRoomDocuments = useMemo(() =>
    groupDocumentsByYearTender((selectedGroup?.documents || []).filter(document => !hiddenRoomDocumentIds.has(document.id))),
    [hiddenRoomDocumentIds, selectedGroup]);
  const threadSearchTerm = threadSearch.toLocaleLowerCase("tr-TR").trim();
  const threadMatches = (...values: Array<string | number | null | undefined>) => {
    if (!threadSearchTerm) return true;
    return values
      .filter(value => value !== null && value !== undefined)
      .some(value => String(value).toLocaleLowerCase("tr-TR").includes(threadSearchTerm));
  };
  const userDirectorySections = useMemo(() => {
    const byName = (left: ERPUser, right: ERPUser) => left.name.localeCompare(right.name, "tr", { sensitivity: "base" });
    const approvedUsers = roomUsers.filter(roomUser => roomUser.approved_at);
    return [
      {
        title: "Yöneticiler",
        items: approvedUsers.filter(roomUser => roomUser.role === "admin").sort(byName),
      },
      {
        title: "Kullanıcılar",
        items: approvedUsers.filter(roomUser => roomUser.role !== "admin").sort(byName),
      },
    ];
  }, [roomUsers]);

  const sortedDirectMessages = useMemo(() =>
    directMessages.filter(message => !hiddenDirectMessageIds.has(message.id)).sort((left, right) =>
      new Date(left.created_at).getTime() - new Date(right.created_at).getTime()
    ), [directMessages, hiddenDirectMessageIds]);

  const visibleDirectMessages = useMemo(() => {
    const currentUserId = user.id;
    return sortedDirectMessages.filter(message => {
      const involvesCurrentUser = user.role === "admin"
        ? message.sender_type === "admin" || message.recipient_type === "admin"
        : message.sender_user_id === currentUserId || message.recipient_user_id === currentUserId;
      if (!involvesCurrentUser) return false;

      if (selectedDirectUser) {
        if (selectedDirectUser.role === "admin") {
          return message.sender_type === "admin" || message.recipient_type === "admin";
        }
        return message.sender_user_id === selectedDirectUser.id || message.recipient_user_id === selectedDirectUser.id;
      }

      return message.sender_type === "admin" || message.recipient_type === "admin";
    });
  }, [selectedDirectUser, sortedDirectMessages, user.id, user.role]);
  const filteredVisibleDirectMessages = useMemo(() =>
    visibleDirectMessages.filter(message => threadMatches(
      message.body,
      message.sender_name,
      message.recipient_name,
      message.message_kind === "voice" ? "ses mesajı" : "",
      message.message_kind === "image" ? "görsel fotoğraf resim" : "",
      message.message_kind === "file" ? "doküman belge dosya" : ""
    )),
    [threadSearchTerm, visibleDirectMessages]);

  // Server messages already delivered (matched by client_message_id) so a pending bubble
  // isn't shown twice if a poll/SSE refresh lands the server copy before the POST resolves.
  const deliveredClientMessageIds = useMemo(
    () => new Set(sortedDirectMessages.map(message => message.client_message_id).filter(Boolean)),
    [sortedDirectMessages]);
  const pendingDirectVisible = useMemo(() => pendingDirectMessages.filter(message => {
    if (deliveredClientMessageIds.has(message.client_message_id)) return false;
    if (selectedDirectUser) return message.recipient_user_id === selectedDirectUser.id;
    return message.recipient_user_id === null;
  }).sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()), [pendingDirectMessages, selectedDirectUser, deliveredClientMessageIds]);
  const filteredPendingDirectVisible = useMemo(() =>
    pendingDirectVisible.filter(message => threadMatches(message.body, "gönderilemedi gönderiliyor bekliyor")),
    [pendingDirectVisible, threadSearchTerm]);

  const deliveredRoomClientMessageIds = useMemo(
    () => new Set(roomMessages.map(message => message.client_message_id).filter(Boolean)),
    [roomMessages]);
  const pendingRoomVisible = useMemo(() => pendingRoomMessages.filter(message =>
    selectedGroup && message.group_id === selectedGroup.group.id
    && !deliveredRoomClientMessageIds.has(message.client_message_id)
  ).sort((left, right) => new Date(left.created_at).getTime() - new Date(right.created_at).getTime()), [pendingRoomMessages, selectedGroup, deliveredRoomClientMessageIds]);
  const filteredPendingRoomVisible = useMemo(() =>
    pendingRoomVisible.filter(message => threadMatches(message.body, "gönderilemedi gönderiliyor bekliyor")),
    [pendingRoomVisible, threadSearchTerm]);
  const filteredRoomFeed = useMemo(() =>
    roomFeed.filter(item => {
      if (item.kind === "message" && item.message) {
        return threadMatches(
          item.message.body,
          item.message.author_name,
          item.message.message_kind === "voice" ? "ses mesajı" : "",
          item.message.message_kind === "image" ? "görsel fotoğraf resim" : "",
          item.message.message_kind === "file" ? "doküman belge dosya" : ""
        );
      }
      if (item.kind === "document" && item.document) {
        const document = item.document;
        return threadMatches(
          document.note,
          document.uploaded_by,
          document.document.original_filename,
          document.document.stored_filename,
          document.document.document_type,
          document.document.organization,
          document.document.internal_unit,
          document.document.tender_id,
          document.tender_id,
          document.year
        );
      }
      return true;
    }),
    [roomFeed, threadSearchTerm]);
  const filteredGroupedRoomDocuments = useMemo(() => {
    if (!threadSearchTerm) return groupedRoomDocuments;
    return groupedRoomDocuments
      .map(yearGroup => ({
        ...yearGroup,
        tenders: yearGroup.tenders
          .map(tenderGroup => ({
            ...tenderGroup,
            items: tenderGroup.items.filter(item => threadMatches(
              yearGroup.year,
              tenderGroup.tenderId,
              item.note,
              item.uploaded_by,
              item.document.original_filename,
              item.document.stored_filename,
              item.document.document_type,
              item.document.organization,
              item.document.internal_unit
            )),
          }))
          .filter(tenderGroup => tenderGroup.items.length > 0),
      }))
      .filter(yearGroup => yearGroup.tenders.length > 0);
  }, [groupedRoomDocuments, threadSearchTerm]);

  const directThreadTitle = selectedDirectUser?.name || (user.role === "admin" ? "Konuşma" : "Admin ile Konuşma");
  const unreadDirectMessageCount = sortedDirectMessages.filter(message =>
    !message.read_at
    && (user.role === "admin"
      ? message.recipient_type === "admin"
      : message.recipient_user_id === user.id)
  ).length;

  const mediaCacheKey = (scope: "direct" | "room", messageId: number) => `${scope}:${messageId}`;

  const messageMediaSource = (scope: "direct" | "room", message: MessageWithMedia) =>
    messageMediaUrls[mediaCacheKey(scope, message.id)] || message.media_data || "";

  const messageMediaPayload = (message: MessageWithMedia) =>
    message.media_ref || message.media_data || null;

  const resolveMessageMediaUrl = async (scope: "direct" | "room", message: MessageWithMedia) => {
    const key = mediaCacheKey(scope, message.id);
    if (messageMediaUrlsRef.current[key]) return messageMediaUrlsRef.current[key];
    if (message.media_data) return message.media_data;
    if (!message.media_url) return "";
    const blob = await getAuthenticatedMediaBlob(message.media_url);
    const objectUrl = URL.createObjectURL(blob);
    setMessageMediaUrls(prev => {
      if (prev[key]) {
        URL.revokeObjectURL(objectUrl);
        return prev;
      }
      return { ...prev, [key]: objectUrl };
    });
    return objectUrl;
  };

  useEffect(() => {
    messageMediaUrlsRef.current = messageMediaUrls;
  }, [messageMediaUrls]);

  useEffect(() => () => {
    Object.values(messageMediaUrlsRef.current).forEach(url => {
      if (url.startsWith("blob:")) URL.revokeObjectURL(url);
    });
  }, []);

  useEffect(() => {
    const candidates = [
      ...visibleDirectMessages.map(message => ({ scope: "direct" as const, message })),
      ...roomMessages.map(message => ({ scope: "room" as const, message })),
    ].filter(({ scope, message }) =>
      message.media_url
      && !messageMediaUrlsRef.current[mediaCacheKey(scope, message.id)]
    );
    if (candidates.length === 0) return;
    let cancelled = false;
    candidates.forEach(({ scope, message }) => {
      void getAuthenticatedMediaBlob(message.media_url!)
        .then(blob => {
          const objectUrl = URL.createObjectURL(blob);
          if (cancelled) {
            URL.revokeObjectURL(objectUrl);
            return;
          }
          const key = mediaCacheKey(scope, message.id);
          setMessageMediaUrls(prev => {
            if (prev[key]) {
              URL.revokeObjectURL(objectUrl);
              return prev;
            }
            return { ...prev, [key]: objectUrl };
          });
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [roomMessages, visibleDirectMessages]);

  const directMessageMatchesUser = (message: ERPDirectMessage, targetUser: ERPUser) => {
    if (targetUser.role === "admin") {
      return message.sender_type === "admin" || message.recipient_type === "admin";
    }
    return message.sender_user_id === targetUser.id || message.recipient_user_id === targetUser.id;
  };

  const lastDirectMessageForUser = (targetUser: ERPUser) =>
    [...sortedDirectMessages].reverse().find(message => directMessageMatchesUser(message, targetUser));

  const unreadDirectMessageCountForUser = (targetUser: ERPUser) =>
    sortedDirectMessages.filter(message =>
      !message.read_at
      && !(
        user.role === "admin"
          ? message.sender_type === "admin"
          : message.sender_user_id === user.id
      )
      && (targetUser.role === "admin"
        ? message.sender_type === "admin" || message.recipient_type === "admin"
        : message.sender_user_id === targetUser.id || message.recipient_user_id === targetUser.id)
    ).length;

  const lastAdminDirectMessage = [...sortedDirectMessages]
    .reverse()
    .find(message => message.sender_type === "admin" || message.recipient_type === "admin");

  const directConversationUsers = useMemo(() => {
    const approvedUsers = roomUsers.filter(roomUser => roomUser.approved_at && roomUser.id !== user.id);
    return approvedUsers
      .map(roomUser => ({ roomUser, lastMessage: lastDirectMessageForUser(roomUser) }))
      .filter(item => Boolean(item.lastMessage))
      .sort((left, right) =>
        new Date(right.lastMessage!.created_at).getTime() - new Date(left.lastMessage!.created_at).getTime()
      );
  }, [roomUsers, sortedDirectMessages, user.id]);

  const directMessageOwn = (message: ERPDirectMessage) =>
    user.role === "admin"
      ? message.sender_type === "admin"
      : message.sender_user_id === user.id;

  const directMessageNeedsReadMark = (message: ERPDirectMessage) =>
    !directMessageOwn(message)
    && !message.read_at
    && (user.role === "admin"
      ? message.recipient_type === "admin"
      : message.recipient_user_id === user.id);

  const directDeliveryLabel = (message: ERPDirectMessage) => {
    if (message.read_at || message.delivery_status === "read") return "Okundu";
    if (message.delivered_at || message.delivery_status === "delivered") return "Teslim edildi";
    return "Gönderildi";
  };

  const scrollThreadToBottom = (target: "direct" | "room") => {
    const element = target === "direct" ? directThreadScrollRef.current : roomThreadScrollRef.current;
    if (!element) return;
    window.requestAnimationFrame(() => {
      element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    });
  };

  useEffect(() => {
    if (screen !== "thread") return;
    scrollThreadToBottom("direct");
  }, [screen, selectedDirectUser?.id, visibleDirectMessages.length, visibleDirectMessages.at(-1)?.id, pendingDirectVisible.length]);

  useEffect(() => {
    if (screen !== "thread") return;
    const unreadIncoming = visibleDirectMessages.filter(directMessageNeedsReadMark);
    if (unreadIncoming.length === 0) return;
    let cancelled = false;
    const markVisibleMessagesRead = async () => {
      for (const message of unreadIncoming) {
        try {
          const updated = await markERPDirectMessageRead(message.id);
          if (cancelled) return;
          setDirectMessages(prev => prev.map(item => item.id === updated.id ? updated : item));
        } catch (exception) {
          console.warn("Mesaj okundu yapılamadı.", exception);
        }
      }
    };
    void markVisibleMessagesRead();
    return () => {
      cancelled = true;
    };
  }, [screen, selectedDirectUser?.id, visibleDirectMessages.length, visibleDirectMessages.at(-1)?.id]);

  useEffect(() => {
    if (screen !== "room-thread" || roomView !== "chat") return;
    scrollThreadToBottom("room");
  }, [screen, roomView, selectedGroup?.group.id, roomFeed.length, roomFeed.at(-1)?.id, pendingRoomVisible.length]);

  useEffect(() => {
    if (screen !== "room-thread" || roomView !== "chat" || !selectedGroup || roomMessages.length === 0) return;
    const lastMessage = roomMessages.at(-1);
    if (!lastMessage) return;
    const groupId = selectedGroup.group.id;
    void markDocumentGroupMessagesRead(groupId, lastMessage.id)
      .then(() => {
        setGroups(prev => prev.map(group =>
          group.id === groupId ? { ...group, unread_message_count: 0 } : group
        ));
        setSelectedGroup(prev => prev && prev.group.id === groupId
          ? { ...prev, group: { ...prev.group, unread_message_count: 0 } }
          : prev);
      })
      .catch(exception => {
        console.warn("Oda mesajları okundu yapılamadı.", exception);
      });
  }, [screen, roomView, selectedGroup?.group.id, roomMessages.length, roomMessages.at(-1)?.id]);

  const directMessageActionTitle = (message: ERPDirectMessage) => {
    if (message.message_kind === "voice") return "Ses mesajı";
    if (message.message_kind === "image") return forwardedDocumentName(message.body);
    if (message.message_kind === "file") return forwardedDocumentName(message.body);
    return message.body || "Mesaj";
  };

  const openReplyToDirect = (message: ERPDirectMessage) => {
    const isMine = message.sender_type === (user.role === "admin" ? "admin" : "user") && (user.role === "admin" || message.sender_user_id === user.id);
    setReplyTarget({
      kind: "direct",
      messageId: message.id,
      authorLabel: isMine ? "Siz" : (message.sender_type === "admin" ? "Admin" : message.sender_name),
      preview: directMessageActionTitle(message),
    });
  };

  const openReplyToRoom = (message: DocumentGroupMessage) => {
    setReplyTarget({
      kind: "room",
      messageId: message.id,
      authorLabel: message.author_user_id === user.id ? "Siz" : message.author_name,
      preview: message.message_kind === "voice" ? "Ses mesajı" : (message.body || "Mesaj"),
    });
  };

  const cancelReply = () => setReplyTarget(null);

  const scrollToMessage = (messageId: number) => {
    const node = messageRefs.current.get(messageId);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      setHighlightedMessageId(messageId);
      window.setTimeout(() => setHighlightedMessageId(current => current === messageId ? null : current), 1500);
    }
  };

  const refreshDirectMessages = async () => {
    try {
      const latest = await getERPDirectMessages(100);
      setDirectMessages(prev => reconcileNewestWindow(prev, latest));
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Mesajlar yüklenemedi.");
    }
  };

  const openDirectThread = (targetUser: ERPUser | null) => {
    setSelectedDirectUser(targetUser);
    setThreadSearch("");
    setRoomError("");
    setRoomNotice("");
    setReplyTarget(null);
    setScreen("thread");
  };

  const openPersonThread = (targetUser: ERPUser) => {
    if (targetUser.id === user.id) return;
    openDirectThread(user.role !== "admin" && targetUser.role === "admin" ? null : targetUser);
  };

  const openContentSearchResult = (result: CommunicationSearchResult) => {
    if (result.type === "room_message" || result.type === "room_document") {
      if (result.group_id) void openGroup(result.group_id);
      return;
    }
    if (!result.other_user_id) {
      openDirectThread(null);
      return;
    }
    const existing = roomUsers.find(roomUser => roomUser.id === result.other_user_id);
    openPersonThread(existing || {
      id: result.other_user_id,
      name: result.title,
      role: "user",
      status: "offline",
      email: null,
      phone: null,
      document_network_visible: false,
      last_seen_at: null,
      approved_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });
  };

  const refreshCompanyChat = async () => {
    try {
      setCompanyChatMessages(await getCompanyChatMessages());
    } catch (exception) {
      console.warn("Şirket geneli mesajlar yenilenemedi.", exception);
    }
  };

  const openCompanyChat = () => {
    setCompanyChatError("");
    setScreen("company-chat");
    setCompanyChatLoading(true);
    getCompanyChatMessages()
      .then(setCompanyChatMessages)
      .catch(exception => setCompanyChatError(exception instanceof Error ? exception.message : "Mesajlar yüklenemedi."))
      .finally(() => setCompanyChatLoading(false));
  };

  const sendCompanyChatMsg = async () => {
    const body = companyChatText.trim();
    if (!body || companyChatSending) return;
    setCompanyChatSending(true);
    setCompanyChatError("");
    try {
      const sent = await sendCompanyChatMessage(body);
      setCompanyChatMessages(prev => [...prev, sent]);
      setCompanyChatText("");
    } catch (exception) {
      setCompanyChatError(exception instanceof Error ? exception.message : "Mesaj gönderilemedi.");
    } finally {
      setCompanyChatSending(false);
    }
  };

  const resolveDirectTargetFromMessage = (message: ERPDirectMessage): ERPUser | null => {
    const otherUserId = user.role === "admin"
      ? message.sender_user_id ?? message.recipient_user_id
      : message.sender_user_id === user.id
        ? message.recipient_user_id
        : message.sender_user_id;
    if (!otherUserId) return null;
    const existing = roomUsers.find(roomUser => roomUser.id === otherUserId);
    if (existing) return existing;
    const name = message.sender_user_id === otherUserId ? message.sender_name : message.recipient_name;
    return {
      id: otherUserId,
      name,
      role: "user",
      status: "offline",
      email: null,
      phone: null,
      document_network_visible: false,
      last_seen_at: null,
      approved_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
  };

  const markPendingDirectMessage = (localId: string, status: PendingMessageStatus, error?: string) => {
    setPendingDirectMessages(prev => prev.map(message =>
      message.local_id === localId ? { ...message, status, error } : message
    ));
  };

  const markPendingRoomMessage = (localId: string, status: PendingMessageStatus, error?: string) => {
    setPendingRoomMessages(prev => prev.map(message =>
      message.local_id === localId ? { ...message, status, error } : message
    ));
  };

  const commitPendingDirectMessage = (localId: string, sent: ERPDirectMessage) => {
    setPendingDirectMessages(prev => prev.filter(message => message.local_id !== localId));
    setDirectMessages(prev => mergeMessagesById(prev, [sent]));
  };

  const commitPendingRoomMessage = (localId: string, sent: DocumentGroupMessage) => {
    setPendingRoomMessages(prev => prev.filter(message => message.local_id !== localId));
    setRoomMessages(prev => mergeMessagesById(prev, [sent]));
  };

  const sendPendingDirectMessage = async (pending: PendingDirectMessage) => {
    markPendingDirectMessage(pending.local_id, "sending");
    try {
      const sent = await sendERPDirectMessage({
        body: pending.body,
        recipientUserId: pending.recipient_user_id,
        clientMessageId: pending.client_message_id,
        replyToMessageId: pending.reply_to_message_id,
      });
      commitPendingDirectMessage(pending.local_id, sent);
    } catch (exception) {
      markPendingDirectMessage(
        pending.local_id,
        "failed",
        exception instanceof Error ? exception.message : "Mesaj gönderilemedi."
      );
    }
  };

  const sendPendingRoomMessage = async (pending: PendingRoomMessage) => {
    markPendingRoomMessage(pending.local_id, "sending");
    try {
      const message = await sendDocumentGroupMessage(pending.group_id, {
        body: pending.body,
        clientMessageId: pending.client_message_id,
        replyToMessageId: pending.reply_to_message_id,
      });
      commitPendingRoomMessage(pending.local_id, message);
      setGroups(await getDocumentGroups());
    } catch (exception) {
      markPendingRoomMessage(
        pending.local_id,
        "failed",
        exception instanceof Error ? exception.message : "Alan mesajı gönderilemedi."
      );
    }
  };

  const retryPendingDirectMessage = async (localId: string) => {
    const pending = pendingDirectMessages.find(message => message.local_id === localId);
    if (!pending) return;
    await sendPendingDirectMessage(pending);
  };

  const retryPendingRoomMessage = async (localId: string) => {
    const pending = pendingRoomMessages.find(message => message.local_id === localId);
    if (!pending) return;
    await sendPendingRoomMessage(pending);
  };

  const sendMsg = async () => {
    const body = msgText.trim();
    if (!body) return;
    setRoomError("");
    setRoomNotice("");
    if (user.role === "admin" && !selectedDirectUser) {
      setRoomError("Mesaj göndermek için bir kişi seçin.");
      return;
    }
    if (selectedDirectUser && selectedDirectUser.id === user.id) {
      setRoomError("Kendinize mesaj gönderemezsiniz.");
      return;
    }
    const pending: PendingDirectMessage = {
      local_id: createClientMessageId(),
      client_message_id: createClientMessageId(),
      recipient_user_id: selectedDirectUser?.id ?? null,
      recipient_name: selectedDirectUser?.name || "Admin",
      body,
      created_at: new Date().toISOString(),
      status: "sending",
      reply_to_message_id: replyTarget?.kind === "direct" ? replyTarget.messageId : null,
    };
    setPendingDirectMessages(prev => [...prev, pending]);
    setMsgText("");
    setReplyTarget(null);
    await sendPendingDirectMessage(pending);
  };

  const sendVoiceMessage = async (mediaData: string, mediaMimeType: string, durationMs: number) => {
    setRoomError("");
    setRoomNotice("");
    if (user.role === "admin" && !selectedDirectUser) {
      setRoomError("Ses mesajı göndermek için bir kişi seçin.");
      return;
    }
    if (selectedDirectUser && selectedDirectUser.id === user.id) {
      setRoomError("Kendinize mesaj gönderemezsiniz.");
      return;
    }
    setVoiceSending(true);
    try {
      const sent = await sendERPDirectMessage({
        body: "Ses mesajı",
        recipientUserId: selectedDirectUser?.id ?? null,
        messageKind: "voice",
        mediaMimeType,
        mediaData,
        mediaDurationMs: durationMs,
        clientMessageId: createClientMessageId(),
      });
      setDirectMessages(prev => mergeMessagesById(prev, [sent]));
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Ses mesajı gönderilemedi.");
    } finally {
      setVoiceSending(false);
    }
  };

  const sendRoomVoiceMessage = async (mediaData: string, mediaMimeType: string, durationMs: number) => {
    if (!selectedGroup) return;
    setRoomError("");
    setRoomNotice("");
    setVoiceSending(true);
    try {
      const message = await sendDocumentGroupMessage(selectedGroup.group.id, {
        body: "Ses mesajı",
        messageKind: "voice",
        mediaMimeType,
        mediaData,
        mediaDurationMs: durationMs,
        clientMessageId: createClientMessageId(),
      });
      setRoomMessages(prev => mergeMessagesById(prev, [message]));
      setGroups(await getDocumentGroups());
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Ses mesajı gönderilemedi.");
    } finally {
      setVoiceSending(false);
    }
  };

  const stopVoiceRecording = (cancel = false) => {
    recordCancelRef.current = cancel;
    mediaRecorderRef.current?.stop();
  };

  const startVoiceRecording = async (target: RecordingTarget = "direct") => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setRoomError("Bu cihazda ses kaydı desteklenmiyor.");
      return;
    }
    setRoomError("");
    try {
      if (navigator.permissions?.query) {
        const microphonePermission = await navigator.permissions.query({ name: "microphone" as PermissionName }).catch(() => null);
        if (microphonePermission?.state === "denied") {
          setRoomError("Mikrofon izni kapalı. Telefon ayarlarından Mobit uygulaması için mikrofon iznini açın ve tekrar deneyin.");
          return;
        }
      }
      recordingTargetRef.current = target;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      recordStreamRef.current = stream;
      mediaRecorderRef.current = recorder;
      voiceChunksRef.current = [];
      recordCancelRef.current = false;
      recordStartedAtRef.current = Date.now();
      setRecordingMs(0);
      recorder.ondataavailable = event => {
        if (event.data.size > 0) voiceChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const duration = Date.now() - recordStartedAtRef.current;
        const chunks = [...voiceChunksRef.current];
        const mimeType = recorder.mimeType || "audio/webm";
        recordStreamRef.current?.getTracks().forEach(track => track.stop());
        recordStreamRef.current = null;
        mediaRecorderRef.current = null;
        voiceChunksRef.current = [];
        setIsRecording(false);
        setRecordingMs(0);
        if (recordTimerRef.current) {
          window.clearInterval(recordTimerRef.current);
          recordTimerRef.current = null;
        }
        if (recordCancelRef.current || chunks.length === 0) return;
        const blob = new Blob(chunks, { type: mimeType });
        const sendTarget = recordingTargetRef.current;
        void blobToDataUrl(blob).then(dataUrl =>
          sendTarget === "room"
            ? sendRoomVoiceMessage(dataUrl, mimeType, duration)
            : sendVoiceMessage(dataUrl, mimeType, duration)
        );
      };
      recorder.start();
      setIsRecording(true);
      recordTimerRef.current = window.setInterval(() => {
        setRecordingMs(Date.now() - recordStartedAtRef.current);
      }, 250);
    } catch (exception) {
      setRoomError(microphoneErrorMessage(exception));
    }
  };

  const refreshGroups = async () => {
    setRoomError("");
    setRoomBusyMessage("Çalışma alanları yenileniyor...");
    setRoomLoading(true);
    try {
      const next = await getDocumentGroups();
      setGroups(next);
      if (selectedGroup && next.some(group => group.id === selectedGroup.group.id)) {
        const [detail, messages] = await Promise.all([
          getDocumentGroup(selectedGroup.group.id),
          getDocumentGroupMessages(selectedGroup.group.id),
        ]);
        setSelectedGroup(detail);
        setRoomMessages(messages);
      }
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Doküman odaları yüklenemedi.");
    } finally {
      setRoomLoading(false);
      setRoomBusyMessage("");
    }
  };

  const refreshCommunicationLists = async () => {
    setRoomError("");
    setRoomBusyMessage("İletişim listesi yenileniyor...");
    setRoomLoading(true);
    try {
      const [nextGroups, nextUsers, nextDirectMessages, nextTenders] = await Promise.all([
        getDocumentGroups(),
        getERPUsers(),
        getERPDirectMessages(100),
        user.role === "admin" ? getTendersPage(0, 100) : Promise.resolve(null),
      ]);
      setGroups(nextGroups);
      setRoomUsers(nextUsers);
      setDirectMessages(nextDirectMessages);
      if (nextTenders) setRoomTenders(nextTenders.items);
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "İletişim listesi yenilenemedi.");
    } finally {
      setRoomLoading(false);
      setRoomBusyMessage("");
    }
  };

  const inboxPullToRefresh = usePullToRefresh(refreshCommunicationLists);

  const refreshRoomUsers = async () => {
    try {
      setRoomUsers(await getERPUsers());
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Kullanıcı listesi yüklenemedi.");
    }
  };

  const refreshRoomTenders = async () => {
    if (user.role !== "admin") return;
    try {
      const page = await getTendersPage(0, 100);
      setRoomTenders(page.items);
    } catch {
      setRoomTenders([]);
    }
  };

  const createRoomCompany = async (companyName: string) => {
    const created = await createCompanyWorkflow({
      organization: companyName,
      year: Number(groupYear) || new Date().getFullYear(),
      internalUnit: "GENEL",
    });
    setRoomTenders(prev => [created, ...prev.filter(item => item.id !== created.id)]);
    return created;
  };

  const openGroup = async (groupId: number) => {
    setRoomError("");
    setRoomNotice("");
    setThreadSearch("");
    setReplyTarget(null);
    setRoomBusyMessage("Çalışma alanı açılıyor...");
    setRoomLoading(true);
    try {
      const [detail, messages] = await Promise.all([
        getDocumentGroup(groupId),
        getDocumentGroupMessages(groupId),
      ]);
      setSelectedGroup(detail);
      setRoomMessages(messages);
      setSelectedRoomTenderId(detail.group.tender_id || "");
      setRoomView("chat");
      setScreen("room-thread");
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Doküman odası açılamadı.");
    } finally {
      setRoomLoading(false);
      setRoomBusyMessage("");
    }
  };

  const createRoom = async () => {
    if (!groupName.trim() || !groupYear.trim()) return;
    setRoomError("");
    setRoomBusyMessage("Çalışma alanı oluşturuluyor...");
    setRoomLoading(true);
    try {
      const detail = await createDocumentGroup({
        name: groupName.trim(),
        description: groupDesc.trim() || undefined,
        tenderId: groupTenderId.trim(),
        year: Number(groupYear),
      });
      setSelectedGroup(detail);
      setRoomMessages([]);
      setGroupName("");
      setGroupDesc("");
      setGroupTenderId("");
      setGroupYear(String(new Date().getFullYear()));
      setSelectedRoomTenderId(detail.group.tender_id || "");
      setGroups(await getDocumentGroups());
      setRoomView("chat");
      setScreen("room-thread");
      if (!detail.group.tender_id && !missingCompanyPromptShown) {
        setMissingCompanyPromptShown(true);
        setShowMissingCompanyPrompt(true);
      }
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Doküman odası oluşturulamadı.");
    } finally {
      setRoomLoading(false);
      setRoomBusyMessage("");
    }
  };

  const uploadRoomFile = async (file: File | undefined) => {
    if (!file || !selectedGroup) return;
    setRoomError("");
    setRoomBusyMessage("Doküman yükleniyor...");
    setUploadProgressPercent(0);
    setRoomLoading(true);
    try {
      const note = [
        selectedRoomTenderId ? `Şirket/workflow: ${selectedRoomTenderId}` : "",
        uploadNote,
      ].filter(Boolean).join("\n");
      const tender = roomTenders.find(item => item.tender_id === selectedRoomTenderId);
      await uploadDocumentGroupFileWithProgress(
        {
          groupId: selectedGroup.group.id,
          file,
          note,
          tenderId: selectedRoomTenderId || selectedGroup.group.tender_id || undefined,
          year: tender?.year || selectedGroup.group.year || undefined,
        },
        percent => setUploadProgressPercent(percent)
      );
      setUploadNote("");
      const [detail, messages] = await Promise.all([
        getDocumentGroup(selectedGroup.group.id),
        getDocumentGroupMessages(selectedGroup.group.id),
      ]);
      setSelectedGroup(detail);
      setRoomMessages(messages);
      setGroups(await getDocumentGroups());
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Doküman yüklenemedi.");
    } finally {
      setRoomLoading(false);
      setRoomBusyMessage("");
      setUploadProgressPercent(null);
    }
  };

  const downloadRoomFile = async (groupDocumentId: number, filename: string | null) => {
    if (!selectedGroup) return;
    setRoomError("");
    try {
      const blob = await getDocumentGroupFileBlob(selectedGroup.group.id, groupDocumentId);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename || "document";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Doküman indirilemedi.");
    }
  };

  const previewRoomFile = async (groupDocument: DocumentGroupDocument) => {
    if (!selectedGroup) return;
    setRoomError("");
    try {
      if (previewFile) URL.revokeObjectURL(previewFile.url);
      const blob = await getDocumentGroupFileBlob(selectedGroup.group.id, groupDocument.id, false);
      const filename = groupDocument.document.original_filename || groupDocument.document.stored_filename || "document";
      setPreviewFile({
        url: URL.createObjectURL(blob),
        name: filename,
        type: blob.type || groupDocument.document.mime_type || "",
      });
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Doküman görüntülenemedi.");
    }
  };

  const openDocumentVersions = async (groupDocument: DocumentGroupDocument) => {
    if (!selectedGroup) return;
    setDocumentVersionsTarget(groupDocument);
    setDocumentVersions([]);
    setDocumentVersionsLoading(true);
    setRoomError("");
    try {
      setDocumentVersions(await getDocumentGroupFileVersions(selectedGroup.group.id, groupDocument.id));
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Doküman geçmişi yüklenemedi.");
    } finally {
      setDocumentVersionsLoading(false);
    }
  };

  const replaceRoomFileVersion = async (groupDocument: DocumentGroupDocument, file: File | undefined) => {
    if (!selectedGroup || !file) return;
    setRoomError("");
    setRoomBusyMessage("Yeni revizyon yükleniyor...");
    setRoomLoading(true);
    try {
      await replaceDocumentGroupFile({
        groupId: selectedGroup.group.id,
        groupDocumentId: groupDocument.id,
        file,
        note: "Yeni revizyon",
      });
      const [detail, messages] = await Promise.all([
        getDocumentGroup(selectedGroup.group.id),
        getDocumentGroupMessages(selectedGroup.group.id),
      ]);
      setSelectedGroup(detail);
      setRoomMessages(messages);
      setGroups(await getDocumentGroups());
      const updatedTarget = detail.documents.find(item => item.id === groupDocument.id);
      if (updatedTarget) {
        setDocumentVersionsTarget(updatedTarget);
        setDocumentVersions(await getDocumentGroupFileVersions(detail.group.id, updatedTarget.id));
      }
      setRoomNotice("Doküman revizyonu yüklendi.");
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Doküman revizyonu yüklenemedi.");
    } finally {
      setRoomLoading(false);
      setRoomBusyMessage("");
    }
  };

  const previewDocumentVersion = async (version: DocumentGroupDocumentVersion) => {
    if (!selectedGroup || !documentVersionsTarget || !version.id) return;
    setRoomError("");
    try {
      if (previewFile) URL.revokeObjectURL(previewFile.url);
      const blob = await getDocumentGroupFileVersionBlob(selectedGroup.group.id, documentVersionsTarget.id, version.id, false);
      const filename = version.document.original_filename || version.document.stored_filename || `v${version.version_number}`;
      setPreviewFile({
        url: URL.createObjectURL(blob),
        name: filename,
        type: blob.type || version.document.mime_type || "",
      });
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Doküman versiyonu görüntülenemedi.");
    }
  };

  const downloadDocumentVersion = async (version: DocumentGroupDocumentVersion) => {
    if (!selectedGroup || !documentVersionsTarget || !version.id) return;
    setRoomError("");
    try {
      const blob = await getDocumentGroupFileVersionBlob(selectedGroup.group.id, documentVersionsTarget.id, version.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = version.document.original_filename || version.document.stored_filename || `v${version.version_number}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Doküman versiyonu indirilemedi.");
    }
  };

  const previewDirectMedia = async (message: ERPDirectMessage) => {
    const url = await resolveMessageMediaUrl("direct", message);
    if (!url) return;
    if (previewFile?.url.startsWith("blob:")) URL.revokeObjectURL(previewFile.url);
    setPreviewFile({
      url,
      name: forwardedDocumentName(message.body),
      type: message.media_mime_type || (message.message_kind === "image" ? "image/" : "application/octet-stream"),
    });
  };

  const downloadDirectMedia = async (message: ERPDirectMessage) => {
    const url = await resolveMessageMediaUrl("direct", message);
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = forwardedDocumentName(message.body);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const previewRoomMessageMedia = async (message: DocumentGroupMessage) => {
    const url = await resolveMessageMediaUrl("room", message);
    if (!url) return;
    if (previewFile?.url.startsWith("blob:")) URL.revokeObjectURL(previewFile.url);
    setPreviewFile({
      url,
      name: forwardedDocumentName(message.body),
      type: message.media_mime_type || (message.message_kind === "image" ? "image/" : "application/octet-stream"),
    });
  };

  const downloadRoomMessageMedia = async (message: DocumentGroupMessage) => {
    const url = await resolveMessageMediaUrl("room", message);
    if (!url) return;
    const link = document.createElement("a");
    link.href = url;
    link.download = forwardedDocumentName(message.body);
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const deleteDirectMessageForMe = async () => {
    if (!directActionTarget) return;
    setRoomError("");
    const messageId = directActionTarget.messageId;
    try {
      await deleteERPDirectMessage(messageId, "me");
      setHiddenDirectMessageIds(prev => new Set(prev).add(messageId));
      setDirectActionTarget(null);
      setRoomNotice("Mesaj sizden silindi.");
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Mesaj sizden silinemedi.");
    }
  };

  const deleteDirectMessageForEveryone = async () => {
    if (!directActionTarget) return;
    setRoomError("");
    try {
      await deleteERPDirectMessage(directActionTarget.messageId, "everyone");
      setDirectMessages(prev => prev.filter(message => message.id !== directActionTarget.messageId));
      setDirectActionTarget(null);
      setRoomNotice("Mesaj herkesten silindi.");
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Mesaj silinemedi.");
    }
  };

  const forwardDirectMessageToPerson = async (person: ERPUser) => {
    if (!directActionTarget) return;
    const message = directMessages.find(item => item.id === directActionTarget.messageId);
    if (!message) return;
    setRoomError("");
    try {
      const sent = await sendERPDirectMessage({
        body: message.message_kind === "text" || !message.message_kind
          ? `İletildi\n${message.body}`
          : message.message_kind === "voice"
            ? "İletilen ses mesajı"
            : `İletilen doküman: ${forwardedDocumentName(message.body)}`,
        recipientUserId: user.role !== "admin" && person.role === "admin" ? null : person.id,
        messageKind: (message.message_kind as "text" | "voice" | "image" | "file") || "text",
        mediaMimeType: message.media_mime_type || null,
        mediaData: messageMediaPayload(message),
        mediaDurationMs: message.media_duration_ms || null,
        clientMessageId: createClientMessageId(),
      });
      setDirectMessages(prev => [...prev, sent]);
      setDirectActionTarget(null);
      setRoomNotice(`${person.name} kişisine başarıyla iletildi.`);
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "İletme işlemi tamamlanamadı.");
    }
  };

  const forwardDirectMessageToRoom = async (room: DocumentGroupSummary) => {
    if (!directActionTarget) return;
    const message = directMessages.find(item => item.id === directActionTarget.messageId);
    if (!message) return;
    setRoomError("");
    try {
      await sendDocumentGroupMessage(room.id, {
        body: message.message_kind === "text" || !message.message_kind
          ? `İletildi\n${message.body}`
          : message.message_kind === "voice"
            ? "İletilen ses mesajı"
            : `İletilen doküman: ${forwardedDocumentName(message.body)}`,
        messageKind: (message.message_kind as "text" | "voice" | "image" | "file") || "text",
        mediaMimeType: message.media_mime_type || null,
        mediaData: messageMediaPayload(message),
        mediaDurationMs: message.media_duration_ms || null,
        clientMessageId: createClientMessageId(),
      });
      setGroups(await getDocumentGroups());
      setDirectActionTarget(null);
      setRoomNotice(`${room.name} odasına başarıyla iletildi.`);
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "İletme işlemi tamamlanamadı.");
    }
  };

  const closePreviewFile = () => {
    if (previewFile?.url.startsWith("blob:")) URL.revokeObjectURL(previewFile.url);
    setPreviewFile(null);
  };

  const loadOlderDirectMessages = async () => {
    if (directMessagesLoadingOlder || directMessages.length === 0) return;
    const beforeId = Math.min(...directMessages.map(message => message.id));
    setDirectMessagesLoadingOlder(true);
    setRoomError("");
    try {
      const olderMessages = await getERPDirectMessages(50, beforeId);
      if (olderMessages.length === 0) {
        setRoomNotice("Daha eski mesaj bulunamadı.");
      } else {
        setDirectMessages(prev => mergeMessagesById(prev, olderMessages));
      }
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Eski mesajlar yüklenemedi.");
    } finally {
      setDirectMessagesLoadingOlder(false);
    }
  };

  const loadOlderRoomMessages = async () => {
    if (!selectedGroup || roomMessagesLoadingOlder || roomMessages.length === 0) return;
    const beforeId = Math.min(...roomMessages.map(message => message.id));
    setRoomMessagesLoadingOlder(true);
    setRoomError("");
    try {
      const olderMessages = await getDocumentGroupMessages(selectedGroup.group.id, 50, beforeId);
      if (olderMessages.length === 0) {
        setRoomNotice("Daha eski mesaj bulunamadı.");
      } else {
        setRoomMessages(prev => mergeMessagesById(prev, olderMessages));
      }
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Eski oda mesajları yüklenemedi.");
    } finally {
      setRoomMessagesLoadingOlder(false);
    }
  };

  const sendRoomMessage = async () => {
    const body = roomMessageText.trim();
    if (!selectedGroup || !body) return;
    setRoomError("");
    setRoomNotice("");
    const pending: PendingRoomMessage = {
      local_id: createClientMessageId(),
      client_message_id: createClientMessageId(),
      group_id: selectedGroup.group.id,
      body,
      author_name: user.name,
      created_at: new Date().toISOString(),
      status: "sending",
      reply_to_message_id: replyTarget?.kind === "room" ? replyTarget.messageId : null,
    };
    setPendingRoomMessages(prev => [...prev, pending]);
    setRoomMessageText("");
    setReplyTarget(null);
    await sendPendingRoomMessage(pending);
  };

  const deleteRoomItemForMe = async () => {
    if (!roomActionTarget) return;
    if (!selectedGroup && roomActionTarget.kind === "message") return;
    setRoomError("");
    const target = roomActionTarget;
    try {
      if (target.kind === "message" && selectedGroup) {
        await deleteDocumentGroupMessage(selectedGroup.group.id, target.id, "me");
        setHiddenRoomMessageIds(prev => new Set(prev).add(target.id));
        setRoomNotice("Mesaj sizden silindi.");
      } else {
        setHiddenRoomDocumentIds(prev => new Set(prev).add(target.id));
        setRoomNotice("Doküman sizden gizlendi.");
      }
      setRoomActionTarget(null);
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Öğe sizden silinemedi.");
    }
  };

  const deleteRoomItemForEveryone = async () => {
    if (!selectedGroup || !roomActionTarget) return;
    setRoomError("");
    try {
      if (roomActionTarget.kind === "message") {
        await deleteDocumentGroupMessage(selectedGroup.group.id, roomActionTarget.id, "everyone");
        setRoomMessages(prev => prev.filter(message => message.id !== roomActionTarget.id));
      } else {
        await deleteDocumentGroupDocument(selectedGroup.group.id, roomActionTarget.id);
        const detail = await getDocumentGroup(selectedGroup.group.id);
        setSelectedGroup(detail);
      }
      setGroups(await getDocumentGroups());
      setRoomActionTarget(null);
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Silme işlemi tamamlanamadı.");
    }
  };

  const forwardRoomItemToPerson = async (person: ERPUser) => {
    if (!selectedGroup || !roomActionTarget) return;
    setRoomError("");
    try {
      if (roomActionTarget.kind === "message") {
        const message = roomMessages.find(item => item.id === roomActionTarget.id);
        if (!message) return;
        const sent = await sendERPDirectMessage({
          body: message.message_kind === "text" || !message.message_kind
            ? `İletildi\n${message.body}`
            : message.message_kind === "voice"
              ? "İletilen ses mesajı"
              : `İletilen doküman: ${forwardedDocumentName(message.body)}`,
          recipientUserId: person.id,
          messageKind: (message.message_kind as "text" | "voice" | "image" | "file") || "text",
          mediaMimeType: message.media_mime_type || null,
          mediaData: messageMediaPayload(message),
          mediaDurationMs: message.media_duration_ms || null,
          clientMessageId: createClientMessageId(),
        });
        setDirectMessages(prev => [...prev, sent]);
      } else {
        const document = selectedGroup.documents.find(item => item.id === roomActionTarget.id);
        const filename = document?.document.original_filename || document?.document.stored_filename || "Doküman";
        if (!document) return;
        const blob = await getDocumentGroupFileBlob(selectedGroup.group.id, document.id, false);
        const mediaData = await blobToDataUrl(blob);
        const mimeType = blob.type || document.document.mime_type || "application/octet-stream";
        const sent = await sendERPDirectMessage({
          body: `İletilen doküman: ${filename}`,
          recipientUserId: person.id,
          messageKind: mimeType.startsWith("image/") ? "image" : "file",
          mediaMimeType: mimeType,
          mediaData,
          clientMessageId: createClientMessageId(),
        });
        setDirectMessages(prev => [...prev, sent]);
      }
      setRoomActionTarget(null);
      setRoomNotice(`${person.name} kişisine başarıyla iletildi.`);
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "İletme işlemi tamamlanamadı.");
    }
  };

  const forwardRoomItemToRoom = async (room: DocumentGroupSummary) => {
    if (!selectedGroup || !roomActionTarget) return;
    setRoomError("");
    try {
      if (roomActionTarget.kind === "message") {
        const message = roomMessages.find(item => item.id === roomActionTarget.id);
        if (!message) return;
        await sendDocumentGroupMessage(room.id, {
          body: message.message_kind === "text" || !message.message_kind
            ? `İletildi\n${message.body}`
            : message.message_kind === "voice"
              ? "İletilen ses mesajı"
              : `İletilen doküman: ${forwardedDocumentName(message.body)}`,
          messageKind: (message.message_kind as "text" | "voice" | "image" | "file") || "text",
          mediaMimeType: message.media_mime_type || null,
          mediaData: messageMediaPayload(message),
          mediaDurationMs: message.media_duration_ms || null,
          clientMessageId: createClientMessageId(),
        });
      } else {
        const document = selectedGroup.documents.find(item => item.id === roomActionTarget.id);
        if (!document) return;
        const blob = await getDocumentGroupFileBlob(selectedGroup.group.id, document.id, false);
        const filename = document.document.original_filename || document.document.stored_filename || "dokuman";
        await uploadDocumentGroupFile({
          groupId: room.id,
          file: new File([blob], filename, { type: blob.type || document.document.mime_type || "application/octet-stream" }),
          note: `İletilen doküman: ${selectedGroup.group.name}`,
          tenderId: room.tender_id || document.tender_id || undefined,
          year: room.year || document.year || undefined,
        });
      }
      setRoomActionTarget(null);
      setGroups(await getDocumentGroups());
      setRoomNotice(`${room.name} odasına başarıyla iletildi.`);
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "İletme işlemi tamamlanamadı.");
    }
  };

  const addRoomMember = async () => {
    if (!selectedGroup || !selectedMemberId) return;
    setRoomError("");
    setMemberLoading(true);
    try {
      const detail = await addDocumentGroupMember(selectedGroup.group.id, Number(selectedMemberId));
      setSelectedGroup(detail);
      setSelectedMemberId("");
      setGroups(await getDocumentGroups());
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Alan üyesi eklenemedi.");
    } finally {
      setMemberLoading(false);
    }
  };

  const removeRoomMember = async (memberUserId: number) => {
    if (!selectedGroup) return;
    setRoomError("");
    setMemberLoading(true);
    try {
      const detail = await removeDocumentGroupMember(selectedGroup.group.id, memberUserId);
      setSelectedGroup(detail);
      setGroups(await getDocumentGroups());
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Alan üyesi çıkarılamadı.");
    } finally {
      setMemberLoading(false);
    }
  };

  const toggleDocumentNetworkVisibility = async (targetUser: ERPUser) => {
    if (user.role !== "admin") return;
    setRoomError("");
    setVisibilityLoadingUserId(targetUser.id);
    try {
      const updated = await updateERPUserDocumentNetworkVisibility(
        targetUser.id,
        !targetUser.document_network_visible
      );
      setRoomUsers(prev => prev.map(item => item.id === updated.id ? updated : item));
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Doküman ağı yetkisi güncellenemedi.");
    } finally {
      setVisibilityLoadingUserId(null);
    }
  };

  const selectedCompanyLabel = (tenderId: string | null | undefined) => {
    if (!tenderId) return "";
    return roomTenders.find(item => item.tender_id === tenderId)?.organization || tenderId;
  };

  const communicationSearchTerm = communicationSearch.toLocaleLowerCase("tr-TR").trim();
  const communicationMatches = (...values: Array<string | number | null | undefined>) => {
    if (!communicationSearchTerm) return true;
    return values
      .filter(value => value !== null && value !== undefined)
      .some(value => String(value).toLocaleLowerCase("tr-TR").includes(communicationSearchTerm));
  };
  const groupMatchesCommunicationSearch = (group: DocumentGroupSummary) =>
    communicationMatches(
      group.name,
      group.description,
      group.tender_id,
      selectedCompanyLabel(group.tender_id),
      `${group.document_count} doküman`,
      `${group.member_count} üye`
    );
  const visibleGroups = groups.filter(groupMatchesCommunicationSearch);
  const visibleDirectConversationUsers = directConversationUsers.filter(({ roomUser, lastMessage }) =>
    communicationMatches(
      roomUser.name,
      roomUser.email,
      roomUser.role === "admin" ? "admin yönetici" : "kullanıcı çalışan",
      lastMessage?.body,
      lastMessage?.message_kind === "voice" ? "ses mesajı" : ""
    )
  );
  const visibleUserDirectorySections = userDirectorySections.map(section => ({
    ...section,
    items: section.items.filter(roomUser => {
      const lastMessage = lastDirectMessageForUser(roomUser);
      return communicationMatches(
        roomUser.name,
        roomUser.email,
        roomUser.role === "admin" ? "admin yönetici" : "kullanıcı çalışan",
        lastMessage?.body,
        lastMessage?.message_kind === "voice" ? "ses mesajı" : ""
      );
    }),
  }));
  const showAdminDirectShortcut = user.role !== "admin" && communicationMatches(
    "Admin",
    "admin yönetici",
    "kişisel konuşma",
    lastAdminDirectMessage?.body
  );
  const forwardPeople = user.role === "admin"
    ? roomUsers.filter(item => item.id !== user.id)
    : [
        {
          id: 0,
          name: "Admin",
          role: "admin",
          status: "online",
          email: "admin@mobit.com.tr",
          phone: null,
          document_network_visible: false,
          last_seen_at: null,
          approved_at: new Date().toISOString(),
          created_at: new Date().toISOString(),
        } satisfies ERPUser,
        ...roomUsers.filter(item => item.id !== user.id && item.role !== "admin"),
      ];

  const updateSelectedGroupCompany = async (selection: { tenderId: string; companyName: string; year?: number }) => {
    if (!selectedGroup) return;
    const hasDocuments = selectedGroup.documents.length > 0;
    const shouldTransfer = hasDocuments
      ? window.confirm("Mevcut dokümanları yeni seçilen şirket klasörüne aktarmak ister misiniz?")
      : false;
    setRoomError("");
    setRoomBusyMessage("Şirket bağlantısı güncelleniyor...");
    setRoomLoading(true);
    try {
      const detail = await updateDocumentGroup({
        groupId: selectedGroup.group.id,
        name: selectedGroup.group.name,
        description: selectedGroup.group.description,
        tenderId: selection.tenderId,
        year: selection.year || selectedGroup.group.year || new Date().getFullYear(),
        transferExistingDocuments: shouldTransfer,
      });
      const messages = await getDocumentGroupMessages(selectedGroup.group.id);
      setSelectedGroup(detail);
      setRoomMessages(messages);
      setSelectedRoomTenderId(detail.group.tender_id || "");
      setGroups(await getDocumentGroups());
      setShowMissingCompanyPrompt(false);
    } catch (exception) {
      setRoomError(exception instanceof Error ? exception.message : "Şirket bağlantısı güncellenemedi.");
    } finally {
      setRoomLoading(false);
      setRoomBusyMessage("");
    }
  };

  useEffect(() => {
    if (activeTab === "all" || activeTab === "rooms") {
      void refreshGroups();
    }
    if (activeTab === "all" || activeTab === "people" || activeTab === "rooms") {
      void refreshRoomUsers();
    }
  }, [activeTab]);

  useEffect(() => {
    void refreshGroups();
    void refreshRoomUsers();
    void refreshDirectMessages();
    void refreshRoomTenders();
  }, [user.id, user.role]);

  useEffect(() => {
    const term = communicationSearch.trim();
    if (term.length < 2) {
      setContentSearchResults([]);
      setContentSearchLoading(false);
      return;
    }
    let cancelled = false;
    setContentSearchLoading(true);
    const timer = window.setTimeout(() => {
      searchCommunication(term)
        .then(results => { if (!cancelled) setContentSearchResults(results); })
        .catch(() => { if (!cancelled) setContentSearchResults([]); })
        .finally(() => { if (!cancelled) setContentSearchLoading(false); });
    }, 350);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [communicationSearch]);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | null = null;
    let retryTimer: number | null = null;

    const groupIdFromEvent = (data: unknown) => {
      if (!data || typeof data !== "object" || !("groupId" in data)) return null;
      const value = Number((data as { groupId?: unknown }).groupId);
      return Number.isFinite(value) && value > 0 ? value : null;
    };

    const refreshCurrentRoom = async (groupId: number) => {
      try {
        const [detail, messages] = await Promise.all([
          getDocumentGroup(groupId),
          getDocumentGroupMessages(groupId),
        ]);
        if (cancelled) return;
        setSelectedGroup(detail);
        setRoomMessages(prev => reconcileNewestWindow(prev, messages));
      } catch (exception) {
        console.warn("Canlı oda mesajları yenilenemedi.", exception);
      }
    };

    const connect = async () => {
      try {
        unsubscribe = await openChatEventStream(event => {
          if (document.hidden) return;
          if (event.eventName === "direct_message" || event.eventName === "direct_message_deleted") {
            void refreshDirectMessages();
            return;
          }
          if (
            event.eventName === "document_group_message"
            || event.eventName === "document_group_message_deleted"
          ) {
            void refreshGroups();
            const groupId = groupIdFromEvent(event.data);
            if (screen === "room-thread" && selectedGroup?.group.id && groupId === selectedGroup.group.id) {
              void refreshCurrentRoom(groupId);
            }
          }
          if (event.eventName === "company_chat_message" || event.eventName === "company_chat_cleared") {
            if (screen === "company-chat") void refreshCompanyChat();
          }
        }, error => {
          console.warn("Canlı mesaj bağlantısı koptu.", error);
          if (!cancelled && retryTimer === null) {
            retryTimer = window.setTimeout(() => {
              retryTimer = null;
              void connect();
            }, 5_000);
          }
        });
      } catch (exception) {
        console.warn("Canlı mesaj bağlantısı kurulamadı.", exception);
        if (!cancelled && retryTimer === null) {
          retryTimer = window.setTimeout(() => {
            retryTimer = null;
            void connect();
          }, 10_000);
        }
      }
    };

    void connect();
    return () => {
      cancelled = true;
      unsubscribe?.();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [user.id, user.role, screen, selectedGroup?.group.id]);

  useEffect(() => {
    if (screen !== "thread" && screen !== "inbox") return;
    let cancelled = false;
    const refreshMessages = async () => {
      if (document.hidden) return;
      try {
        const nextMessages = await getERPDirectMessages(100);
        if (!cancelled) setDirectMessages(prev => reconcileNewestWindow(prev, nextMessages));
      } catch (exception) {
        console.warn("Mesajlar yenilenemedi.", exception);
      }
    };
    const intervalId = window.setInterval(refreshMessages, MESSAGE_REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [screen, user.id, user.role]);

  useEffect(() => {
    if (screen !== "room-thread" || !selectedGroup) return;
    const groupId = selectedGroup.group.id;
    let cancelled = false;
    const refreshRoom = async () => {
      if (document.hidden) return;
      try {
        const [detail, messages] = await Promise.all([
          getDocumentGroup(groupId),
          getDocumentGroupMessages(groupId),
        ]);
        if (cancelled) return;
        setSelectedGroup(detail);
        setRoomMessages(prev => reconcileNewestWindow(prev, messages));
      } catch (exception) {
        console.warn("Oda mesajları yenilenemedi.", exception);
      }
    };
    const intervalId = window.setInterval(refreshRoom, MESSAGE_REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [screen, selectedGroup?.group.id]);

  // When the app returns to the foreground, SSE events that arrived while hidden were
  // dropped (the handler ignores events while document.hidden) and polling was paused, so
  // the active screen can be stale. Refetch it immediately on resume/focus instead of
  // waiting for the next poll tick.
  useEffect(() => {
    const refreshActiveScreen = async () => {
      if (screen === "thread" || screen === "inbox") {
        await refreshDirectMessages();
      } else if (screen === "room-thread" && selectedGroup) {
        const groupId = selectedGroup.group.id;
        try {
          const [detail, messages] = await Promise.all([
            getDocumentGroup(groupId),
            getDocumentGroupMessages(groupId),
          ]);
          setSelectedGroup(detail);
          setRoomMessages(prev => reconcileNewestWindow(prev, messages));
        } catch (exception) {
          console.warn("Oda mesajları yenilenemedi.", exception);
        }
        void refreshGroups();
      } else if (screen === "company-chat") {
        await refreshCompanyChat();
      }
    };
    const onForeground = () => {
      if (document.hidden) return;
      void refreshActiveScreen();
    };
    document.addEventListener("visibilitychange", onForeground);
    window.addEventListener("focus", onForeground);
    return () => {
      document.removeEventListener("visibilitychange", onForeground);
      window.removeEventListener("focus", onForeground);
    };
  }, [screen, selectedGroup?.group.id]);

  useEffect(() => () => {
    if (recordTimerRef.current) window.clearInterval(recordTimerRef.current);
    recordStreamRef.current?.getTracks().forEach(track => track.stop());
  }, []);

  useEffect(() => {
    if (!openRequest) return;
    const openFromNotification = async () => {
      let messages = directMessages;
      if (messages.length === 0) {
        messages = await getERPDirectMessages(100);
        setDirectMessages(messages);
      }
      if (roomUsers.length === 0) {
        await refreshRoomUsers();
      }
      const targetMessage = messages.find(message => message.id === openRequest.messageId);
      if (!targetMessage) {
        setRoomError("İlgili mesaj bulunamadı.");
        setActiveTab("all");
        setScreen("inbox");
        return;
      }
      setActiveTab("all");
      openDirectThread(resolveDirectTargetFromMessage(targetMessage));
    };
    void openFromNotification().catch(exception => {
      setRoomError(exception instanceof Error ? exception.message : "Mesaj bildirimi açılamadı.");
    });
  }, [openRequest?.nonce]);

  useEffect(() => {
    if (!roomOpenRequest) return;
    const openRoomFromNotification = async () => {
      setActiveTab("all");
      setRoomView(roomOpenRequest.view);
      await openGroup(roomOpenRequest.groupId);
      setRoomView(roomOpenRequest.view);
    };
    void openRoomFromNotification().catch(exception => {
      setRoomError(exception instanceof Error ? exception.message : "Oda bildirimi açılamadı.");
      setScreen("inbox");
    });
  }, [roomOpenRequest?.nonce]);

  if (screen === "company-chat") {
    const isOwnCompanyMessage = (message: CompanyChatMessage) =>
      user.role === "admin" ? message.author_role === "admin" : message.author_user_id === user.id;
    return (
    <div className="flex flex-col h-full min-h-0">
      <TopBar title="Şirket Geneli" onBack={() => setScreen("inbox")} />
      <div className="shrink-0 px-4 py-2.5 flex items-center gap-2" style={{ background: "rgba(217,119,6,0.12)" }}>
        <Megaphone className="w-3.5 h-3.5 text-amber-500 shrink-0" />
        <p className="text-[11px] text-amber-500/90">Herkes yazabilir · mesajlar her gece sıfırlanır</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {companyChatLoading ? (
          <MessageThreadSkeleton />
        ) : companyChatMessages.length === 0 ? (
          <EmptyState icon={Megaphone} title="Bugün henüz mesaj yok" desc="İlk mesajı yazan siz olun." />
        ) : (
          companyChatMessages.map((message, index) => {
            const own = isOwnCompanyMessage(message);
            const showDaySeparator = index === 0
              || dayKey(companyChatMessages[index - 1]?.created_at) !== dayKey(message.created_at);
            return (
              <div key={message.id} className="space-y-3">
                {showDaySeparator && <DaySeparator value={message.created_at} />}
                <div className={`flex gap-2 ${own ? "justify-end" : "justify-start"}`}>
                  {!own && <Avatar name={message.author_name} size="sm" color="bg-slate-700" src={readProfilePhoto(message.author_user_id || message.author_name)} />}
                  <div className={`max-w-[78%] rounded-2xl px-4 py-2.5 ${own ? "bg-amber-500 text-white rounded-br-sm" : "bg-card border border-border text-foreground rounded-bl-sm"}`}>
                    {!own && (
                      <div className="flex items-center gap-1.5 mb-1">
                        <p className="text-[10px] font-semibold opacity-70">{message.author_name}</p>
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${message.author_role === "admin" ? "bg-amber-500/20 text-amber-500" : "bg-muted text-muted-foreground"}`}>
                          {message.author_role === "admin" ? "Admin" : "Çalışan"}
                        </span>
                      </div>
                    )}
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.body}</p>
                    <p className={`text-[10px] mt-1 ${own ? "text-white/70" : "text-muted-foreground"}`}>{formatDate(message.created_at)}</p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
      {companyChatError && (
        <div className="px-4 pb-2 shrink-0">
          <Card className="p-3 border-red-500/30 bg-red-500/10">
            <p className="text-xs text-red-300">{companyChatError}</p>
          </Card>
        </div>
      )}
      <div className="shrink-0 border-t border-border px-4 py-3 flex items-end gap-2.5 bg-background">
        <div className="flex-1 bg-muted rounded-2xl px-4 py-2.5">
          <textarea
            rows={1}
            value={companyChatText}
            onChange={event => setCompanyChatText(event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void sendCompanyChatMsg();
              }
            }}
            placeholder="Şirket geneline mesaj yazın..."
            className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none"
          />
        </div>
        <button
          onClick={() => void sendCompanyChatMsg()}
          disabled={!companyChatText.trim() || companyChatSending}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-amber-500 shrink-0 disabled:opacity-50"
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
    );
  }

  if (screen === "thread") return (
    <div className="flex flex-col h-full min-h-0">
      <TopBar title={directThreadTitle} onBack={() => setScreen("inbox")} />
      <div className="shrink-0 px-4 py-3 border-b border-border bg-background">
        <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2.5">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            value={threadSearch}
            onChange={event => setThreadSearch(event.target.value)}
            placeholder="Bu konuşmada ara..."
            className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {threadSearch && (
            <button
              onClick={() => setThreadSearch("")}
              className="w-7 h-7 rounded-full bg-background/60 flex items-center justify-center shrink-0"
              aria-label="Aramayı temizle"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>
      <div ref={directThreadScrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {roomError && (
          <Card className="p-3 border-red-500/30 bg-red-500/10">
            <p className="text-xs text-red-300">{roomError}</p>
          </Card>
        )}
        {roomNotice && (
          <Card className="p-3 border-teal-500/30 bg-teal-500/10">
            <p className="text-xs text-teal-200">{roomNotice}</p>
          </Card>
        )}
        {!threadSearchTerm && visibleDirectMessages.length > 0 && (
          <button
            onClick={() => void loadOlderDirectMessages()}
            disabled={directMessagesLoadingOlder}
            className="mx-auto flex items-center gap-2 rounded-full bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground disabled:opacity-60"
          >
            {directMessagesLoadingOlder ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
            Eski mesajları yükle
          </button>
        )}
        {threadSearchTerm && filteredVisibleDirectMessages.length === 0 && filteredPendingDirectVisible.length === 0 && (
          <EmptyState icon={Search} title="Sonuç bulunamadı" desc="Bu konuşmada aramanıza uygun mesaj yok." />
        )}
        {!threadSearchTerm && visibleDirectMessages.length === 0 && pendingDirectVisible.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <MessageSquare className="w-10 h-10 text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Henüz mesaj yok. İlk mesajı gönderin.</p>
          </div>
        )}
        {filteredVisibleDirectMessages.map((message, index) => {
          const own = directMessageOwn(message);
          const showDaySeparator = index === 0
            || dayKey(filteredVisibleDirectMessages[index - 1]?.created_at) !== dayKey(message.created_at);
          const mediaSource = messageMediaSource("direct", message);
          return (
          <div key={message.id} className="space-y-3">
            {showDaySeparator && <DaySeparator value={message.created_at} />}
            <div className={`flex gap-2 ${own ? "justify-end" : "justify-start"}`}>
              {!own && <Avatar name={message.sender_name} size="sm" color="bg-slate-700" src={readProfilePhoto(message.sender_user_id || message.sender_name)} />}
              <div
                ref={node => { if (node) messageRefs.current.set(message.id, node); else messageRefs.current.delete(message.id); }}
                className={`max-w-[78%] rounded-2xl px-4 py-2.5 transition-colors ${own ? "bg-primary text-white rounded-br-sm" : "bg-card border border-border text-foreground rounded-bl-sm"} ${highlightedMessageId === message.id ? "ring-2 ring-amber-400" : ""}`}
              >
                {!own && <p className="text-[10px] font-semibold opacity-70 mb-1">{message.sender_name}</p>}
                {message.reply_to_message_id && (() => {
                  const quoted = directMessages.find(item => item.id === message.reply_to_message_id);
                  return (
                    <button
                      onClick={() => scrollToMessage(message.reply_to_message_id!)}
                      className={`mb-1.5 w-full rounded-lg px-2 py-1.5 text-left border-l-2 ${own ? "bg-white/10 border-white/50" : "bg-muted border-primary"}`}
                    >
                      <p className={`text-[10px] font-semibold ${own ? "text-white/80" : "text-primary"}`}>
                        {quoted ? (directMessageOwn(quoted) ? "Siz" : quoted.sender_name) : "Mesaj"}
                      </p>
                      <p className={`text-[11px] truncate ${own ? "text-white/70" : "text-muted-foreground"}`}>
                        {quoted ? directMessageActionTitle(quoted) : "Mesaj yüklenmedi"}
                      </p>
                    </button>
                  );
                })()}
                {isForwardedLabel(message.body) && (
                  <div className={`mb-1 flex items-center gap-1 text-[10px] font-semibold ${own ? "text-white/70" : "text-muted-foreground"}`}>
                    <Share2 className="w-3 h-3" /> İletildi
                  </div>
                )}
                {message.message_kind === "voice" && mediaSource ? (
                  <div className="min-w-[190px] space-y-2">
                    <div className="flex items-center gap-2">
                      <Mic className={`w-4 h-4 ${own ? "text-white" : "text-primary"}`} />
                      <span className="text-xs font-semibold">Ses mesajı</span>
                      <span className={`ml-auto text-[10px] ${own ? "text-white/70" : "text-muted-foreground"}`}>
                        {formatVoiceDuration(message.media_duration_ms)}
                      </span>
                    </div>
                    <audio controls src={mediaSource} className="w-full h-8" />
                  </div>
                ) : message.message_kind === "image" && mediaSource ? (
                  <div className="space-y-2">
                    <button onClick={() => void previewDirectMedia(message)} className="block w-full">
                      <img src={mediaSource} alt={message.body} className="max-h-56 rounded-xl object-contain bg-black/20" />
                    </button>
                    <p className="text-xs leading-relaxed whitespace-pre-wrap">{forwardedBodyText(message.body)}</p>
                  </div>
                ) : message.message_kind === "file" && mediaSource ? (
                  <div className="min-w-[190px] space-y-2">
                    <div className="flex items-center gap-2">
                      <FileText className={`w-4 h-4 ${own ? "text-white" : "text-primary"}`} />
                      <span className="text-xs font-semibold line-clamp-2">{message.body}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void previewDirectMedia(message)}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${own ? "bg-white/15 text-white" : "bg-muted text-foreground"}`}
                      >
                        <Eye className="w-3.5 h-3.5" /> Önizle
                      </button>
                      <button
                        onClick={() => void downloadDirectMedia(message)}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${own ? "bg-white/15 text-white" : "bg-primary text-white"}`}
                      >
                        <Download className="w-3.5 h-3.5" /> İndir
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{forwardedBodyText(message.body)}</p>
                )}
                <div className={`mt-1 flex items-center gap-2 text-[10px] ${own ? "justify-end text-white/60" : "text-muted-foreground"}`}>
                  <span>{formatDate(message.created_at)}</span>
                  {own && <span>{directDeliveryLabel(message)}</span>}
                </div>
              </div>
              <button
                onClick={() => setDirectActionTarget({
                  action: "options",
                  messageId: message.id,
                  title: directMessageActionTitle(message),
                })}
                className="w-8 h-8 mt-1 rounded-full bg-muted flex items-center justify-center shrink-0"
                aria-label="Mesaj seçenekleri"
              >
                <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        )})}
        {filteredPendingDirectVisible.map(message => (
          <PendingTextBubble
            key={message.local_id}
            body={message.body}
            createdAt={message.created_at}
            status={message.status}
            onRetry={() => void retryPendingDirectMessage(message.local_id)}
          />
        ))}
        <div className="h-2" />
      </div>
      {replyTarget?.kind === "direct" && (
        <div className="shrink-0 border-t border-border bg-muted/50 px-4 py-2 flex items-center gap-2">
          <div className="w-1 self-stretch rounded-full bg-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-primary">{replyTarget.authorLabel}</p>
            <p className="text-xs text-muted-foreground truncate">{replyTarget.preview}</p>
          </div>
          <button onClick={cancelReply} className="w-7 h-7 flex items-center justify-center rounded-full bg-muted shrink-0" aria-label="Yanıtlamayı iptal et">
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      )}
      <div className="shrink-0 border-t border-border px-4 py-3 flex items-end gap-2.5 bg-background">
        <button className="w-9 h-9 flex items-center justify-center rounded-full bg-muted shrink-0">
          <Paperclip className="w-4 h-4 text-muted-foreground" />
        </button>
        {isRecording ? (
          <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-2.5 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />
            <span className="text-sm font-semibold text-red-200">Kaydediliyor</span>
            <span className="ml-auto text-xs font-mono text-red-200">{formatVoiceDuration(recordingMs)}</span>
          </div>
        ) : (
          <div className="flex-1 bg-muted rounded-2xl px-4 py-2.5">
            <textarea rows={1} value={msgText} onChange={e => setMsgText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMsg(); } }}
              placeholder="Mesaj yazın..."
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none" />
          </div>
        )}
        {isRecording && (
          <button onClick={() => stopVoiceRecording(true)} className="w-9 h-9 flex items-center justify-center rounded-full bg-muted shrink-0">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
        {isRecording ? (
          <button onClick={() => stopVoiceRecording(false)} className="w-9 h-9 flex items-center justify-center rounded-full bg-primary shrink-0">
            <Square className="w-4 h-4 text-white fill-white" />
          </button>
        ) : msgText.trim() ? (
          <button onClick={() => void sendMsg()} className="w-9 h-9 flex items-center justify-center rounded-full bg-primary shrink-0">
            <Send className="w-4 h-4 text-white" />
          </button>
        ) : (
          <button
            onClick={() => void startVoiceRecording("direct")}
            disabled={voiceSending}
            className="w-9 h-9 flex items-center justify-center rounded-full bg-primary shrink-0 disabled:opacity-60"
          >
            <Mic className="w-4 h-4 text-white" />
          </button>
        )}
      </div>
      {directActionTarget?.action === "options" && (
        <MessageOptionsSheet
          title={directActionTarget.title}
          onClose={() => setDirectActionTarget(null)}
          onDelete={() => setDirectActionTarget({ ...directActionTarget, action: "delete" })}
          onForward={() => setDirectActionTarget({ ...directActionTarget, action: "forward" })}
          onReply={() => {
            const message = directMessages.find(item => item.id === directActionTarget.messageId);
            if (message) openReplyToDirect(message);
            setDirectActionTarget(null);
          }}
        />
      )}

      {directActionTarget?.action === "delete" && (
        <DeleteActionSheet
          title={directActionTarget.title}
          onClose={() => setDirectActionTarget(null)}
          onDeleteForMe={deleteDirectMessageForMe}
          onDeleteForEveryone={() => void deleteDirectMessageForEveryone()}
        />
      )}

      {directActionTarget?.action === "forward" && (
        <ForwardActionSheet
          title={directActionTarget.title}
          people={forwardPeople}
          rooms={groups}
          onClose={() => setDirectActionTarget(null)}
          onForwardToPerson={person => void forwardDirectMessageToPerson(person)}
          onForwardToRoom={room => void forwardDirectMessageToRoom(room)}
        />
      )}
      {previewFile && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
          <div className="h-14 px-4 flex items-center gap-3 border-b border-border bg-background">
            <button onClick={closePreviewFile} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
              <X className="w-5 h-5 text-foreground" />
            </button>
            <p className="flex-1 min-w-0 text-sm font-semibold text-foreground truncate">{previewFile.name}</p>
            <button
              onClick={() => {
                const link = document.createElement("a");
                link.href = previewFile.url;
                link.download = previewFile.name;
                document.body.appendChild(link);
                link.click();
                link.remove();
              }}
              className="w-9 h-9 rounded-full bg-primary flex items-center justify-center"
              aria-label="Önizlenen dokümanı indir"
            >
              <Download className="w-4 h-4 text-white" />
            </button>
          </div>
          <div className="flex-1 min-h-0 bg-background">
            {previewFile.type.startsWith("image/") ? (
              <img src={previewFile.url} alt={previewFile.name} className="w-full h-full object-contain" />
            ) : previewFile.type.startsWith("video/") ? (
              <video src={previewFile.url} controls className="w-full h-full" />
            ) : isPdfFile(previewFile) ? (
              <PdfCanvasPreview url={previewFile.url} />
            ) : (
              <iframe src={previewFile.url} title={previewFile.name} className="w-full h-full border-0 bg-white" />
            )}
          </div>
        </div>
      )}
    </div>
  );

  if (screen === "room-thread" && selectedGroup) return (
    <div className="flex flex-col h-full min-h-0">
      <TopBar
        title={
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold text-foreground truncate">{selectedGroup.group.name}</h1>
              <p className="text-[10px] text-muted-foreground truncate">
                {[
                  `${selectedGroup.members.length} üye`,
                  selectedGroup.group.unread_message_count ? `${selectedGroup.group.unread_message_count} okunmamış` : "",
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>
        }
        onBack={() => setScreen("inbox")}
        actions={
          <button
            onClick={() => void refreshGroups()}
            disabled={roomLoading}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center disabled:opacity-60"
            aria-label="Alanı yenile"
          >
            {roomLoading ? (
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        }
      />

      <div className="shrink-0 px-4 py-3 border-b border-border bg-background space-y-3">
        {user.role === "admin" && (
          <CompanyWorkflowPicker
            tenders={roomTenders}
            value={selectedCompanyLabel(selectedGroup.group.tender_id) || "Şirket seçilmedi"}
            onSelect={selection => void updateSelectedGroupCompany(selection)}
            onCreateCompany={createRoomCompany}
          />
        )}
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-muted p-1">
          {([
            ["chat", "Sohbet"],
            ["documents", "Dokümanlar"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setRoomView(id)}
              className={`py-2 rounded-lg text-xs font-semibold transition-colors ${
                roomView === id ? "bg-primary text-white" : "text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2.5">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            value={threadSearch}
            onChange={event => setThreadSearch(event.target.value)}
            placeholder={roomView === "documents" ? "Dokümanlarda ara..." : "Bu alanda ara..."}
            className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {threadSearch && (
            <button
              onClick={() => setThreadSearch("")}
              className="w-7 h-7 rounded-full bg-background/60 flex items-center justify-center shrink-0"
              aria-label="Aramayı temizle"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {roomError && (
        <div className="px-4 pt-3 shrink-0">
          <Card className="p-3 border-red-500/30 bg-red-500/10">
            <p className="text-xs text-red-300">{roomError}</p>
          </Card>
        </div>
      )}
      {roomNotice && (
        <div className="px-4 pt-3 shrink-0">
          <Card className="p-3 border-teal-500/30 bg-teal-500/10">
            <p className="text-xs text-teal-200">{roomNotice}</p>
          </Card>
        </div>
      )}
      {roomBusyMessage && <BusyBanner message={roomBusyMessage} progressPercent={uploadProgressPercent} />}

      {roomView === "chat" ? (
      <div ref={roomThreadScrollRef} className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
        {!threadSearchTerm && roomFeed.length > 0 && (
          <button
            onClick={() => void loadOlderRoomMessages()}
            disabled={roomMessagesLoadingOlder}
            className="mx-auto flex items-center gap-2 rounded-full bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground disabled:opacity-60"
          >
            {roomMessagesLoadingOlder ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
            Eski mesajları yükle
          </button>
        )}
        {threadSearchTerm && filteredRoomFeed.length === 0 && filteredPendingRoomVisible.length === 0 ? (
          <EmptyState icon={Search} title="Sonuç bulunamadı" desc="Bu alanda aramanıza uygun mesaj veya doküman yok." />
        ) : roomFeed.length === 0 && pendingRoomVisible.length === 0 ? (
          <EmptyState icon={MessageSquare} title="Henüz mesaj yok" desc="Mesaj yazın veya doküman gönderin." />
        ) : (
          filteredRoomFeed.map((item, index) => {
            const showDaySeparator = index === 0
              || dayKey(filteredRoomFeed[index - 1]?.time) !== dayKey(item.time);
            const roomMediaSource = item.kind === "message" && item.message
              ? messageMediaSource("room", item.message)
              : "";
            return (
            <div key={item.id} className="space-y-3">
              {showDaySeparator && <DaySeparator value={item.time} />}
              {item.kind === "message" && item.message ? (
            <div className={`flex items-start gap-2 ${item.message.author_user_id === user.id ? "justify-end" : "justify-start"}`}>
              <div
                ref={node => { if (node) messageRefs.current.set(item.message!.id, node); else messageRefs.current.delete(item.message!.id); }}
                className={`max-w-[82%] rounded-2xl px-4 py-2.5 transition-colors ${
                item.message.author_user_id === user.id
                  ? "bg-primary text-white rounded-br-sm"
                  : "bg-card border border-border text-foreground rounded-bl-sm"
              } ${highlightedMessageId === item.message.id ? "ring-2 ring-amber-400" : ""}`}>
                {item.message.author_user_id !== user.id && (
                  <p className="text-[10px] font-semibold opacity-70 mb-1">{item.message.author_name}</p>
                )}
                {item.message.reply_to_message_id && (() => {
                  const quoted = roomMessages.find(msg => msg.id === item.message!.reply_to_message_id);
                  return (
                    <button
                      onClick={() => scrollToMessage(item.message!.reply_to_message_id!)}
                      className={`mb-1.5 w-full rounded-lg px-2 py-1.5 text-left border-l-2 ${item.message!.author_user_id === user.id ? "bg-white/10 border-white/50" : "bg-muted border-primary"}`}
                    >
                      <p className={`text-[10px] font-semibold ${item.message!.author_user_id === user.id ? "text-white/80" : "text-primary"}`}>
                        {quoted ? (quoted.author_user_id === user.id ? "Siz" : quoted.author_name) : "Mesaj"}
                      </p>
                      <p className={`text-[11px] truncate ${item.message!.author_user_id === user.id ? "text-white/70" : "text-muted-foreground"}`}>
                        {quoted ? (quoted.message_kind === "voice" ? "Ses mesajı" : (quoted.body || "Mesaj")) : "Mesaj yüklenmedi"}
                      </p>
                    </button>
                  );
                })()}
                {isForwardedLabel(item.message.body) && (
                  <div className={`mb-1 flex items-center gap-1 text-[10px] font-semibold ${item.message.author_user_id === user.id ? "text-white/70" : "text-muted-foreground"}`}>
                    <Share2 className="w-3 h-3" /> İletildi
                  </div>
                )}
                {item.message.message_kind === "voice" && roomMediaSource ? (
                  <div className="min-w-[190px] space-y-2">
                    <div className="flex items-center gap-2">
                      <Mic className={`w-4 h-4 ${item.message.author_user_id === user.id ? "text-white" : "text-primary"}`} />
                      <span className="text-xs font-semibold">Ses mesajı</span>
                      <span className="ml-auto text-[10px] opacity-70">{formatVoiceDuration(item.message.media_duration_ms)}</span>
                    </div>
                    <audio controls src={roomMediaSource} className="w-full h-8" />
                  </div>
                ) : item.message.message_kind === "image" && roomMediaSource ? (
                  <div className="space-y-2">
                    <button onClick={() => void previewRoomMessageMedia(item.message!)} className="block w-full">
                      <img src={roomMediaSource} alt={item.message.body} className="max-h-56 rounded-xl object-contain bg-black/20" />
                    </button>
                    <p className="text-xs leading-relaxed whitespace-pre-wrap">{forwardedBodyText(item.message.body)}</p>
                  </div>
                ) : item.message.message_kind === "file" && roomMediaSource ? (
                  <div className="min-w-[190px] space-y-2">
                    <div className="flex items-center gap-2">
                      <FileText className={`w-4 h-4 ${item.message.author_user_id === user.id ? "text-white" : "text-primary"}`} />
                      <span className="text-xs font-semibold line-clamp-2">{item.message.body}</span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => void previewRoomMessageMedia(item.message!)}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${item.message.author_user_id === user.id ? "bg-white/15 text-white" : "bg-muted text-foreground"}`}
                      >
                        <Eye className="w-3.5 h-3.5" /> Önizle
                      </button>
                      <button
                        onClick={() => void downloadRoomMessageMedia(item.message!)}
                        className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${item.message.author_user_id === user.id ? "bg-white/15 text-white" : "bg-primary text-white"}`}
                      >
                        <Download className="w-3.5 h-3.5" /> İndir
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{forwardedBodyText(item.message.body)}</p>
                )}
                <p className="text-[10px] opacity-60 mt-1">{formatDate(item.message.created_at)}</p>
              </div>
              <button
                onClick={() => setRoomActionTarget({ action: "options", kind: "message", id: item.message!.id, title: item.message!.message_kind === "voice" ? "Ses mesajı" : item.message!.body || "Mesaj" })}
                className="w-8 h-8 mt-1 rounded-full bg-muted flex items-center justify-center shrink-0"
                aria-label="Mesajı sil"
              >
                <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          ) : item.document ? (
            <div className="flex justify-start">
              <Card className="p-3 max-w-[88%]">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                    <FileText className="w-5 h-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">
                      {item.document.document.original_filename || item.document.document.stored_filename || `Doküman #${item.document.document_id}`}
                    </p>
                    {item.document.note && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.document.note}</p>}
                    {isForwardedLabel(item.document.note) && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <Share2 className="w-3 h-3" /> İletildi
                      </div>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-2">
                      {item.document.uploaded_by} · {formatDate(item.document.created_at)}
                    </p>
                    {isImageDocument(item.document) && (
                      <GroupImagePreview
                        groupId={selectedGroup.group.id}
                        document={item.document}
                        onOpen={() => void previewRoomFile(item.document)}
                      />
                    )}
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <button
                        onClick={() => void previewRoomFile(item.document)}
                        className="py-2 rounded-xl bg-muted text-xs font-semibold text-foreground flex items-center justify-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" /> Görüntüle
                      </button>
                      <button
                        onClick={() => void downloadRoomFile(item.document.id, item.document.document.original_filename || item.document.document.stored_filename)}
                        className="py-2 rounded-xl bg-primary text-xs font-semibold text-white flex items-center justify-center gap-1.5"
                      >
                        <Download className="w-3.5 h-3.5" /> İndir
                      </button>
                      <button
                        onClick={() => void openDocumentVersions(item.document)}
                        className="py-2 rounded-xl bg-muted text-xs font-semibold text-foreground flex items-center justify-center gap-1.5"
                      >
                        <Clock className="w-3.5 h-3.5" /> Geçmiş
                      </button>
                      <label className="py-2 rounded-xl bg-primary/15 text-xs font-semibold text-primary flex items-center justify-center gap-1.5 active:opacity-80">
                        <Upload className="w-3.5 h-3.5" /> Yeni Revizyon
                        <input
                          type="file"
                          className="hidden"
                          onChange={event => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            void replaceRoomFileVersion(item.document!, file);
                          }}
                        />
                      </label>
                    </div>
                  </div>
                  <button
                    onClick={() => setRoomActionTarget({
                      action: "options",
                      kind: "document",
                      id: item.document!.id,
                      title: item.document!.document.original_filename || item.document!.document.stored_filename || "Doküman",
                    })}
                    className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0"
                    aria-label="Dokümanı sil"
                  >
                    <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>
              </Card>
            </div>
          ) : null}
            </div>
            );
          })
        )}
        {filteredPendingRoomVisible.map(message => (
          <PendingTextBubble
            key={message.local_id}
            body={message.body}
            createdAt={message.created_at}
            status={message.status}
            onRetry={() => void retryPendingRoomMessage(message.local_id)}
          />
        ))}
        <div className="h-2" />
      </div>
      ) : (
      <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4">
        {threadSearchTerm && filteredGroupedRoomDocuments.length === 0 ? (
          <EmptyState icon={Search} title="Sonuç bulunamadı" desc="Bu alandaki dokümanlarda aramanıza uygun kayıt yok." />
        ) : groupedRoomDocuments.length === 0 ? (
          <EmptyState icon={FolderOpen} title="Doküman yok" desc="Bu alana gönderilen dosyalar burada yıl ve şirket bazında klasörlenir." />
        ) : filteredGroupedRoomDocuments.map(yearGroup => (
          <div key={yearGroup.year} className="space-y-3">
            <SectionHeader title={yearGroup.year} />
            {yearGroup.tenders.map(tenderGroup => (
              <Card key={tenderGroup.tenderId} className="p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-primary" />
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground truncate">{tenderGroup.tenderId}</p>
                    <p className="text-[10px] text-muted-foreground">{tenderGroup.items.length} doküman</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {tenderGroup.items.map(item => (
                    <div key={item.id} className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2.5">
                      <FileText className="w-4 h-4 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {item.document.original_filename || item.document.stored_filename || `Doküman #${item.document_id}`}
                        </p>
                        <p className="text-[10px] text-muted-foreground truncate">{item.document.document_type} · {formatDate(item.created_at)}</p>
                      </div>
                      <button onClick={() => void previewRoomFile(item)} className="w-8 h-8 rounded-full bg-background/60 flex items-center justify-center">
                        <Eye className="w-4 h-4 text-foreground" />
                      </button>
                      <button
                        onClick={() => void downloadRoomFile(item.id, item.document.original_filename || item.document.stored_filename)}
                        className="w-8 h-8 rounded-full bg-primary flex items-center justify-center"
                      >
                        <Download className="w-4 h-4 text-white" />
                      </button>
                      <button
                        onClick={() => void openDocumentVersions(item)}
                        className="w-8 h-8 rounded-full bg-background/60 flex items-center justify-center"
                        aria-label="Doküman geçmişi"
                      >
                        <Clock className="w-4 h-4 text-foreground" />
                      </button>
                      <label className="w-8 h-8 rounded-full bg-primary/15 flex items-center justify-center active:opacity-80">
                        <Upload className="w-4 h-4 text-primary" />
                        <input
                          type="file"
                          className="hidden"
                          onChange={event => {
                            const file = event.target.files?.[0];
                            event.target.value = "";
                            void replaceRoomFileVersion(item, file);
                          }}
                        />
                      </label>
                      <button
                        onClick={() => setRoomActionTarget({
                          action: "options",
                          kind: "document",
                          id: item.id,
                          title: item.document.original_filename || item.document.stored_filename || "Doküman",
                        })}
                        className="w-8 h-8 rounded-full bg-background/60 flex items-center justify-center"
                        aria-label="Dokümanı sil"
                      >
                        <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        ))}
      </div>
      )}

      {roomView === "chat" && replyTarget?.kind === "room" && (
        <div className="shrink-0 border-t border-border bg-muted/50 px-4 py-2 flex items-center gap-2">
          <div className="w-1 self-stretch rounded-full bg-primary shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-primary">{replyTarget.authorLabel}</p>
            <p className="text-xs text-muted-foreground truncate">{replyTarget.preview}</p>
          </div>
          <button onClick={cancelReply} className="w-7 h-7 flex items-center justify-center rounded-full bg-muted shrink-0" aria-label="Yanıtlamayı iptal et">
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      )}
      {roomView === "chat" && <div className="shrink-0 border-t border-border px-4 py-3 flex items-end gap-2.5 bg-background">
        <label className="w-9 h-9 flex items-center justify-center rounded-full bg-muted shrink-0 active:opacity-80">
          <Paperclip className="w-4 h-4 text-muted-foreground" />
          <input
            type="file"
            accept="application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.txt,image/*"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void uploadRoomFile(file);
            }}
          />
        </label>
        <label className="w-9 h-9 flex items-center justify-center rounded-full bg-muted shrink-0 active:opacity-80">
          <ImageIcon className="w-4 h-4 text-muted-foreground" />
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = "";
              void uploadRoomFile(file);
            }}
          />
        </label>
        {isRecording ? (
          <div className="flex-1 bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-2.5 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse shrink-0" />
            <span className="text-sm font-semibold text-red-200">Kaydediliyor</span>
            <span className="ml-auto text-xs font-mono text-red-200">{formatVoiceDuration(recordingMs)}</span>
          </div>
        ) : (
          <div className="flex-1 bg-muted rounded-2xl px-4 py-2.5">
            <textarea
              rows={1}
              value={roomMessageText}
              onChange={event => setRoomMessageText(event.target.value)}
              onKeyDown={event => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void sendRoomMessage();
                }
              }}
              placeholder="Mesaj yazın..."
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none resize-none"
            />
          </div>
        )}
        {isRecording && (
          <button onClick={() => stopVoiceRecording(true)} className="w-9 h-9 flex items-center justify-center rounded-full bg-muted shrink-0">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        )}
        {isRecording ? (
          <button onClick={() => stopVoiceRecording(false)} className="w-9 h-9 flex items-center justify-center rounded-full bg-primary shrink-0">
            <Square className="w-4 h-4 text-white fill-white" />
          </button>
        ) : (
          <>
            <button
              onClick={() => void startVoiceRecording("room")}
              disabled={voiceSending}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-muted shrink-0 disabled:opacity-60"
              aria-label="Ses mesajı kaydet"
            >
              <Mic className="w-4 h-4 text-muted-foreground" />
            </button>
            <button
              onClick={() => void sendRoomMessage()}
              disabled={!roomMessageText.trim()}
              className="w-9 h-9 flex items-center justify-center rounded-full bg-primary shrink-0 disabled:opacity-50"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </>
        )}
      </div>}

      {showMissingCompanyPrompt && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center px-5">
          <Card className="w-full p-5 space-y-4">
            <div>
              <h3 className="text-base font-bold text-foreground">Şirket seçilmedi</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Bu çalışma alanı için şirket seçmediniz. Şimdi şirket seçmek ister misiniz?
              </p>
            </div>
            <CompanyWorkflowPicker
              tenders={roomTenders}
              value=""
              onSelect={selection => void updateSelectedGroupCompany(selection)}
              onCreateCompany={createRoomCompany}
            />
            <button
              onClick={() => setShowMissingCompanyPrompt(false)}
              className="w-full py-3 rounded-xl bg-muted text-sm font-semibold text-foreground"
            >
              Daha sonra
            </button>
          </Card>
        </div>
      )}

      {roomActionTarget?.action === "options" && (
        <MessageOptionsSheet
          title={roomActionTarget.title}
          onClose={() => setRoomActionTarget(null)}
          onDelete={() => setRoomActionTarget({ ...roomActionTarget, action: "delete" })}
          onForward={() => setRoomActionTarget({ ...roomActionTarget, action: "forward" })}
          onReply={roomActionTarget.kind === "message" ? () => {
            const message = roomMessages.find(item => item.id === roomActionTarget.id);
            if (message) openReplyToRoom(message);
            setRoomActionTarget(null);
          } : undefined}
        />
      )}

      {roomActionTarget?.action === "delete" && (
        <DeleteActionSheet
          title={roomActionTarget.title}
          onClose={() => setRoomActionTarget(null)}
          onDeleteForMe={deleteRoomItemForMe}
          onDeleteForEveryone={() => void deleteRoomItemForEveryone()}
        />
      )}

      {roomActionTarget?.action === "forward" && (
        <ForwardActionSheet
          title={roomActionTarget.title}
          people={forwardPeople}
          rooms={groups.filter(item => item.id !== selectedGroup.group.id)}
          onClose={() => setRoomActionTarget(null)}
          onForwardToPerson={person => void forwardRoomItemToPerson(person)}
          onForwardToRoom={room => void forwardRoomItemToRoom(room)}
        />
      )}

      {documentVersionsTarget && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-end">
          <div className="w-full max-h-[82vh] bg-card border-t border-border rounded-t-2xl p-4 overflow-y-auto space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold text-foreground">Revizyon Geçmişi</h3>
                <p className="text-xs text-muted-foreground truncate">
                  {documentVersionsTarget.document.original_filename || documentVersionsTarget.document.stored_filename || "Doküman"}
                </p>
              </div>
              <button
                onClick={() => {
                  setDocumentVersionsTarget(null);
                  setDocumentVersions([]);
                }}
                className="w-9 h-9 rounded-full bg-muted flex items-center justify-center shrink-0"
                aria-label="Revizyon geçmişini kapat"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <label className="w-full py-3 rounded-xl bg-primary text-sm font-bold text-white flex items-center justify-center gap-2 active:opacity-80">
              <Upload className="w-4 h-4" /> Yeni Revizyon Yükle
              <input
                type="file"
                className="hidden"
                onChange={event => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  void replaceRoomFileVersion(documentVersionsTarget, file);
                }}
              />
            </label>

            {documentVersionsLoading ? (
              <EmptyState icon={Clock} title="Yükleniyor" desc="Doküman geçmişi alınıyor." />
            ) : documentVersions.length === 0 ? (
              <EmptyState icon={FileText} title="Geçmiş yok" desc="Yeni revizyon yüklendiğinde geçmiş burada görünecek." />
            ) : (
              <div className="space-y-2">
                {documentVersions.map(version => {
                  const filename = version.document.original_filename || version.document.stored_filename || `Versiyon ${version.version_number}`;
                  const current = version.document_id === documentVersionsTarget.document_id;
                  return (
                    <Card key={`${version.id || "current"}-${version.version_number}`} className="p-3">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-foreground">v{version.version_number}</p>
                            {current && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">Güncel</span>}
                          </div>
                          <p className="text-xs text-muted-foreground truncate mt-1">{filename}</p>
                          <p className="text-[10px] text-muted-foreground mt-1">
                            {version.uploaded_by} · {formatDate(version.created_at)}
                          </p>
                          {version.note && <p className="text-[10px] text-muted-foreground mt-1 line-clamp-2">{version.note}</p>}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <button
                          onClick={() => version.id ? void previewDocumentVersion(version) : void previewRoomFile(documentVersionsTarget)}
                          className="py-2 rounded-xl bg-muted text-xs font-semibold text-foreground flex items-center justify-center gap-1.5"
                        >
                          <Eye className="w-3.5 h-3.5" /> Önizle
                        </button>
                        <button
                          onClick={() => version.id
                            ? void downloadDocumentVersion(version)
                            : void downloadRoomFile(documentVersionsTarget.id, documentVersionsTarget.document.original_filename || documentVersionsTarget.document.stored_filename)}
                          className="py-2 rounded-xl bg-primary text-xs font-semibold text-white flex items-center justify-center gap-1.5"
                        >
                          <Download className="w-3.5 h-3.5" /> İndir
                        </button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {previewFile && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
          <div className="h-14 px-4 flex items-center gap-3 border-b border-border bg-background">
            <button onClick={closePreviewFile} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
              <X className="w-5 h-5 text-foreground" />
            </button>
            <p className="flex-1 min-w-0 text-sm font-semibold text-foreground truncate">{previewFile.name}</p>
            <a href={previewFile.url} download={previewFile.name} className="w-9 h-9 rounded-full bg-primary flex items-center justify-center">
              <Download className="w-4 h-4 text-white" />
            </a>
          </div>
          <div className="flex-1 min-h-0 bg-background">
            {previewFile.type.startsWith("image/") ? (
              <img src={previewFile.url} alt={previewFile.name} className="w-full h-full object-contain" />
            ) : previewFile.type.startsWith("video/") ? (
              <video src={previewFile.url} controls className="w-full h-full" />
            ) : isPdfFile(previewFile) ? (
              <PdfCanvasPreview url={previewFile.url} />
            ) : (
              <iframe src={previewFile.url} title={previewFile.name} className="w-full h-full border-0 bg-white" />
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full min-h-0">
      <TopBar
        title="İletişim"
        actions={
          <button
            onClick={() => void refreshCommunicationLists()}
            disabled={roomLoading}
            className="w-8 h-8 rounded-full bg-muted flex items-center justify-center disabled:opacity-60"
            aria-label="İletişimi yenile"
          >
            {roomLoading ? (
              <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            )}
          </button>
        }
      />
      {roomBusyMessage && <BusyBanner message={roomBusyMessage} />}
      <div className="flex px-4 pt-3 border-b border-border shrink-0">
        {(["all", "rooms", "people"] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`flex-1 py-2.5 text-xs font-semibold border-b-2 transition-colors ${activeTab === t ? "text-primary border-primary" : "text-muted-foreground border-transparent"}`}>
            {t === "all" ? "Tümü" : t === "rooms" ? "Alanlar" : "Kişiler"}
          </button>
        ))}
      </div>
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2.5">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            value={communicationSearch}
            onChange={event => setCommunicationSearch(event.target.value)}
            placeholder={activeTab === "rooms" ? "Alan veya şirket ara..." : activeTab === "people" ? "Kişi ara..." : "Konuşma, alan veya kişi ara..."}
            className="flex-1 min-w-0 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {communicationSearch && (
            <button
              onClick={() => setCommunicationSearch("")}
              className="w-7 h-7 rounded-full bg-background/60 flex items-center justify-center shrink-0"
              aria-label="Aramayı temizle"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {activeTab === "all" && (
        <div
          ref={inboxPullToRefresh.containerRef}
          onTouchStart={inboxPullToRefresh.onTouchStart}
          onTouchMove={inboxPullToRefresh.onTouchMove}
          onTouchEnd={() => void inboxPullToRefresh.onTouchEnd()}
          className="flex-1 min-h-0 overflow-y-auto"
        >
          <PullToRefreshIndicator pullDistance={inboxPullToRefresh.pullDistance} refreshing={inboxPullToRefresh.refreshing} />
          {!communicationSearch.trim() && (
            <button
              onClick={openCompanyChat}
              className="w-full flex items-center gap-3 px-4 py-4 border-b border-border active:opacity-90 transition-opacity"
              style={{ background: "linear-gradient(90deg, rgba(217,119,6,0.18), rgba(217,119,6,0.05))" }}
            >
              <div className="w-11 h-11 rounded-full bg-amber-500 flex items-center justify-center shrink-0">
                <Megaphone className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-bold text-amber-500">Şirket Geneli</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">Herkesin yazabildiği ortak pano · her gece sıfırlanır</p>
              </div>
              <ChevronRight className="w-4 h-4 text-amber-500/70 shrink-0" />
            </button>
          )}
          {communicationSearch.trim().length >= 2 && (
            <div className="px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2 mb-2">
                <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Mesaj ve dosya içeriğinde</p>
                {contentSearchLoading && <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />}
              </div>
              {!contentSearchLoading && contentSearchResults.length === 0 ? (
                <p className="text-xs text-muted-foreground">İçerikte eşleşme bulunamadı.</p>
              ) : (
                <div className="space-y-1.5">
                  {contentSearchResults.map(result => (
                    <button
                      key={`${result.type}-${result.id}`}
                      onClick={() => openContentSearchResult(result)}
                      className="w-full flex items-start gap-2.5 rounded-xl bg-muted/40 px-3 py-2.5 text-left"
                    >
                      {result.type === "room_document" ? (
                        <FileText className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      ) : (
                        <MessageSquare className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground truncate">
                          {result.title}
                          {result.group_name && <span className="text-muted-foreground font-normal"> · {result.group_name}</span>}
                        </p>
                        {result.snippet && (
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">{result.snippet}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {roomLoading && groups.length === 0 && directMessages.length === 0 && roomUsers.length === 0 && (
            <ConversationListSkeleton />
          )}
          {showAdminDirectShortcut && (
            <button onClick={() => openDirectThread(null)}
              className="w-full flex items-center gap-3 px-4 py-4 border-b border-border active:bg-muted/30 transition-colors">
              <div className="w-11 h-11 rounded-full bg-teal-600 flex items-center justify-center text-sm font-bold text-white shrink-0">AD</div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold text-foreground">Admin</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{lastAdminDirectMessage?.body || "Kişisel konuşma"}</p>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <span className="text-[10px] text-muted-foreground">{lastAdminDirectMessage ? formatDate(lastAdminDirectMessage.created_at) : ""}</span>
                {unreadDirectMessageCount > 0 && (
                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-[10px] font-bold text-white flex items-center justify-center">
                    {unreadDirectMessageCount > 9 ? "9+" : unreadDirectMessageCount}
                  </span>
                )}
              </div>
            </button>
          )}
          {user.role === "admin" && visibleDirectConversationUsers.map(({ roomUser, lastMessage }) => {
            const unreadCount = unreadDirectMessageCountForUser(roomUser);
            return (
              <button
                key={`direct-${roomUser.id}`}
                onClick={() => openPersonThread(roomUser)}
                className="w-full flex items-center gap-3 px-4 py-4 border-b border-border active:bg-muted/30 transition-colors"
              >
                <Avatar
                  name={roomUser.name}
                  size="md"
                  color={roomUser.role === "admin" ? "bg-teal-600" : "bg-slate-700"}
                  src={userPhoto(roomUser)}
                />
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold text-foreground truncate">{roomUser.name}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {lastMessage?.message_kind === "voice" ? "Ses mesajı" : lastMessage?.body || "Kişisel konuşma"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] text-muted-foreground">{lastMessage ? formatDate(lastMessage.created_at) : ""}</span>
                  {unreadCount > 0 && (
                    <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-[10px] font-bold text-white flex items-center justify-center">
                      {unreadCount > 9 ? "9+" : unreadCount}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {visibleGroups.map(group => (
            <button
              key={group.id}
              onClick={() => openGroup(group.id)}
              className="w-full flex items-center gap-3 px-4 py-4 border-b border-border active:bg-muted/30 transition-colors"
            >
              <div className="w-11 h-11 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-semibold text-foreground truncate">{group.name}</p>
                <p className="text-xs text-muted-foreground truncate mt-0.5">
                  {[group.tender_id ? selectedCompanyLabel(group.tender_id) : "Şirket seçilmedi", `${group.document_count} doküman`, `${group.member_count} üye`].join(" · ")}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {Boolean(group.unread_message_count) && (
                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-[10px] font-bold text-white flex items-center justify-center">
                    {group.unread_message_count! > 9 ? "9+" : group.unread_message_count}
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </div>
            </button>
          ))}
          {communicationSearchTerm && !showAdminDirectShortcut && visibleDirectConversationUsers.length === 0 && visibleGroups.length === 0 && (
            <EmptyState icon={Search} title="Sonuç bulunamadı" desc="Arama metnini değiştirerek tekrar deneyin." />
          )}
          {user.role === "admin" && !communicationSearchTerm && groups.length === 0 && directConversationUsers.length === 0 && (
            <EmptyState icon={MessageSquare} title="Sohbet yok" desc="Çalışma alanı oluşturduğunuzda konuşmalar burada görünecek." />
          )}
        </div>
      )}

      {activeTab === "rooms" && (
        <div
          ref={inboxPullToRefresh.containerRef}
          onTouchStart={inboxPullToRefresh.onTouchStart}
          onTouchMove={inboxPullToRefresh.onTouchMove}
          onTouchEnd={() => void inboxPullToRefresh.onTouchEnd()}
          className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-4"
        >
          <PullToRefreshIndicator pullDistance={inboxPullToRefresh.pullDistance} refreshing={inboxPullToRefresh.refreshing} />
          {roomError && (
            <Card className="p-3 border-red-500/30 bg-red-500/10">
              <p className="text-xs text-red-300">{roomError}</p>
            </Card>
          )}

          <Card className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-bold text-foreground">Yeni Çalışma Alanı</h3>
            </div>
            <CompanyWorkflowPicker
              tenders={roomTenders}
              value={groupTenderId ? groupName || selectedCompanyLabel(groupTenderId) : ""}
              onSelect={selection => {
                setGroupTenderId(selection.tenderId);
                setGroupYear(String(selection.year || Number(groupYear) || new Date().getFullYear()));
                if (!groupName.trim() || groupName === groupTenderId) {
                  setGroupName(selection.companyName);
                }
              }}
              onCreateCompany={createRoomCompany}
            />
            <input
              value={groupYear}
              onChange={event => setGroupYear(event.target.value.replace(/[^\d]/g, "").slice(0, 4))}
              placeholder="Yıl"
              inputMode="numeric"
              className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <input
              value={groupName}
              onChange={event => setGroupName(event.target.value)}
              placeholder="Çalışma alanı adı"
              className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
            <textarea
              value={groupDesc}
              onChange={event => setGroupDesc(event.target.value)}
              rows={2}
              placeholder="Açıklama"
              className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none"
            />
            <button
              onClick={createRoom}
              disabled={roomLoading || !groupName.trim() || groupYear.length !== 4}
              className="w-full py-3 bg-primary rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Plus className="w-4 h-4" /> Yayınla
            </button>
          </Card>

          {roomLoading && groups.length === 0 && !selectedGroup ? (
            <ConversationListSkeleton />
          ) : groups.length === 0 ? (
            <EmptyState icon={FolderOpen} title="Alan yok" desc="İlk çalışma alanını oluşturun." />
          ) : visibleGroups.length === 0 ? (
            <EmptyState icon={Search} title="Sonuç bulunamadı" desc="Alan adı veya şirket aramasını değiştirin." />
          ) : (
            <div className="space-y-2">
              <SectionHeader title="Çalışma Alanları" />
              {visibleGroups.map(group => (
                <button
                  key={group.id}
                  onClick={() => openGroup(group.id)}
                  className={`w-full text-left rounded-xl border p-4 transition-colors ${
                    selectedGroup?.group.id === group.id
                      ? "border-primary/50 bg-primary/10"
                      : "border-border bg-card active:bg-muted/30"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
                      <FolderOpen className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-foreground truncate">{group.name}</p>
                        {Boolean(group.unread_message_count) && (
                          <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-[10px] font-bold text-white flex items-center justify-center shrink-0">
                            {group.unread_message_count! > 9 ? "9+" : group.unread_message_count}
                          </span>
                        )}
                      </div>
                      {group.description && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{group.description}</p>}
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                        <span>{group.tender_id ? selectedCompanyLabel(group.tender_id) : "Şirket seçilmedi"}</span>
                        <span>{group.member_count} üye</span>
                        <span>{group.document_count} doküman</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground mt-3" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {selectedGroup ? false && (
            <div className="space-y-3">
              <SectionHeader title={selectedGroup!.group.name} />
              <Card className="p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <Users className="w-4 h-4 text-primary shrink-0" />
                    <h3 className="text-sm font-bold text-foreground">Üyeler</h3>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">{selectedGroup!.members.length} kişi</span>
                </div>

                {user.role === "admin" && (
                  <div className="flex gap-2">
                    <select
                      value={selectedMemberId}
                      onChange={event => setSelectedMemberId(event.target.value)}
                      className="flex-1 min-w-0 bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground outline-none"
                    >
                      <option value="">Çalışan seç</option>
                      {availableRoomUsers.map(roomUser => (
                        <option key={roomUser.id} value={roomUser.id}>
                          {roomUser.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={addRoomMember}
                      disabled={memberLoading || !selectedMemberId}
                      className="w-11 h-11 rounded-xl bg-primary flex items-center justify-center shrink-0 disabled:opacity-50"
                      aria-label="Üye ekle"
                    >
                      <UserPlus className="w-4 h-4 text-white" />
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  {selectedGroup!.members.map(member => (
                    <div key={member.id} className="flex items-center gap-3 rounded-xl bg-muted px-3 py-2.5">
                      <Avatar name={member.name || member.email || `#${member.user_id}`} size="sm" src={userPhoto(member)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{member.name || member.email || `Kullanıcı #${member.user_id}`}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{member.role === "owner" ? "Alan sahibi" : "Üye"}</p>
                      </div>
                      {user.role === "admin" && member.user_id !== user.id && member.role !== "owner" && (
                        <button
                          onClick={() => void removeRoomMember(member.user_id)}
                          disabled={memberLoading}
                          className="w-8 h-8 rounded-full bg-background/60 flex items-center justify-center shrink-0 disabled:opacity-50"
                          aria-label="Üyeyi çıkar"
                        >
                          <X className="w-4 h-4 text-muted-foreground" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </Card>

              <Card className="p-4 space-y-3">
                <textarea
                  value={uploadNote}
                  onChange={event => setUploadNote(event.target.value)}
                  rows={2}
                  placeholder="Doküman notu"
                  className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none"
                />
                <label className="w-full py-3 bg-primary rounded-xl text-sm font-bold text-white flex items-center justify-center gap-2 active:opacity-80">
                  <Upload className="w-4 h-4" /> Doküman Yükle
                  <input
                    type="file"
                    className="hidden"
                    onChange={event => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      void uploadRoomFile(file);
                    }}
                  />
                </label>
              </Card>

              <div className="space-y-2">
                <SectionHeader title="Alan Akışı" />
                {roomFeed.length === 0 ? (
                  <EmptyState icon={MessageSquare} title="Akış boş" desc="Mesaj yazın veya ilk dokümanı yükleyin." />
                ) : (
                  <div className="space-y-2">
                    {roomFeed.map(item => item.kind === "message" && item.message ? (
                      <div key={item.id} className={`flex ${item.message.author_user_id === user.id ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 ${
                          item.message.author_user_id === user.id
                            ? "bg-primary text-white rounded-br-sm"
                            : "bg-card border border-border text-foreground rounded-bl-sm"
                        }`}>
                          <p className="text-[10px] font-semibold opacity-70 mb-1">{item.message.author_name}</p>
                          <p className="text-sm leading-relaxed whitespace-pre-wrap">{item.message.body}</p>
                          <p className="text-[10px] opacity-60 mt-1">{formatDate(item.message.created_at)}</p>
                        </div>
                      </div>
                    ) : item.document ? (
                      <Card key={item.id} className="p-4">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                            <FileText className="w-5 h-5 text-primary" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-foreground truncate">
                              {item.document.document.original_filename || item.document.document.stored_filename || `Doküman #${item.document.document_id}`}
                            </p>
                            {item.document.note && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.document.note}</p>}
                            <p className="text-[10px] text-muted-foreground mt-2">
                              {item.document.uploaded_by} · {formatDate(item.document.created_at)}
                            </p>
                            <div className="grid grid-cols-2 gap-2 mt-3">
                              <button
                                onClick={() => void previewRoomFile(item.document)}
                                className="py-2 rounded-xl bg-muted text-xs font-semibold text-foreground flex items-center justify-center gap-1.5"
                              >
                                <Eye className="w-3.5 h-3.5" /> Görüntüle
                              </button>
                              <button
                                onClick={() => void downloadRoomFile(item.document.id, item.document.document.original_filename || item.document.document.stored_filename)}
                                className="py-2 rounded-xl bg-primary text-xs font-semibold text-white flex items-center justify-center gap-1.5"
                              >
                                <Download className="w-3.5 h-3.5" /> İndir
                              </button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    ) : null)}
                  </div>
                )}
              </div>

              <div className="shrink-0 border border-border rounded-2xl bg-card p-2 flex items-end gap-2">
                <textarea
                  value={roomMessageText}
                  onChange={event => setRoomMessageText(event.target.value)}
                  rows={1}
                  placeholder="Alana mesaj yazın..."
                  className="flex-1 bg-muted rounded-xl px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground resize-none outline-none"
                />
                <button
                  onClick={sendRoomMessage}
                  disabled={!roomMessageText.trim()}
                  className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shrink-0 disabled:opacity-50"
                  aria-label="Alan mesajı gönder"
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              </div>

              {selectedGroup!.documents.length === 0 ? (
                <EmptyState icon={FileText} title="Doküman yok" desc="Bu odaya ilk dokümanı yükleyin." />
              ) : (
                <div className="space-y-2">
                  <SectionHeader title="Dokümanlar" />
                  {selectedGroup!.documents.map(item => (
                    <Card key={item.id} className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0">
                          <FileText className="w-5 h-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">
                            {item.document.original_filename || item.document.stored_filename || `Doküman #${item.document_id}`}
                          </p>
                          {item.note && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.note}</p>}
                          <p className="text-[10px] text-muted-foreground mt-2">
                            {item.uploaded_by} · {formatDate(item.created_at)}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0">
                          <button
                            onClick={() => void previewRoomFile(item)}
                            className="w-9 h-9 rounded-full bg-muted flex items-center justify-center"
                            aria-label="Dokümanı görüntüle"
                          >
                            <Eye className="w-4 h-4 text-foreground" />
                          </button>
                          <button
                            onClick={() => void downloadRoomFile(item.id, item.document.original_filename || item.document.stored_filename)}
                            className="w-9 h-9 rounded-full bg-primary flex items-center justify-center"
                            aria-label="Dokümanı indir"
                          >
                            <Download className="w-4 h-4 text-white" />
                          </button>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          ) : null}
          <div className="h-8" />
        </div>
      )}

      {activeTab === "people" && (
        <div
          ref={inboxPullToRefresh.containerRef}
          onTouchStart={inboxPullToRefresh.onTouchStart}
          onTouchMove={inboxPullToRefresh.onTouchMove}
          onTouchEnd={() => void inboxPullToRefresh.onTouchEnd()}
          className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5"
        >
          <PullToRefreshIndicator pullDistance={inboxPullToRefresh.pullDistance} refreshing={inboxPullToRefresh.refreshing} />
          {roomLoading && roomUsers.length === 0 ? (
            <ConversationListSkeleton />
          ) : roomUsers.length === 0 ? (
            <EmptyState icon={Users} title="Kişi yok" desc="Onaylı çalışanlar burada görünecek." />
          ) : visibleUserDirectorySections.every(section => section.items.length === 0) ? (
            <EmptyState icon={Search} title="Sonuç bulunamadı" desc="Kişi aramasını değiştirerek tekrar deneyin." />
          ) : (
            visibleUserDirectorySections.map(section => (
              <div key={section.title} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{section.title}</h3>
                  <span className="text-[10px] text-muted-foreground">{section.items.length}</span>
                </div>
                {section.items.length === 0 ? (
                  <Card className="p-3">
                    <p className="text-xs text-muted-foreground">Bu bölümde kullanıcı yok.</p>
                  </Card>
                ) : (
                  <Card className="divide-y divide-border overflow-hidden">
                    {section.items.map(roomUser => {
                      const isSelf = user.id === roomUser.id;
                      const lastMessage = lastDirectMessageForUser(roomUser);
                      const unreadCount = isSelf ? 0 : unreadDirectMessageCountForUser(roomUser);
                      return (
                        <div key={roomUser.id} className="w-full flex items-center gap-2 px-3 py-2.5">
                          <button
                            onClick={() => !isSelf && openPersonThread(roomUser)}
                            disabled={isSelf}
                            className="flex-1 min-w-0 flex items-center gap-3 text-left rounded-xl px-0 py-1 disabled:opacity-70 active:bg-muted/30"
                          >
                            <Avatar
                              name={roomUser.name}
                              size="sm"
                              color={roomUser.role === "admin" ? "bg-teal-600" : "bg-slate-700"}
                              src={userPhoto(roomUser)}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">{roomUser.name}</p>
                              <p className="text-xs text-muted-foreground truncate mt-0.5">
                                {lastMessage
                                  ? `${lastMessage.message_kind === "voice" ? "Ses mesajı" : lastMessage.body} · ${formatDate(lastMessage.created_at)}`
                                  : `${roomUser.email || "E-posta yok"} · ${roomUser.role === "admin" ? "Admin" : "Kullanıcı"}`}
                              </p>
                            </div>
                            {isSelf ? (
                              <span className="px-2.5 py-1.5 rounded-xl bg-muted text-[10px] font-bold text-muted-foreground shrink-0">Siz</span>
                            ) : unreadCount > 0 ? (
                              <span className="min-w-5 h-5 px-1.5 rounded-full bg-primary text-[10px] font-bold text-white flex items-center justify-center shrink-0">
                                {unreadCount > 9 ? "9+" : unreadCount}
                              </span>
                            ) : (
                              <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                            )}
                          </button>
                          {user.role === "admin" && (
                            <button
                              onClick={() => void toggleDocumentNetworkVisibility(roomUser)}
                              disabled={visibilityLoadingUserId === roomUser.id}
                              className={`px-3 py-2 rounded-xl text-[10px] font-bold shrink-0 disabled:opacity-50 ${
                                roomUser.document_network_visible
                                  ? "bg-primary text-white"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              Ağ
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </Card>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {previewFile && (
        <div className="fixed inset-0 bg-black/80 z-50 flex flex-col">
          <div className="h-14 px-4 flex items-center gap-3 border-b border-border bg-background">
            <button onClick={closePreviewFile} className="w-9 h-9 rounded-full bg-muted flex items-center justify-center">
              <X className="w-5 h-5 text-foreground" />
            </button>
            <p className="flex-1 min-w-0 text-sm font-semibold text-foreground truncate">{previewFile.name}</p>
            <a
              href={previewFile.url}
              download={previewFile.name}
              className="w-9 h-9 rounded-full bg-primary flex items-center justify-center"
              aria-label="Önizlenen dokümanı indir"
            >
              <Download className="w-4 h-4 text-white" />
            </a>
          </div>
          <div className="flex-1 min-h-0 bg-background">
            {previewFile.type.startsWith("image/") ? (
              <img src={previewFile.url} alt={previewFile.name} className="w-full h-full object-contain" />
            ) : previewFile.type.startsWith("video/") ? (
              <video src={previewFile.url} controls className="w-full h-full" />
            ) : isPdfFile(previewFile) ? (
              <PdfCanvasPreview url={previewFile.url} />
            ) : (
              <iframe src={previewFile.url} title={previewFile.name} className="w-full h-full border-0 bg-white" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { MessagesTab };
