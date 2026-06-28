package com.docsbot.ops.migration;

import java.time.Instant;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

@Testcontainers(disabledWithoutDocker = true)
class PostgresMigrationIntegrationTest {

    @Container
    static final PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("docsbot")
            .withUsername("docsbot")
            .withPassword("docsbot");

    @Test
    void migrationsCreatePostgresSearchIndexesAndSupportFullTextQueries() {
        DriverManagerDataSource dataSource = new DriverManagerDataSource(
                postgres.getJdbcUrl(),
                postgres.getUsername(),
                postgres.getPassword());

        Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .load()
                .migrate();

        JdbcTemplate jdbc = new JdbcTemplate(dataSource);

        assertEquals(
                "gin",
                jdbc.queryForObject(
                        """
                        select am.amname
                        from pg_class index_class
                        join pg_index index_definition
                            on index_definition.indexrelid = index_class.oid
                        join pg_class table_class
                            on table_class.oid = index_definition.indrelid
                        join pg_am am
                            on am.oid = index_class.relam
                        where table_class.relname = 'documents'
                          and index_class.relname = 'ix_documents_search_vector'
                        """,
                        String.class));
        assertTrue(Boolean.TRUE.equals(jdbc.queryForObject(
                """
                select exists (
                    select 1
                    from pg_indexes
                    where tablename = 'documents'
                      and indexname = 'ix_documents_search_filters'
                )
                """,
                Boolean.class)));

        jdbc.update(
                """
                insert into documents (
                    message_id, sender_hash, source, timestamp, media_id,
                    original_filename, stored_filename, caption, tender_id,
                    document_type, organization, internal_unit, year,
                    extracted_text, text_extraction_status
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                "msg-1",
                "sender-hash",
                "telegram",
                Instant.parse("2026-06-23T12:00:00Z"),
                "media-1",
                "teknik-sartname.pdf",
                "stored.pdf",
                "Teknik şartname ve garanti koşulları",
                "MOBIT-2026-001",
                "specification",
                "Mobit",
                "ERP",
                2026,
                "Sunucu bakımı, garanti ve teslimat kriterleri bu ihale dosyasında yer alır.",
                "done");

        Integer matches = jdbc.queryForObject(
                """
                select count(*)
                from documents
                where to_tsvector(
                    'simple',
                    coalesce(original_filename, '') || ' ' ||
                    coalesce(stored_filename, '') || ' ' ||
                    coalesce(caption, '') || ' ' ||
                    coalesce(tender_id, '') || ' ' ||
                    coalesce(organization, '') || ' ' ||
                    coalesce(internal_unit, '') || ' ' ||
                    coalesce(document_type, '') || ' ' ||
                    coalesce(extracted_text, '')
                ) @@ websearch_to_tsquery('simple', ?)
                  and upper(organization) = upper(?)
                  and year = ?
                  and document_type = ?
                """,
                Integer.class,
                "garanti teslimat",
                "mobit",
                2026,
                "specification");

        assertEquals(1, matches);
    }
}
