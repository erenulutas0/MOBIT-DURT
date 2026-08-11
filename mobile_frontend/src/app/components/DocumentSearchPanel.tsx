import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, FileSearch, FileText, FolderOpen, Loader2, Search, X } from "lucide-react";

import {
  askDocuments, getDocumentIndexStatus,
  type DocumentIndexStatus, type DocumentPassage,
} from "../api";

/**
 * "Belgelere Sor" — asks the company's own documents a question and shows the clauses that answer
 * it, each with the file it came from.
 *
 * <p>What comes back is the source text, never a paraphrase. For a şartname that is the product
 * rather than a shortcoming: a quoted clause can be opened and checked, and an answer that decides
 * whether to bid, or what a delay costs, has to be checkable. It also cannot invent a rule that is
 * not in the file, which is the failure people rightly fear from these features.
 */

/** Shown before the first question, so an empty screen still teaches what it is for. */
const EXAMPLES = [
  "Teminat mektubu ne kadar süre geçerli olmalı?",
  "Gecikirsem ne kadar ceza öderim?",
  "Kaç yıllık ciro isteniyor?",
  "İşi başkasına devredebilir miyim?",
];

type Result = {
  question: string;
  ready: boolean;
  message: string;
  passages: DocumentPassage[];
};

/**
 * What to say instead of the example questions when there is nothing to ask.
 *
 * <p>Four suggestions over an empty corpus is the worst version of this screen: every one of them
 * comes back "bulamadım", and the reasonable conclusion is that the feature does not work. Naming
 * the actual state costs one request and saves that impression.
 */
function corpusNotice(status: DocumentIndexStatus):
    { title: string; detail: string; canUpload: boolean } | null {
  if (!status.ready) {
    return {
      title: "Belge arama şu anda hazırlanıyor",
      detail: "Arama servisi hazır olmadığı için sorular şimdilik yanıtlanamıyor. Kısa süre sonra tekrar deneyin.",
      // Uploading more would not help; the files already there cannot be read either.
      canUpload: false,
    };
  }
  if (status.indexed_documents > 0) return null;
  if (status.pending_documents > 0 || status.awaiting_text > 0) {
    const waiting = status.pending_documents + status.awaiting_text;
    return {
      title: `${waiting} belge sıraya alındı`,
      detail: "Yüklenen belgeler okunup dizine ekleniyor. Birkaç dakika içinde aranabilir olacak.",
      canUpload: false,
    };
  }
  return {
    title: "Arşivde aranacak belge yok",
    detail: "Şartname, sözleşme ve eklerinizi yükledikten sonra içeriklerinde arama yapabilirsiniz.",
    canUpload: true,
  };
}

export function DocumentSearchPanel({ onClose, onOpenArchive }: {
  onClose: () => void;
  /** Where documents actually get uploaded, so the empty state can offer the fix it names. */
  onOpenArchive?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState<DocumentIndexStatus | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // The screen exists to be typed into; opening the keyboard saves a tap every time.
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    // A failed probe leaves the screen exactly as it was before this existed — examples and a
    // search box. Refusing to show the feature because a status call hiccuped would be worse.
    void getDocumentIndexStatus()
      .then(value => { if (!cancelled) setStatus(value); })
      .catch(() => { if (!cancelled) setStatus(null); });
    return () => { cancelled = true; };
  }, []);

  const ask = useCallback(async (override?: string) => {
    const question = (override ?? draft).trim();
    if (!question || searching) return;
    setDraft(question);
    setSearching(true);
    setError("");
    try {
      const answer = await askDocuments(question);
      setResult({ question, ready: answer.ready, message: answer.message, passages: answer.passages });
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Belgelerde arama yapılamadı.");
      setResult(null);
    } finally {
      setSearching(false);
    }
  }, [draft, searching]);

  const notice = status ? corpusNotice(status) : null;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="px-4 pt-12 pb-4 border-b border-border">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 -ml-2 text-muted-foreground active:scale-95"
            aria-label="Geri">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <FileSearch className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">Belgelere Sor</p>
            <p className="text-xs text-muted-foreground truncate">Şartname, sözleşme ve eklerde ara</p>
          </div>
        </div>

        <form
          className="mt-3 flex items-center gap-2"
          onSubmit={event => { event.preventDefault(); void ask(); }}
        >
          <div className="flex-1 relative">
            <input
              ref={inputRef}
              value={draft}
              onChange={event => setDraft(event.target.value)}
              placeholder="Sorunuzu yazın…"
              enterKeyHint="search"
              className="w-full h-11 pl-4 pr-9 rounded-xl bg-black/30 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/40"
            />
            {draft && (
              <button
                type="button"
                onClick={() => { setDraft(""); inputRef.current?.focus(); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground active:scale-95"
                aria-label="Temizle"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <button
            type="submit"
            disabled={!draft.trim() || searching}
            className="h-11 w-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center active:scale-95 disabled:opacity-40"
            aria-label="Ara"
          >
            {searching ? <Loader2 className="w-5 h-5 animate-spin" /> : <Search className="w-5 h-5" />}
          </button>
        </form>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {error && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2.5 text-sm text-red-300">
            {error}
          </div>
        )}

        {!result && !error && !searching && notice && (
          <div className="rounded-xl bg-white/[0.03] border border-white/10 px-4 py-6 text-center space-y-1.5">
            <FolderOpen className="w-6 h-6 text-muted-foreground mx-auto" />
            <p className="text-sm text-foreground">{notice.title}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">{notice.detail}</p>
            {notice.canUpload && onOpenArchive && (
              // An empty state that names the fix and then makes you go and find it is half a
              // screen. Only offered when uploading is actually what is missing.
              <button
                onClick={() => { onClose(); onOpenArchive(); }}
                className="mt-3 h-9 px-4 rounded-lg bg-primary/10 text-primary text-sm active:scale-95"
              >
                Belge yükle
              </button>
            )}
          </div>
        )}

        {!result && !error && !searching && !notice && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground px-1">
              {status
                // The scope of the search, stated before it runs: "not in your documents" means
                // something different over eleven files than over four hundred.
                ? `${status.indexed_documents} belge içinde aranıyor. Sorunuzu gündelik dille yazabilirsiniz; belgedeki kelimeleri bilmeniz gerekmez.`
                : "Sorunuzu gündelik dille yazabilirsiniz; belgedeki kelimeleri bilmeniz gerekmez."}
            </p>
            {EXAMPLES.map(example => (
              <button
                key={example}
                onClick={() => void ask(example)}
                className="w-full text-left rounded-xl bg-white/[0.03] border border-white/10 px-3.5 py-3 text-sm text-foreground active:scale-[0.99] transition-transform"
              >
                {example}
              </button>
            ))}
          </div>
        )}

        {searching && !result && (
          <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Belgelerde aranıyor…
          </div>
        )}

        {result && (
          <>
            <p className="text-xs text-muted-foreground px-1">
              {result.passages.length > 0 ? result.message : ""}
            </p>

            {result.passages.length === 0 && (
              // Saying "not in your documents" is a real answer, and a far better one than the
              // closest loosely-related clause dressed up as a match.
              <div className="rounded-xl bg-white/[0.03] border border-white/10 px-4 py-6 text-center space-y-1">
                <FileText className="w-6 h-6 text-muted-foreground mx-auto" />
                <p className="text-sm text-foreground">{result.message}</p>
                <p className="text-xs text-muted-foreground">
                  {result.ready
                    ? "Soruyu başka türlü sormayı deneyebilir ya da ilgili belgenin yüklendiğinden emin olabilirsiniz."
                    // Rephrasing cannot help when nothing is searchable, and telling somebody to
                    // try harder at a broken feature is how they stop trusting the answers.
                    : "Arama servisi hazır olmadığı için sorunuz yanıtlanamadı; soruyu değiştirmek işe yaramaz."}
                </p>
              </div>
            )}

            {result.passages.map(passage => (
              <article
                key={`${passage.document_id}-${passage.chunk_index}`}
                className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden"
              >
                <div className="flex items-center gap-2 px-3.5 py-2.5 bg-primary/10 border-b border-border">
                  <FileText className="w-4 h-4 text-primary shrink-0" />
                  {/* The file name is the citation. Without it the passage is an assertion nobody
                      can go and check, which is exactly what makes people distrust these answers. */}
                  <p className="text-xs font-semibold text-primary truncate flex-1">
                    {passage.document_name || `Belge #${passage.document_id}`}
                  </p>
                </div>
                <p className="px-3.5 py-3 text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {passage.content}
                </p>
              </article>
            ))}
          </>
        )}
        <div className="h-4" />
      </div>
    </div>
  );
}
