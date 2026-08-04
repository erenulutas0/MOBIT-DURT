import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, FileSearch, FileText, Loader2, Search, X } from "lucide-react";

import { askDocuments, type DocumentPassage } from "../api";

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
  message: string;
  passages: DocumentPassage[];
};

export function DocumentSearchPanel({ onClose }: { onClose: () => void }) {
  const [draft, setDraft] = useState("");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // The screen exists to be typed into; opening the keyboard saves a tap every time.
    inputRef.current?.focus();
  }, []);

  const ask = useCallback(async (override?: string) => {
    const question = (override ?? draft).trim();
    if (!question || searching) return;
    setDraft(question);
    setSearching(true);
    setError("");
    try {
      const answer = await askDocuments(question);
      setResult({ question, message: answer.message, passages: answer.passages });
    } catch (exception) {
      setError(exception instanceof Error ? exception.message : "Belgelerde arama yapılamadı.");
      setResult(null);
    } finally {
      setSearching(false);
    }
  }, [draft, searching]);

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="px-4 pt-12 pb-4 bg-gradient-to-b from-teal-950/60 to-background border-b border-teal-500/20">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 -ml-2 text-muted-foreground active:scale-95"
            aria-label="Geri">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-xl bg-teal-500/25 flex items-center justify-center">
            <FileSearch className="w-5 h-5 text-teal-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-foreground truncate">Belgelere Sor</p>
            <p className="text-xs text-teal-300/80 truncate">Şartname, sözleşme ve eklerde ara</p>
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
              className="w-full h-11 pl-4 pr-9 rounded-xl bg-black/30 border border-teal-500/25 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-teal-400/50"
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
            className="h-11 w-11 rounded-xl bg-teal-500/25 text-teal-200 flex items-center justify-center active:scale-95 disabled:opacity-40"
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

        {!result && !error && !searching && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground px-1">
              Sorunuzu gündelik dille yazabilirsiniz; belgedeki kelimeleri bilmeniz gerekmez.
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
                  Soruyu başka türlü sormayı deneyebilir ya da ilgili belgenin yüklendiğinden emin
                  olabilirsiniz.
                </p>
              </div>
            )}

            {result.passages.map(passage => (
              <article
                key={`${passage.document_id}-${passage.chunk_index}`}
                className="rounded-xl bg-white/[0.03] border border-white/10 overflow-hidden"
              >
                <div className="flex items-center gap-2 px-3.5 py-2.5 bg-teal-500/10 border-b border-teal-500/15">
                  <FileText className="w-4 h-4 text-teal-300 shrink-0" />
                  {/* The file name is the citation. Without it the passage is an assertion nobody
                      can go and check, which is exactly what makes people distrust these answers. */}
                  <p className="text-xs font-semibold text-teal-200 truncate flex-1">
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
