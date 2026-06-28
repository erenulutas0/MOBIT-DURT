package com.docsbot.ops.tender;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

@Service
@Profile("postgres")
public class TenderDocumentFacetService {

    private final JdbcTemplate jdbcTemplate;

    public TenderDocumentFacetService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public TenderDtos.DocumentFacetsResponse facets() {
        return new TenderDtos.DocumentFacetsResponse(
                facet("organization"),
                facet("year"),
                facet("internal_unit"),
                facet("document_type"),
                facet("status"),
                instant("select min(timestamp) from documents"),
                instant("select max(timestamp) from documents"));
    }

    private List<TenderDtos.FacetValue> facet(String column) {
        String sql = """
                select cast(%s as varchar) as facet_value, count(*) as facet_count
                  from documents
                 where %s is not null
                 group by %s
                 order by count(*) desc, cast(%s as varchar) asc
                """.formatted(column, column, column, column);
        return jdbcTemplate.query(
                sql,
                (resultSet, rowNumber) -> new TenderDtos.FacetValue(
                        resultSet.getString("facet_value"),
                        resultSet.getLong("facet_count")));
    }

    private Instant instant(String sql) {
        Timestamp value = jdbcTemplate.queryForObject(sql, Timestamp.class);
        return value == null ? null : value.toInstant();
    }
}
