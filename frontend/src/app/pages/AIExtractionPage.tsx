import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, ClipboardList, FileSearch, FileText, Loader2, MinusCircle, Search } from "lucide-react";

import {
  askDocuments,
  getTenderBrief,
  getTenders,
  type ApiTender,
  type DocumentAnswer,
  type TenderBrief,
} from "../api";

// ─── AI ÇIKARIMI ──────────────────────────────────────────────────────────────
//
// This page used to be a mockup: hardcoded field values with invented confidence scores next to a
// note saying the features were planned. The features exist now, so the mockup is not just stale —
// shown to a prospect it presents fabricated numbers as if they came out of their documents.
//
// What replaced it answers from the company's own şartname and quotes the clause it answered from.
// It reports the clause rather than a parsed figure on purpose: "%3" lifted out of "teklif
// bedelinin %3'ünden az olmamak üzere" loses the floor and reads as a fixed rate, and a mistake
// there is priced into a bid. The reader takes the number off the quoted text — which is also why
// nothing here can invent a rule the document does not contain.

const EXAMPLES = [
  "Teminat mektubu ne kadar süre geçerli olmalı?",
  "Gecikirsem ne kadar ceza öderim?",
  "Kaç yıllık ciro isteniyor?",
  "İşi başkasına devredebilir miyim?",
];

export function AIExtractionPage() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<DocumentAnswer | null>(null);
  const [asking, setAsking] = useState(false);
  const [askError, setAskError] = useState("");

  const [tenders, setTenders] = useState<ApiTender[]>([]);
  const [tenderId, setTenderId] = useState("");
  const [brief, setBrief] = useState<TenderBrief | null>(null);
  const [briefing, setBriefing] = useState(false);
  const [briefError, setBriefError] = useState("");

  useEffect(() => {
    getTenders()
      .then((list) => {
        setTenders(list);
        if (list.length > 0) setTenderId(list[0].tender_id);
      })
      .catch(() => undefined);
  }, []);

  const ask = useCallback(async (override?: string) => {
    const text = (override ?? question).trim();
    if (!text || asking) return;
    setQuestion(text);
    setAsking(true);
    setAskError("");
    try {
      setAnswer(await askDocuments(text));
    } catch (exception) {
      setAskError(exception instanceof Error ? exception.message : "Arama yapılamadı.");
      setAnswer(null);
    } finally {
      setAsking(false);
    }
  }, [question, asking]);

  const loadBrief = useCallback(async () => {
    if (!tenderId || briefing) return;
    setBriefing(true);
    setBriefError("");
    try {
      setBrief(await getTenderBrief(tenderId));
    } catch (exception) {
      setBriefError(exception instanceof Error ? exception.message : "Künye çıkarılamadı.");
      setBrief(null);
    } finally {
      setBriefing(false);
    }
  }, [tenderId, briefing]);

  const labelOf = (key: string) =>
    brief?.entries.find((entry) => entry.key === key)?.label ?? "önceki";

  return (
    <div className="p-6 space-y-6">
      {/* ── Belgelere Sor ── */}
      <section className="bg-white border border-border rounded">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <FileSearch className="w-4 h-4 text-teal-600" />
          <h3 className="text-xs font-semibold">Belgelere Sor</h3>
          <span className="text-[10px] text-muted-foreground">
            Şartname, sözleşme ve eklerde anlam bazlı arama
          </span>
        </div>

        <div className="p-4 space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(event) => { event.preventDefault(); void ask(); }}
          >
            <input
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Sorunuzu gündelik dille yazın; belgedeki kelimeleri bilmeniz gerekmez."
              className="flex-1 text-xs border border-border rounded px-3 py-2 outline-none focus:ring-1 focus:ring-teal-300"
            />
            <button
              type="submit"
              disabled={!question.trim() || asking}
              className="px-4 py-2 rounded bg-teal-600 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
            >
              {asking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              Ara
            </button>
          </form>

          {!answer && !askError && (
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  onClick={() => void ask(example)}
                  className="text-[11px] border border-border rounded px-2 py-1 hover:bg-muted"
                >
                  {example}
                </button>
              ))}
            </div>
          )}

          {askError && (
            <p className="text-[11px] text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {askError}
            </p>
          )}

          {answer && answer.passages.length === 0 && (
            // Saying "not in your documents" is a real answer, and a better one than the closest
            // loosely-related clause dressed up as a match.
            <p className="text-xs text-muted-foreground border border-dashed border-border rounded px-3 py-4 text-center">
              {answer.message}
            </p>
          )}

          {answer?.passages.map((passage) => (
            <article
              key={`${passage.document_id}-${passage.chunk_index}`}
              className="border border-border rounded overflow-hidden"
            >
              <div className="flex items-center gap-2 px-3 py-2 bg-teal-50 border-b border-teal-100">
                <FileText className="w-3.5 h-3.5 text-teal-600 shrink-0" />
                {/* The file name is the citation. Without it the passage is an assertion nobody can
                    go and check, which is what makes people distrust answers like these. */}
                <span className="text-[11px] font-semibold text-teal-800">
                  {passage.document_name || `Belge #${passage.document_id}`}
                </span>
              </div>
              <p className="px-3 py-2.5 text-xs whitespace-pre-wrap leading-relaxed">{passage.content}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ── İhale Künyesi ── */}
      <section className="bg-white border border-border rounded">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <ClipboardList className="w-4 h-4 text-amber-600" />
          <h3 className="text-xs font-semibold">İhale Künyesi</h3>
          <span className="text-[10px] text-muted-foreground">
            Teklif öncesi karar verilen maddeler, kaynak şartnamedeki haliyle
          </span>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <select
              value={tenderId}
              onChange={(event) => { setTenderId(event.target.value); setBrief(null); }}
              className="flex-1 text-xs border border-border rounded px-3 py-2 outline-none focus:ring-1 focus:ring-amber-300"
            >
              {tenders.length === 0 && <option value="">İhale bulunamadı</option>}
              {tenders.map((tender) => (
                <option key={tender.tender_id} value={tender.tender_id}>
                  {tender.tender_id}{tender.organization ? ` — ${tender.organization}` : ""}
                </option>
              ))}
            </select>
            <button
              onClick={() => void loadBrief()}
              disabled={!tenderId || briefing}
              className="px-4 py-2 rounded bg-amber-600 text-white text-xs font-semibold flex items-center gap-1.5 disabled:opacity-40"
            >
              {briefing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Künyeyi Çıkar
            </button>
          </div>

          {briefError && (
            <p className="text-[11px] text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" /> {briefError}
            </p>
          )}
          {brief && <p className="text-[11px] text-muted-foreground">{brief.message}</p>}

          {brief?.entries.map((entry) => (
            <div key={entry.key} className="border border-border rounded overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40">
                <span className="text-[11px] font-semibold flex-1">{entry.label}</span>
                {entry.found ? (
                  <span className="text-[10px] text-amber-700 flex items-center gap-1">
                    <FileText className="w-3 h-3" /> {entry.document_name}
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <MinusCircle className="w-3 h-3" /> bulunamadı
                  </span>
                )}
              </div>
              {entry.found && entry.same_as ? (
                // One madde often settles two of these at once; printing it twice makes a twelve
                // line brief look like it is padding.
                <p className="px-3 py-2 text-[11px] text-muted-foreground">
                  Yukarıdaki “{labelOf(entry.same_as)}” maddesinde yanıtlandı.
                </p>
              ) : entry.found ? (
                <p className="px-3 py-2.5 text-xs whitespace-pre-wrap leading-relaxed">{entry.content}</p>
              ) : (
                // Kept in the list rather than dropped: "there is no price-adjustment clause here"
                // is a finding worth having before bidding.
                <p className="px-3 py-2 text-[11px] text-muted-foreground">
                  Bu ihalenin belgelerinde bu maddeye karşılık gelen bir bölüm bulunamadı.
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
