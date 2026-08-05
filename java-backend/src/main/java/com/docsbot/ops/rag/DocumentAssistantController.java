package com.docsbot.ops.rag;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.context.annotation.Profile;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.docsbot.ops.erp.application.ErpPrincipal;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * "Ask the company's documents." The answer is the passages themselves with their source, so the
 * user can open the file and check the clause — for a şartname that auditability is the product,
 * not a limitation.
 */
@RestController
@RequestMapping("/erp/assistant")
@Profile("postgres")
public class DocumentAssistantController {

    private final DocumentSearchService searchService;
    private final TenderBriefService briefService;
    private final EmbeddingModel embeddingModel;
    private final DocumentIndexSweeper indexSweeper;

    public DocumentAssistantController(
            DocumentSearchService searchService,
            TenderBriefService briefService,
            EmbeddingModel embeddingModel,
            DocumentIndexSweeper indexSweeper
    ) {
        this.searchService = searchService;
        this.briefService = briefService;
        this.embeddingModel = embeddingModel;
        this.indexSweeper = indexSweeper;
    }

    /**
     * How much of the archive is searchable. Without this the feature is opaque — "it found nothing"
     * could mean the question has no answer or that nothing has been indexed yet, and before a demo
     * that is exactly the difference you need to know.
     */
    @GetMapping("/documents/status")
    IndexStatusResponse status(JwtAuthenticationToken authentication) {
        // Admin-only is enforced at the security edge; resolving the principal keeps the
        // authenticated footing explicit here.
        ErpPrincipal.from(authentication);
        boolean ready = embeddingModel.available();
        return new IndexStatusResponse(
                ready,
                ready ? embeddingModel.name() : null,
                ready ? indexSweeper.indexedDocumentCount() : 0,
                ready ? indexSweeper.pendingCount() : 0,
                indexSweeper.awaitingTextCount());
    }

    /**
     * Runs a sweep now instead of waiting for the timer — for seeding a demo corpus.
     *
     * <p>{@code force=true} discards the existing passages first. A plain sweep skips whatever is
     * already indexed for the current model, which is right until the thing that changed is how
     * documents are split into passages: those vectors stay valid-looking while describing the wrong
     * spans, and no automatic check can notice. Expect the corpus to be unsearchable until the
     * sweeps catch up.
     */
    @PostMapping("/documents/reindex")
    ReindexResponse reindex(
            JwtAuthenticationToken authentication,
            @RequestParam(name = "force", defaultValue = "false") boolean force
    ) {
        ErpPrincipal.from(authentication);
        if (!embeddingModel.available()) {
            return new ReindexResponse(0, indexSweeper.pendingCount());
        }
        if (force) {
            indexSweeper.forgetEverything();
        }
        int indexed = indexSweeper.sweep();
        return new ReindexResponse(indexed, indexSweeper.pendingCount());
    }

    record IndexStatusResponse(
            boolean ready,
            String model,
            @JsonProperty("indexed_documents") long indexedDocuments,
            @JsonProperty("pending_documents") long pendingDocuments,
            /** Uploaded but not yet read — a stall one step before pending, not the same thing. */
            @JsonProperty("awaiting_text") long awaitingText
    ) {
    }

    record ReindexResponse(
            @JsonProperty("indexed_now") int indexedNow,
            @JsonProperty("pending_documents") long pendingDocuments
    ) {
    }

    @PostMapping("/documents/ask")
    AskResponse ask(JwtAuthenticationToken authentication, @Valid @RequestBody AskRequest request) {
        // Resolving the principal keeps this on the same authenticated footing as the rest of the
        // assistant; document-level visibility is enforced when the client opens the source.
        ErpPrincipal.from(authentication);
        if (!embeddingModel.available()) {
            return new AskResponse(false, "Doküman asistanı henüz hazırlanıyor.", List.of());
        }
        List<DocumentSearchService.Passage> passages = searchService.search(request.question(), request.effectiveLimit());
        if (passages.isEmpty()) {
            return new AskResponse(
                    true,
                    "Dokümanlarınızda bu soruya karşılık gelen bir bölüm bulamadım.",
                    List.of());
        }
        return new AskResponse(
                true,
                passages.size() + " ilgili bölüm buldum.",
                passages.stream().map(PassageResponse::from).toList());
    }

    /**
     * "İhale künyesi": the dozen facts a company decides on before bidding, each answered by the
     * clause that states it. Replaces reading forty pages of four documents to fill in a form.
     */
    @GetMapping("/tenders/{tenderId}/brief")
    BriefResponse brief(JwtAuthenticationToken authentication, @PathVariable String tenderId) {
        ErpPrincipal.from(authentication);
        if (!embeddingModel.available()) {
            return new BriefResponse(false, "Doküman asistanı henüz hazırlanıyor.", tenderId, List.of());
        }
        List<TenderBriefService.Entry> entries = briefService.brief(tenderId);
        long answered = entries.stream().filter(TenderBriefService.Entry::found).count();
        return new BriefResponse(
                true,
                answered == 0
                        ? "Bu ihalenin belgelerinde künye bilgisi bulamadım."
                        : answered + " / " + entries.size() + " madde bulundu.",
                tenderId,
                entries.stream().map(BriefEntryResponse::from).toList());
    }

    record BriefResponse(
            boolean ready,
            String message,
            @JsonProperty("tender_id") String tenderId,
            List<BriefEntryResponse> entries
    ) {
    }

    record BriefEntryResponse(
            String key,
            String label,
            String question,
            boolean found,
            @JsonProperty("document_id") Long documentId,
            @JsonProperty("document_name") String documentName,
            String content,
            Double similarity
    ) {
        static BriefEntryResponse from(TenderBriefService.Entry entry) {
            DocumentSearchService.Passage passage = entry.passage();
            return new BriefEntryResponse(
                    entry.key(),
                    entry.label(),
                    entry.question(),
                    entry.found(),
                    passage == null ? null : passage.documentId(),
                    passage == null ? null : passage.documentName(),
                    passage == null ? null : passage.content(),
                    passage == null ? null : Math.round(passage.similarity() * 1000) / 1000.0);
        }
    }

    record AskRequest(
            @NotBlank @Size(max = 500) String question,
            Integer limit
    ) {
        /** Not an accessor override: absent means "use the default", not "return null". */
        int effectiveLimit() {
            return limit == null ? 5 : limit;
        }
    }

    record AskResponse(
            boolean ready,
            String message,
            List<PassageResponse> passages
    ) {
    }

    record PassageResponse(
            @JsonProperty("document_id") long documentId,
            /** The file to open to check the wording; an id alone is not something a user can follow. */
            @JsonProperty("document_name") String documentName,
            @JsonProperty("chunk_index") int chunkIndex,
            String content,
            double similarity
    ) {
        static PassageResponse from(DocumentSearchService.Passage passage) {
            return new PassageResponse(
                    passage.documentId(),
                    passage.documentName(),
                    passage.chunkIndex(),
                    passage.content(),
                    Math.round(passage.similarity() * 1000) / 1000.0);
        }
    }
}
