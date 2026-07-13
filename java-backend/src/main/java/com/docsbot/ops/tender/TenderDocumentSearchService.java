package com.docsbot.ops.tender;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.text.Normalizer;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

import javax.sql.DataSource;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.docsbot.ops.tender.domain.TenderDocument;
import com.docsbot.ops.tender.infrastructure.TenderDocumentRepository;

@Service
@Profile("postgres")
public class TenderDocumentSearchService {

    private static final String SEARCH_VECTOR = """
            to_tsvector(
                'simple',
                coalesce(original_filename, '') || ' ' ||
                coalesce(stored_filename, '') || ' ' ||
                coalesce(caption, '') || ' ' ||
                coalesce(tender_id, '') || ' ' ||
                coalesce(organization, '') || ' ' ||
                coalesce(internal_unit, '') || ' ' ||
                coalesce(document_type, '') || ' ' ||
                coalesce(extracted_text, '')
            )
            """;

    private final TenderDocumentRepository documentRepository;
    private final JdbcTemplate jdbcTemplate;
    private final boolean postgres;

    public TenderDocumentSearchService(
            TenderDocumentRepository documentRepository,
            JdbcTemplate jdbcTemplate,
            DataSource dataSource
    ) {
        this.documentRepository = documentRepository;
        this.jdbcTemplate = jdbcTemplate;
        this.postgres = detectPostgres(dataSource);
    }

    public TenderDtos.DocumentSearchResponse search(
            String query,
            String organization,
            Integer year,
            String documentType,
            String tenderId,
            int requestedLimit
    ) {
        int limit = Math.max(1, Math.min(requestedLimit, 100));
        SearchCriteria criteria = new SearchCriteria(
                blankToNull(query),
                blankToNull(organization),
                year,
                blankToNull(documentType),
                blankToNull(tenderId),
                limit);
        if (postgres) {
            return searchPostgres(criteria);
        }
        return searchInMemory(criteria);
    }

    private TenderDtos.DocumentSearchResponse searchPostgres(SearchCriteria criteria) {
        List<Object> params = new ArrayList<>();
        StringBuilder sql = new StringBuilder();
        boolean hasQuery = criteria.query() != null;

        sql.append("select count(*) over() as total_count, ");
        sql.append("id, tender_id, original_filename, document_type, organization, ");
        sql.append("internal_unit, year, source, timestamp, text_extraction_status, ");
        if (hasQuery) {
            sql.append("ts_rank_cd(").append(SEARCH_VECTOR)
                    .append(", websearch_to_tsquery('simple', ?)) as rank, ");
            params.add(criteria.query());
            sql.append("ts_headline('simple', coalesce(extracted_text, coalesce(caption, coalesce(original_filename, ''))), ");
            // StartSel/StopSel emptied so the snippet is plain text (no <b> highlight markup):
            // consistent with the in-memory fallback and safe for the frontend to render as text.
            sql.append("websearch_to_tsquery('simple', ?), 'StartSel=\"\", StopSel=\"\", MaxFragments=2, MinWords=5, MaxWords=18') as snippet ");
            params.add(criteria.query());
        } else {
            sql.append("0.0 as rank, ");
            sql.append("left(coalesce(extracted_text, coalesce(caption, coalesce(original_filename, ''))), 240) as snippet ");
        }
        sql.append("from documents ");

        List<String> where = new ArrayList<>();
        if (hasQuery) {
            where.add(SEARCH_VECTOR + " @@ websearch_to_tsquery('simple', ?)");
            params.add(criteria.query());
        }
        appendFilters(where, params, criteria);
        if (!where.isEmpty()) {
            sql.append("where ").append(String.join(" and ", where)).append(" ");
        }
        sql.append("order by rank desc, timestamp desc, id desc limit ?");
        params.add(criteria.limit());

        List<TenderDtos.DocumentSearchResult> results = jdbcTemplate.query(
                sql.toString(),
                this::mapSearchResult,
                params.toArray());
        int total = results.isEmpty()
                ? 0
                : jdbcTemplate.queryForObject(
                        "select count(*) from (" + sql.toString().replaceFirst("limit \\?", "") + ") search_count",
                        Integer.class,
                        params.subList(0, params.size() - 1).toArray());
        return new TenderDtos.DocumentSearchResponse(total, results);
    }

    private void appendFilters(
            List<String> where,
            List<Object> params,
            SearchCriteria criteria
    ) {
        if (criteria.organization() != null) {
            where.add("upper(organization) = upper(?)");
            params.add(criteria.organization());
        }
        if (criteria.year() != null) {
            where.add("year = ?");
            params.add(criteria.year());
        }
        if (criteria.documentType() != null) {
            where.add("document_type = ?");
            params.add(criteria.documentType());
        }
        if (criteria.tenderId() != null) {
            where.add("tender_id = ?");
            params.add(criteria.tenderId());
        }
    }

    private TenderDtos.DocumentSearchResponse searchInMemory(SearchCriteria criteria) {
        List<ScoredDocument> scored = documentRepository.findAllByOrderByTimestampDescIdDesc().stream()
                .filter(document -> matchesFilters(document, criteria))
                .map(document -> score(document, criteria.query()))
                .filter(scoredDocument -> criteria.query() == null || scoredDocument.rank() > 0)
                .sorted(Comparator
                        .comparingDouble(ScoredDocument::rank).reversed()
                        .thenComparing(
                                scoredDocument -> scoredDocument.document().getTimestamp(),
                                Comparator.nullsLast(Comparator.reverseOrder()))
                        .thenComparing(
                                scoredDocument -> scoredDocument.document().getId(),
                                Comparator.nullsLast(Comparator.reverseOrder())))
                .toList();
        List<TenderDtos.DocumentSearchResult> results = scored.stream()
                .limit(criteria.limit())
                .map(scoredDocument -> toSearchResult(
                        scoredDocument.document(),
                        scoredDocument.rank(),
                        scoredDocument.snippet()))
                .toList();
        return new TenderDtos.DocumentSearchResponse(scored.size(), results);
    }

    private boolean matchesFilters(TenderDocument document, SearchCriteria criteria) {
        return equalsIgnoreCaseOrAny(document.getOrganization(), criteria.organization())
                && (criteria.year() == null || criteria.year().equals(document.getYear()))
                && equalsOrAny(document.getDocumentType(), criteria.documentType())
                && equalsOrAny(document.getTenderId(), criteria.tenderId());
    }

    private ScoredDocument score(TenderDocument document, String query) {
        String haystack = searchableText(document);
        if (query == null) {
            return new ScoredDocument(document, 0.0, snippet(document, null));
        }
        String normalizedHaystack = normalize(haystack);
        String normalizedQuery = normalize(query);
        double rank = 0.0;
        if (normalizedHaystack.contains(normalizedQuery)) {
            rank += 4.0;
        }
        for (String token : normalizedQuery.split("\\s+")) {
            if (!token.isBlank() && normalizedHaystack.contains(token)) {
                rank += 1.0;
            }
        }
        return new ScoredDocument(document, rank, snippet(document, normalizedQuery));
    }

    private String searchableText(TenderDocument document) {
        return String.join(" ",
                safe(document.getOriginalFilename()),
                safe(document.getStoredFilename()),
                safe(document.getCaption()),
                safe(document.getTenderId()),
                safe(document.getOrganization()),
                safe(document.getInternalUnit()),
                safe(document.getDocumentType()),
                safe(document.getExtractedText()));
    }

    private String snippet(TenderDocument document, String normalizedQuery) {
        String text = firstNonBlank(
                document.getExtractedText(),
                document.getCaption(),
                document.getOriginalFilename(),
                document.getTenderId());
        if (text == null) return "";
        String compact = text.replaceAll("\\s+", " ").trim();
        if (normalizedQuery == null || normalizedQuery.isBlank()) {
            return compact.substring(0, Math.min(compact.length(), 240));
        }
        String normalizedText = normalize(compact);
        int index = normalizedText.indexOf(normalizedQuery);
        if (index < 0) {
            for (String token : normalizedQuery.split("\\s+")) {
                index = normalizedText.indexOf(token);
                if (index >= 0) break;
            }
        }
        if (index < 0) {
            return compact.substring(0, Math.min(compact.length(), 240));
        }
        int start = Math.max(0, index - 80);
        int end = Math.min(compact.length(), index + 160);
        return compact.substring(start, end);
    }

    private TenderDtos.DocumentSearchResult mapSearchResult(ResultSet resultSet, int rowNumber)
            throws SQLException {
        return new TenderDtos.DocumentSearchResult(
                resultSet.getLong("id"),
                resultSet.getString("tender_id"),
                resultSet.getString("original_filename"),
                resultSet.getString("document_type"),
                resultSet.getString("organization"),
                resultSet.getString("internal_unit"),
                (Integer) resultSet.getObject("year"),
                resultSet.getString("source"),
                toInstant(resultSet.getTimestamp("timestamp")),
                resultSet.getString("text_extraction_status"),
                resultSet.getDouble("rank"),
                resultSet.getString("snippet"));
    }

    private TenderDtos.DocumentSearchResult toSearchResult(
            TenderDocument document,
            double rank,
            String snippet
    ) {
        return new TenderDtos.DocumentSearchResult(
                document.getId(),
                document.getTenderId(),
                document.getOriginalFilename(),
                document.getDocumentType(),
                document.getOrganization(),
                document.getInternalUnit(),
                document.getYear(),
                document.getSource(),
                document.getTimestamp(),
                document.getTextExtractionStatus(),
                rank,
                snippet);
    }

    private boolean detectPostgres(DataSource dataSource) {
        try (var connection = dataSource.getConnection()) {
            return connection.getMetaData().getDatabaseProductName()
                    .toLowerCase(Locale.ROOT)
                    .contains("postgresql");
        } catch (SQLException exception) {
            return false;
        }
    }

    private static Instant toInstant(Timestamp value) {
        return value == null ? null : value.toInstant();
    }

    private static String normalize(String value) {
        String normalized = Normalizer.normalize(safe(value), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "");
        return normalized.toLowerCase(Locale.ROOT);
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) return value;
        }
        return null;
    }

    private static boolean equalsOrAny(String actual, String expected) {
        return expected == null || expected.equals(actual);
    }

    private static boolean equalsIgnoreCaseOrAny(String actual, String expected) {
        return expected == null || (actual != null && actual.equalsIgnoreCase(expected));
    }

    private record SearchCriteria(
            String query,
            String organization,
            Integer year,
            String documentType,
            String tenderId,
            int limit
    ) {
    }

    private record ScoredDocument(
            TenderDocument document,
            double rank,
            String snippet
    ) {
    }
}
