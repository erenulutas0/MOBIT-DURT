package com.docsbot.ops.tender;

import java.util.List;
import java.time.Instant;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Sort;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import com.docsbot.ops.erp.ErpDtos;
import com.docsbot.ops.erp.application.ErpExceptions;
import com.docsbot.ops.erp.application.ErpPrincipal;
import com.docsbot.ops.common.page.OffsetLimitPageable;
import com.docsbot.ops.tender.domain.Tender;
import com.docsbot.ops.tender.infrastructure.TenderDocumentRepository;
import com.docsbot.ops.tender.infrastructure.TenderRepository;
import com.fasterxml.jackson.annotation.JsonProperty;
import tools.jackson.databind.ObjectMapper;

@RestController
@Profile("postgres")
public class TenderController {

    private final TenderDocumentRepository documentRepository;
    private final TenderRepository tenderRepository;
    private final TenderTaskService tenderTaskService;
    private final TenderIngestionService ingestionService;
    private final TenderTextExtractionService textExtractionService;
    private final TenderFactExtractionService factExtractionService;
    private final TenderSummaryService summaryService;
    private final TenderMissingDocumentService missingDocumentService;
    private final TenderRiskAnalysisService riskAnalysisService;
    private final TenderTaskSuggestionService taskSuggestionService;
    private final TenderDocumentSearchService documentSearchService;
    private final TenderDocumentFacetService documentFacetService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public TenderController(
            TenderDocumentRepository documentRepository,
            TenderRepository tenderRepository,
            TenderTaskService tenderTaskService,
            TenderIngestionService ingestionService,
            TenderTextExtractionService textExtractionService,
            TenderFactExtractionService factExtractionService,
            TenderSummaryService summaryService,
            TenderMissingDocumentService missingDocumentService,
            TenderRiskAnalysisService riskAnalysisService,
            TenderTaskSuggestionService taskSuggestionService,
            TenderDocumentSearchService documentSearchService,
            TenderDocumentFacetService documentFacetService
    ) {
        this.documentRepository = documentRepository;
        this.tenderRepository = tenderRepository;
        this.tenderTaskService = tenderTaskService;
        this.ingestionService = ingestionService;
        this.textExtractionService = textExtractionService;
        this.factExtractionService = factExtractionService;
        this.summaryService = summaryService;
        this.missingDocumentService = missingDocumentService;
        this.riskAnalysisService = riskAnalysisService;
        this.taskSuggestionService = taskSuggestionService;
        this.documentSearchService = documentSearchService;
        this.documentFacetService = documentFacetService;
    }

    @GetMapping("/documents")
    List<TenderDtos.DocumentResponse> documents() {
        return documentRepository.findAllByOrderByTimestampDescIdDesc().stream()
                .map(TenderDtos.DocumentResponse::from)
                .toList();
    }

    @GetMapping("/documents/page")
    TenderDtos.DocumentPageResponse documentsPage(
            @RequestParam(name = "offset", defaultValue = "0") int offset,
            @RequestParam(name = "limit", defaultValue = "50") int limit
    ) {
        int normalizedOffset = normalizeOffset(offset);
        int normalizedLimit = normalizeLimit(limit);
        var page = documentRepository.findAll(new OffsetLimitPageable(
                normalizedLimit,
                normalizedOffset,
                Sort.by(Sort.Order.desc("timestamp"), Sort.Order.desc("id"))));
        return new TenderDtos.DocumentPageResponse(
                TenderDtos.PageMeta.of(page.getTotalElements(), normalizedOffset, normalizedLimit),
                page.getContent().stream().map(TenderDtos.DocumentResponse::from).toList());
    }

    @GetMapping("/documents/search")
    TenderDtos.DocumentSearchResponse searchDocuments(
            @RequestParam(name = "q", required = false) String query,
            @RequestParam(name = "organization", required = false) String organization,
            @RequestParam(name = "year", required = false) Integer year,
            @RequestParam(name = "document_type", required = false) String documentType,
            @RequestParam(name = "tender_id", required = false) String tenderId,
            @RequestParam(name = "limit", defaultValue = "50") int limit
    ) {
        return documentSearchService.search(
                query,
                organization,
                year,
                documentType,
                tenderId,
                limit);
    }

    @GetMapping("/documents/facets")
    TenderDtos.DocumentFacetsResponse documentFacets() {
        return documentFacetService.facets();
    }

    @GetMapping("/documents/{documentId}")
    TenderDtos.DocumentResponse document(@PathVariable long documentId) {
        return documentRepository.findById(documentId)
                .map(TenderDtos.DocumentResponse::from)
                .orElseThrow(() -> new ErpExceptions.NotFound("Document not found"));
    }

    @GetMapping("/documents/{documentId}/extracted-text")
    TenderDtos.DocumentTextResponse extractedText(@PathVariable long documentId) {
        return documentRepository.findById(documentId)
                .map(TenderDtos.DocumentTextResponse::from)
                .orElseThrow(() -> new ErpExceptions.NotFound("Document not found"));
    }

    @PostMapping("/documents/{documentId}/extract-text")
    TenderDtos.DocumentTextResponse extractText(@PathVariable long documentId) {
        return TenderDtos.DocumentTextResponse.from(
                textExtractionService.extractText(documentId));
    }

    @GetMapping("/documents/{documentId}/facts")
    TenderDtos.DocumentFactsResponse facts(@PathVariable long documentId) {
        return documentRepository.findById(documentId)
                .map(document -> TenderDtos.DocumentFactsResponse.from(document, objectMapper))
                .orElseThrow(() -> new ErpExceptions.NotFound("Document not found"));
    }

    @PostMapping("/documents/{documentId}/extract-facts")
    TenderDtos.DocumentFactsResponse extractFacts(@PathVariable long documentId) {
        return TenderDtos.DocumentFactsResponse.from(
                factExtractionService.extractFacts(documentId),
                objectMapper);
    }

    @GetMapping("/documents/{documentId}/summary")
    TenderDtos.DocumentSummaryResponse summary(@PathVariable long documentId) {
        return documentRepository.findById(documentId)
                .map(document -> TenderDtos.DocumentSummaryResponse.from(document, objectMapper))
                .orElseThrow(() -> new ErpExceptions.NotFound("Document not found"));
    }

    @PostMapping("/documents/{documentId}/generate-summary")
    TenderDtos.DocumentSummaryResponse generateSummary(@PathVariable long documentId) {
        return TenderDtos.DocumentSummaryResponse.from(
                summaryService.generateSummary(documentId),
                objectMapper);
    }

    @GetMapping("/documents/{documentId}/risk-analysis")
    TenderDtos.DocumentRiskResponse riskAnalysis(@PathVariable long documentId) {
        return documentRepository.findById(documentId)
                .map(document -> TenderDtos.DocumentRiskResponse.from(document, objectMapper))
                .orElseThrow(() -> new ErpExceptions.NotFound("Document not found"));
    }

    @PostMapping("/documents/{documentId}/analyze-risks")
    TenderDtos.DocumentRiskResponse analyzeRisks(@PathVariable long documentId) {
        return TenderDtos.DocumentRiskResponse.from(
                riskAnalysisService.analyzeRisks(documentId),
                objectMapper);
    }

    @PostMapping("/documents/{documentId}/suggest-task")
    TenderDtos.TaskSuggestionResponse suggestTask(@PathVariable long documentId) {
        return taskSuggestionService.suggestTask(documentId);
    }

    @GetMapping("/tenders")
    List<TenderDtos.TenderResponse> tenders() {
        return tenderRepository.findAllByOrderByYearDescTenderIdAsc().stream()
                .map(TenderDtos.TenderResponse::from)
                .toList();
    }

    @GetMapping("/tenders/page")
    TenderDtos.TenderPageResponse tendersPage(
            @RequestParam(name = "offset", defaultValue = "0") int offset,
            @RequestParam(name = "limit", defaultValue = "50") int limit
    ) {
        int normalizedOffset = normalizeOffset(offset);
        int normalizedLimit = normalizeLimit(limit);
        var page = tenderRepository.findAll(new OffsetLimitPageable(
                normalizedLimit,
                normalizedOffset,
                Sort.by(Sort.Order.desc("year"), Sort.Order.asc("tenderId"))));
        return new TenderDtos.TenderPageResponse(
                TenderDtos.PageMeta.of(page.getTotalElements(), normalizedOffset, normalizedLimit),
                page.getContent().stream().map(TenderDtos.TenderResponse::from).toList());
    }

    @GetMapping("/tenders/{tenderId}")
    TenderDtos.TenderResponse tender(@PathVariable String tenderId) {
        return tenderRepository.findByTenderId(tenderId)
                .map(TenderDtos.TenderResponse::from)
                .orElseThrow(() -> new ErpExceptions.NotFound("Tender not found"));
    }

    @PostMapping("/tenders/company")
    TenderDtos.TenderResponse createCompanyWorkflow(
            JwtAuthenticationToken authentication,
            @Valid @RequestBody CreateCompanyWorkflowRequest request
    ) {
        ErpPrincipal principal = ErpPrincipal.from(authentication);
        if (!principal.admin()) {
            throw new ErpExceptions.Forbidden("Admin access is required");
        }
        String organization = normalizeCompanyName(request.organization());
        int selectedYear = request.year() == null ? java.time.LocalDate.now(java.time.ZoneOffset.UTC).getYear() : request.year();
        String prefix = companyCode(organization) + "-" + selectedYear + "-";
        int nextSequence = tenderRepository.findAllByTenderIdStartingWith(prefix).stream()
                .map(Tender::getSequence)
                .filter(value -> value != null)
                .max(Integer::compareTo)
                .orElse(0) + 1;
        String tenderId = prefix + String.format("%03d", nextSequence);
        Tender tender = tenderRepository.saveAndFlush(Tender.create(
                tenderId,
                organization,
                selectedYear,
                nextSequence,
                request.internalUnit() == null || request.internalUnit().isBlank() ? "GENEL" : request.internalUnit().trim(),
                organization + " " + selectedYear + " çalışma alanı",
                Instant.now()));
        return TenderDtos.TenderResponse.from(tender);
    }

    @GetMapping("/tenders/{tenderId}/missing-documents")
    TenderDtos.MissingDocumentsResponse missingDocuments(@PathVariable String tenderId) {
        return missingDocumentService.detectMissingDocuments(tenderId);
    }

    @PostMapping("/dashboard/upload")
    TenderDtos.DocumentResponse upload(
            @RequestParam("file") MultipartFile file,
            @RequestParam("internal_unit") String internalUnit,
            @RequestParam("organization") String organization,
            @RequestParam("year") Integer year,
            @RequestParam(name = "tender_id", required = false) String tenderId,
            @RequestParam(name = "caption", required = false) String caption
    ) {
        return TenderDtos.DocumentResponse.from(ingestionService.upload(
                file,
                internalUnit,
                organization,
                year,
                tenderId,
                caption));
    }

    record CreateCompanyWorkflowRequest(
            @NotBlank @Size(min = 2, max = 160) String organization,
            Integer year,
            @JsonProperty("internal_unit") @Size(max = 128) String internalUnit
    ) {
    }

    private String normalizeCompanyName(String value) {
        if (value == null || value.isBlank()) {
            throw new ErpExceptions.BadRequest("Company name is required");
        }
        return value.trim().toUpperCase(java.util.Locale.ROOT);
    }

    private String companyCode(String value) {
        String normalized = normalizeCompanyName(value)
                .replaceAll("[^A-Z0-9ÇĞİÖŞÜ]+", "-")
                .replaceAll("^-+|-+$", "");
        return normalized.isBlank() ? "SIRKET" : normalized.substring(0, Math.min(normalized.length(), 32));
    }

    @PostMapping("/erp/tasks/from-document/{documentId}")
    TaskFromDocumentResponse taskFromDocument(
            JwtAuthenticationToken authentication,
            @PathVariable long documentId,
            @Valid @RequestBody TaskFromDocumentRequest request
    ) {
        TenderTaskService.Result result = tenderTaskService.createTaskFromDocument(
                ErpPrincipal.from(authentication),
                documentId,
                request.title(),
                request.description(),
                request.assigneeUserIds(),
                request.assigneeTeamIds(),
                request.priority(),
                request.deadlineAt());
        return new TaskFromDocumentResponse(
                ErpDtos.TaskResponse.from(result.task()),
                ErpDtos.TaskDocumentResponse.from(result.document()));
    }

    record TaskFromDocumentRequest(
            @NotBlank @Size(min = 3, max = 255) String title,
            @Size(max = 10_000) String description,
            @JsonProperty("assignee_user_ids") List<Long> assigneeUserIds,
            @JsonProperty("assignee_team_ids") List<Long> assigneeTeamIds,
            String priority,
            @JsonProperty("deadline_at") Instant deadlineAt
    ) {
        TaskFromDocumentRequest {
            assigneeUserIds = assigneeUserIds == null ? List.of() : List.copyOf(assigneeUserIds);
            assigneeTeamIds = assigneeTeamIds == null ? List.of() : List.copyOf(assigneeTeamIds);
            priority = priority == null || priority.isBlank() ? "normal" : priority;
        }
    }

    record TaskFromDocumentResponse(
            ErpDtos.TaskResponse task,
            ErpDtos.TaskDocumentResponse document
    ) {
    }

    private int normalizeOffset(int offset) {
        return Math.max(0, offset);
    }

    private int normalizeLimit(int limit) {
        return Math.max(1, Math.min(limit, 100));
    }
}
