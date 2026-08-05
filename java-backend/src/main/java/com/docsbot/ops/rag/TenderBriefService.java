package com.docsbot.ops.rag;

import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

/**
 * The facts a company decides on before bidding, pulled out of its own şartname.
 *
 * <p>These are the same questions on every tender and the answers are scattered across forty pages
 * of four documents, so somebody is given the job of reading it all and filling in a form. This asks
 * the questions instead, once, and puts the clauses side by side.
 *
 * <p>It reports the clause, never a number it worked out itself. "%3" extracted from
 * "teklif bedelinin %3'ünden az olmamak üzere" loses the "az olmamak üzere" — a floor read back as
 * a fixed rate — and a mistake in a bid costs real money. The clause is checkable; a parsed figure
 * asks to be trusted. That the reader takes the number off the quoted text is the design, not a
 * missing feature.
 */
@Service
@Profile("postgres")
public class TenderBriefService {

    /**
     * Phrased as a person would ask, not as the document words it. The retrieval matches meaning,
     * so questions written in the şartname's own vocabulary would only prove that copying words
     * finds them again.
     */
    private static final List<Question> QUESTIONS = List.of(
            new Question("gecici_teminat", "Geçici teminat", "Geçici teminat oranı ne kadar olmalı?"),
            new Question("teminat_suresi", "Teminat geçerlilik süresi",
                    "Bankadan alacağım teminat mektubu ne kadar süre geçerli olmalı?"),
            new Question("kesin_teminat", "Kesin teminat", "Sözleşme imzalanırken ne kadar kesin teminat verilir?"),
            new Question("teklif_gecerlilik", "Teklif geçerlilik süresi", "Teklifler kaç gün geçerli olacak?"),
            new Question("isin_suresi", "İşin süresi", "İşi kaç günde bitirmem gerekiyor?"),
            new Question("gecikme_cezasi", "Gecikme cezası", "İşi geç bitirirsem ne kadar ceza öderim?"),
            new Question("ciro_sarti", "Ciro şartı", "Şirketin cirosu ne kadar olmalı, kaç yıllık?"),
            new Question("is_deneyimi", "İş deneyimi", "Benzer iş deneyim belgesi olarak ne isteniyor?"),
            new Question("odeme_suresi", "Ödeme süresi", "Hakediş ödemesi ne zaman yapılır?"),
            new Question("fiyat_farki", "Fiyat farkı", "Malzemeye zam gelirse fiyat farkı ödenir mi?"),
            new Question("teknik_personel", "Teknik personel", "Sahada hangi teknik personel bulundurulmalı?"),
            new Question("garanti", "Garanti süresi", "Teslim edilen işler kaç ay garanti kapsamında?"));

    public record Question(String key, String label, String text) {
    }

    /**
     * One line of the brief. {@code passage} is null when the documents do not answer it.
     *
     * <p>{@code sameAs} names an earlier line answered by this very same clause. One madde often
     * settles two of these questions at once — "MADDE 2 - GEÇİCİ TEMİNAT" states both the rate and
     * how long the letter stays valid — and printing it twice makes a twelve-line brief look like
     * it is padding. The line stays in the list so the question is still visibly answered; the
     * caller shows it against the clause it shares instead of repeating the text.
     */
    public record Entry(
            String key,
            String label,
            String question,
            DocumentSearchService.Passage passage,
            String sameAs
    ) {
        public boolean found() {
            return passage != null;
        }
    }

    private final DocumentSearchService searchService;

    public TenderBriefService(DocumentSearchService searchService) {
        this.searchService = searchService;
    }

    /**
     * Answers every question from this tender's own documents.
     *
     * <p>Scoped to the tender on purpose: penalties and thresholds differ per contract, so the
     * closest passage in the whole archive is often the right clause from the wrong tender — the
     * worst kind of wrong, because it reads perfectly.
     *
     * <p>Unanswered lines are kept rather than dropped. "Bu şartnamede fiyat farkı hükmü bulamadım"
     * is itself worth knowing before bidding, and a brief that silently omits what it could not find
     * looks complete when it is not.
     */
    public List<Entry> brief(String tenderId) {
        java.util.Map<String, String> firstAskedFor = new java.util.HashMap<>();
        List<Entry> entries = new java.util.ArrayList<>(QUESTIONS.size());
        for (Question question : QUESTIONS) {
            List<DocumentSearchService.Passage> hits = searchService.search(question.text(), 1, tenderId);
            DocumentSearchService.Passage passage = hits.isEmpty() ? null : hits.get(0);
            String sameAs = null;
            if (passage != null) {
                String clause = passage.documentId() + ":" + passage.chunkIndex();
                sameAs = firstAskedFor.putIfAbsent(clause, question.key());
            }
            entries.add(new Entry(question.key(), question.label(), question.text(), passage, sameAs));
        }
        return List.copyOf(entries);
    }
}
