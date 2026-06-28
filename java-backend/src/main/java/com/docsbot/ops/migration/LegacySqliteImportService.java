package com.docsbot.ops.migration;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.temporal.ChronoField;
import java.util.HexFormat;

import javax.sql.DataSource;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.docsbot.ops.common.config.DocsBotProperties;

@Service
@Profile("postgres")
public class LegacySqliteImportService {

    private static final DateTimeFormatter SQLITE_TIMESTAMP =
            new DateTimeFormatterBuilder()
                    .appendPattern("yyyy-MM-dd HH:mm:ss")
                    .optionalStart()
                    .appendFraction(ChronoField.NANO_OF_SECOND, 0, 9, true)
                    .optionalEnd()
                    .toFormatter();

    private final DataSource targetDataSource;
    private final Path dataRoot;
    private final LegacySqliteSchemaHelper schemaHelper;

    public LegacySqliteImportService(
            DataSource targetDataSource,
            DocsBotProperties properties,
            LegacySqliteSchemaHelper schemaHelper
    ) {
        this.targetDataSource = targetDataSource;
        this.dataRoot = Path.of(properties.dataDir()).toAbsolutePath().normalize();
        this.schemaHelper = schemaHelper;
    }

    public ImportReport importDatabase(Path sourceDatabase) {
        Path source = sourceDatabase.toAbsolutePath().normalize();
        if (!Files.isRegularFile(source)) {
            throw new IllegalArgumentException("Legacy SQLite database not found: " + source);
        }

        String checksum = sha256(source);
        Instant startedAt = Instant.now();
        long runId = createRun(source, checksum, startedAt);

        try (Connection sourceConnection =
                     DriverManager.getConnection("jdbc:sqlite:" + source);
             Connection targetConnection = targetDataSource.getConnection()) {
            schemaHelper.prepare(sourceConnection);
            targetConnection.setAutoCommit(false);
            try {
                MutableReport report = new MutableReport();
                importOrganizations(sourceConnection, targetConnection, report);
                importTenders(sourceConnection, targetConnection, report);
                importDocuments(sourceConnection, targetConnection, report);
                importChatSetups(sourceConnection, targetConnection, report);
                importChatBindings(sourceConnection, targetConnection, report);
                targetConnection.commit();

                ImportReport result = report.toReport(
                        runId, source.toString(), checksum, startedAt, Instant.now());
                completeRun(result);
                return result;
            } catch (RuntimeException | SQLException exception) {
                targetConnection.rollback();
                throw exception;
            }
        } catch (SQLException exception) {
            failRun(runId, exception);
            throw new IllegalStateException("Legacy SQLite import failed", exception);
        }
    }

    private void importDocuments(
            Connection source,
            Connection target,
            MutableReport report
    ) throws SQLException {
        String select = """
                select message_id, sender_hash, source, timestamp, media_id, mime_type,
                       original_filename, stored_filename, caption, checksum, file_path,
                       file_size, internal_unit, organization, year, tender_id,
                       document_type, status, error_message, created_at
                from documents
                order by id
                """;
        String insert = """
                insert into documents (
                    message_id, sender_hash, source, timestamp, media_id, mime_type,
                    original_filename, stored_filename, caption, checksum, file_path,
                    file_size, internal_unit, organization, year, tender_id,
                    document_type, status, error_message, created_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """;
        try (PreparedStatement read = source.prepareStatement(select);
             ResultSet rows = read.executeQuery();
            PreparedStatement write = target.prepareStatement(insert)) {
            while (rows.next()) {
                String messageId = required(rows, "message_id");
                if (exists(target, "select 1 from documents where message_id=?", messageId)) {
                    report.skipped();
                    continue;
                }
                write.setString(1, messageId);
                write.setString(2, required(rows, "sender_hash"));
                write.setString(3, valueOr(rows.getString("source"), "telegram"));
                write.setTimestamp(4, timestamp(rows.getString("timestamp")));
                write.setString(5, required(rows, "media_id"));
                write.setString(6, rows.getString("mime_type"));
                write.setString(7, rows.getString("original_filename"));
                write.setString(8, rows.getString("stored_filename"));
                write.setString(9, rows.getString("caption"));
                write.setString(10, rows.getString("checksum"));
                write.setString(11, portableFilePath(rows.getString("file_path")));
                Long fileSize = nullableLong(rows, "file_size");
                if (fileSize == null) write.setNull(12, java.sql.Types.BIGINT);
                else write.setLong(12, fileSize);
                write.setString(13, rows.getString("internal_unit"));
                write.setString(14, rows.getString("organization"));
                Integer year = nullableInteger(rows, "year");
                if (year == null) write.setNull(15, java.sql.Types.INTEGER);
                else write.setInt(15, year);
                write.setString(16, required(rows, "tender_id"));
                write.setString(17, valueOr(rows.getString("document_type"), "unknown"));
                write.setString(18, valueOr(rows.getString("status"), "received"));
                write.setString(19, rows.getString("error_message"));
                write.setTimestamp(20, timestamp(rows.getString("created_at")));
                count(write.executeUpdate(), report::documentInserted, report::skipped);
            }
        }
    }

    private void importTenders(
            Connection source,
            Connection target,
            MutableReport report
    ) throws SQLException {
        String select = """
                select tender_id, organization, year, sequence, internal_unit,
                       title, status, created_at
                from tenders
                order by id
                """;
        String insert = """
                insert into tenders (
                    tender_id, organization, year, sequence, internal_unit,
                    title, status, created_at
                ) values (?, ?, ?, ?, ?, ?, ?, ?)
                """;
        try (PreparedStatement read = source.prepareStatement(select);
             ResultSet rows = read.executeQuery();
            PreparedStatement write = target.prepareStatement(insert)) {
            while (rows.next()) {
                String tenderId = required(rows, "tender_id");
                if (exists(target, "select 1 from tenders where tender_id=?", tenderId)) {
                    report.skipped();
                    continue;
                }
                write.setString(1, tenderId);
                write.setString(2, required(rows, "organization"));
                write.setInt(3, rows.getInt("year"));
                write.setInt(4, rows.getInt("sequence"));
                write.setString(5, rows.getString("internal_unit"));
                write.setString(6, rows.getString("title"));
                write.setString(7, valueOr(rows.getString("status"), "active"));
                write.setTimestamp(8, timestamp(rows.getString("created_at")));
                count(write.executeUpdate(), report::tenderInserted, report::skipped);
            }
        }
    }

    private void importChatBindings(
            Connection source,
            Connection target,
            MutableReport report
    ) throws SQLException {
        importSimple(
                source,
                target,
                """
                select chat_id, chat_title, tender_id, created_at, updated_at
                from telegram_chat_bindings order by id
                """,
                """
                insert into telegram_chat_bindings
                    (chat_id, chat_title, tender_id, created_at, updated_at)
                values (?, ?, ?, ?, ?)
                """,
                rows -> exists(
                        target,
                        "select 1 from telegram_chat_bindings where chat_id=?",
                        required(rows, "chat_id")),
                (rows, write) -> {
                    write.setString(1, required(rows, "chat_id"));
                    write.setString(2, rows.getString("chat_title"));
                    write.setString(3, required(rows, "tender_id"));
                    write.setTimestamp(4, timestamp(rows.getString("created_at")));
                    write.setTimestamp(5, timestamp(rows.getString("updated_at")));
                },
                report::bindingInserted,
                report);
    }

    private void importChatSetups(
            Connection source,
            Connection target,
            MutableReport report
    ) throws SQLException {
        importSimple(
                source,
                target,
                """
                select chat_id, chat_title, internal_unit, updated_at
                from telegram_chat_setups order by id
                """,
                """
                insert into telegram_chat_setups
                    (chat_id, chat_title, internal_unit, updated_at)
                values (?, ?, ?, ?)
                """,
                rows -> exists(
                        target,
                        "select 1 from telegram_chat_setups where chat_id=?",
                        required(rows, "chat_id")),
                (rows, write) -> {
                    write.setString(1, required(rows, "chat_id"));
                    write.setString(2, rows.getString("chat_title"));
                    write.setString(3, rows.getString("internal_unit"));
                    write.setTimestamp(4, timestamp(rows.getString("updated_at")));
                },
                report::setupInserted,
                report);
    }

    private void importOrganizations(
            Connection source,
            Connection target,
            MutableReport report
    ) throws SQLException {
        importSimple(
                source,
                target,
                """
                select code, name, active, created_at
                from tender_organizations order by id
                """,
                """
                insert into tender_organizations (code, name, active, created_at)
                values (?, ?, ?, ?)
                """,
                rows -> exists(
                        target,
                        "select 1 from tender_organizations where code=? or name=?",
                        required(rows, "code"),
                        required(rows, "name")),
                (rows, write) -> {
                    write.setString(1, required(rows, "code"));
                    write.setString(2, required(rows, "name"));
                    write.setInt(3, rows.getInt("active"));
                    write.setTimestamp(4, timestamp(rows.getString("created_at")));
                },
                report::organizationInserted,
                report);
    }

    private void importSimple(
            Connection source,
            Connection target,
            String select,
            String insert,
            RowExistence rowExists,
            RowBinder binder,
            Runnable inserted,
            MutableReport report
    ) throws SQLException {
        try (PreparedStatement read = source.prepareStatement(select);
             ResultSet rows = read.executeQuery();
            PreparedStatement write = target.prepareStatement(insert)) {
            while (rows.next()) {
                if (rowExists.exists(rows)) {
                    report.skipped();
                    continue;
                }
                binder.bind(rows, write);
                count(write.executeUpdate(), inserted, report::skipped);
            }
        }
    }

    private boolean exists(Connection target, String sql, Object... parameters)
            throws SQLException {
        try (PreparedStatement statement = target.prepareStatement(sql)) {
            for (int index = 0; index < parameters.length; index++) {
                statement.setObject(index + 1, parameters[index]);
            }
            try (ResultSet rows = statement.executeQuery()) {
                return rows.next();
            }
        }
    }

    private long createRun(Path source, String checksum, Instant startedAt) {
        String sql = """
                insert into legacy_import_runs
                    (source_path, source_checksum, status, started_at)
                values (?, ?, 'running', ?)
                """;
        try (Connection connection = targetDataSource.getConnection();
             PreparedStatement statement =
                     connection.prepareStatement(sql, new String[]{"id"})) {
            statement.setString(1, source.toString());
            statement.setString(2, checksum);
            statement.setTimestamp(3, Timestamp.from(startedAt));
            statement.executeUpdate();
            try (ResultSet keys = statement.getGeneratedKeys()) {
                if (keys.next()) return keys.getLong(1);
            }
            throw new IllegalStateException("Legacy import audit ID was not generated");
        } catch (SQLException exception) {
            throw new IllegalStateException("Legacy import audit could not be created", exception);
        }
    }

    private void completeRun(ImportReport report) {
        String sql = """
                update legacy_import_runs
                set status='completed', documents_inserted=?, tenders_inserted=?,
                    bindings_inserted=?, setups_inserted=?, organizations_inserted=?,
                    skipped_rows=?, completed_at=?
                where id=?
                """;
        try (Connection connection = targetDataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setInt(1, report.documentsInserted());
            statement.setInt(2, report.tendersInserted());
            statement.setInt(3, report.bindingsInserted());
            statement.setInt(4, report.setupsInserted());
            statement.setInt(5, report.organizationsInserted());
            statement.setInt(6, report.skippedRows());
            statement.setTimestamp(7, Timestamp.from(report.completedAt()));
            statement.setLong(8, report.runId());
            statement.executeUpdate();
        } catch (SQLException exception) {
            throw new IllegalStateException("Legacy import audit could not be completed", exception);
        }
    }

    private void failRun(long runId, Exception failure) {
        String sql = """
                update legacy_import_runs
                set status='failed', error_message=?, completed_at=?
                where id=?
                """;
        try (Connection connection = targetDataSource.getConnection();
             PreparedStatement statement = connection.prepareStatement(sql)) {
            statement.setString(1, truncate(failure.getMessage(), 4_000));
            statement.setTimestamp(2, Timestamp.from(Instant.now()));
            statement.setLong(3, runId);
            statement.executeUpdate();
        } catch (SQLException ignored) {
            // Preserve the original import failure.
        }
    }

    private String portableFilePath(String value) {
        if (value == null || value.isBlank()) return value;
        try {
            Path path = Path.of(value).toAbsolutePath().normalize();
            if (path.startsWith(dataRoot)) {
                return dataRoot.relativize(path).toString().replace('\\', '/');
            }
        } catch (RuntimeException ignored) {
            // Keep legacy path as-is when it cannot be parsed on this host.
        }
        return value.replace('\\', '/');
    }

    private String sha256(Path source) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (var input = Files.newInputStream(source)) {
                byte[] buffer = new byte[16_384];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    digest.update(buffer, 0, read);
                }
            }
            return HexFormat.of().formatHex(digest.digest());
        } catch (IOException | NoSuchAlgorithmException exception) {
            throw new IllegalStateException("Legacy database checksum could not be calculated", exception);
        }
    }

    private Timestamp timestamp(String value) {
        if (value == null || value.isBlank()) return Timestamp.from(Instant.now());
        return Timestamp.from(LocalDateTime.parse(value, SQLITE_TIMESTAMP).toInstant(ZoneOffset.UTC));
    }

    private String required(ResultSet rows, String column) throws SQLException {
        String value = rows.getString(column);
        if (value == null || value.isBlank()) {
            throw new IllegalStateException("Legacy row is missing required column: " + column);
        }
        return value;
    }

    private Long nullableLong(ResultSet rows, String column) throws SQLException {
        long value = rows.getLong(column);
        return rows.wasNull() ? null : value;
    }

    private Integer nullableInteger(ResultSet rows, String column) throws SQLException {
        int value = rows.getInt(column);
        return rows.wasNull() ? null : value;
    }

    private String valueOr(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value;
    }

    private String truncate(String value, int max) {
        if (value == null) return null;
        return value.substring(0, Math.min(value.length(), max));
    }

    private void count(int affected, Runnable inserted, Runnable skipped) {
        if (affected > 0) inserted.run();
        else skipped.run();
    }

    @FunctionalInterface
    private interface RowBinder {
        void bind(ResultSet rows, PreparedStatement write) throws SQLException;
    }

    @FunctionalInterface
    private interface RowExistence {
        boolean exists(ResultSet rows) throws SQLException;
    }

    private static final class MutableReport {
        private int documentsInserted;
        private int tendersInserted;
        private int bindingsInserted;
        private int setupsInserted;
        private int organizationsInserted;
        private int skippedRows;

        void documentInserted() { documentsInserted++; }
        void tenderInserted() { tendersInserted++; }
        void bindingInserted() { bindingsInserted++; }
        void setupInserted() { setupsInserted++; }
        void organizationInserted() { organizationsInserted++; }
        void skipped() { skippedRows++; }

        ImportReport toReport(
                long runId,
                String sourcePath,
                String checksum,
                Instant startedAt,
                Instant completedAt
        ) {
            return new ImportReport(
                    runId, sourcePath, checksum, documentsInserted, tendersInserted,
                    bindingsInserted, setupsInserted, organizationsInserted,
                    skippedRows, startedAt, completedAt);
        }
    }

    public record ImportReport(
            long runId,
            String sourcePath,
            String sourceChecksum,
            int documentsInserted,
            int tendersInserted,
            int bindingsInserted,
            int setupsInserted,
            int organizationsInserted,
            int skippedRows,
            Instant startedAt,
            Instant completedAt
    ) {
    }
}
