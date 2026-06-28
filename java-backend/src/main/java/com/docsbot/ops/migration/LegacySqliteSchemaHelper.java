package com.docsbot.ops.migration;

import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.HashSet;
import java.util.Set;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

@Component
@Profile("postgres")
class LegacySqliteSchemaHelper {

    void prepare(Connection connection) throws SQLException {
        createDocumentsIfMissing(connection);
        createTendersIfMissing(connection);
        createTelegramChatBindingsIfMissing(connection);
        createTelegramChatSetupsIfMissing(connection);
        createTenderOrganizationsIfMissing(connection);

        ensureColumn(connection, "documents", "source", "source TEXT DEFAULT 'telegram'");
        ensureColumn(connection, "documents", "stored_filename", "stored_filename TEXT");
        ensureColumn(connection, "documents", "checksum", "checksum TEXT");
        ensureColumn(connection, "documents", "file_path", "file_path TEXT");
        ensureColumn(connection, "documents", "file_size", "file_size INTEGER");
        ensureColumn(connection, "documents", "internal_unit", "internal_unit TEXT");
        ensureColumn(connection, "documents", "organization", "organization TEXT");
        ensureColumn(connection, "documents", "year", "year INTEGER");
        ensureColumn(connection, "documents", "document_type", "document_type TEXT DEFAULT 'unknown'");
        ensureColumn(connection, "documents", "status", "status TEXT DEFAULT 'received'");
        ensureColumn(connection, "documents", "error_message", "error_message TEXT");
        ensureColumn(connection, "documents", "created_at", "created_at TEXT");

        ensureColumn(connection, "tenders", "internal_unit", "internal_unit TEXT");
        ensureColumn(connection, "tenders", "title", "title TEXT");
        ensureColumn(connection, "tenders", "status", "status TEXT DEFAULT 'active'");
        ensureColumn(connection, "tenders", "created_at", "created_at TEXT");
    }

    private void createDocumentsIfMissing(Connection connection) throws SQLException {
        executeIfMissing(connection, "documents", """
                create table documents (
                    id integer primary key,
                    message_id text,
                    sender_hash text,
                    source text default 'telegram',
                    timestamp text,
                    media_id text,
                    mime_type text,
                    original_filename text,
                    stored_filename text,
                    caption text,
                    checksum text,
                    file_path text,
                    file_size integer,
                    internal_unit text,
                    organization text,
                    year integer,
                    tender_id text,
                    document_type text default 'unknown',
                    status text default 'received',
                    error_message text,
                    created_at text
                )
                """);
    }

    private void createTendersIfMissing(Connection connection) throws SQLException {
        executeIfMissing(connection, "tenders", """
                create table tenders (
                    id integer primary key,
                    tender_id text,
                    organization text,
                    year integer,
                    sequence integer,
                    internal_unit text,
                    title text,
                    status text default 'active',
                    created_at text
                )
                """);
    }

    private void createTelegramChatBindingsIfMissing(Connection connection) throws SQLException {
        executeIfMissing(connection, "telegram_chat_bindings", """
                create table telegram_chat_bindings (
                    id integer primary key,
                    chat_id text,
                    chat_title text,
                    tender_id text,
                    created_at text,
                    updated_at text
                )
                """);
    }

    private void createTelegramChatSetupsIfMissing(Connection connection) throws SQLException {
        executeIfMissing(connection, "telegram_chat_setups", """
                create table telegram_chat_setups (
                    id integer primary key,
                    chat_id text,
                    chat_title text,
                    internal_unit text,
                    updated_at text
                )
                """);
    }

    private void createTenderOrganizationsIfMissing(Connection connection) throws SQLException {
        executeIfMissing(connection, "tender_organizations", """
                create table tender_organizations (
                    id integer primary key,
                    code text,
                    name text,
                    active integer default 1,
                    created_at text
                )
                """);
    }

    private void executeIfMissing(Connection connection, String table, String sql) throws SQLException {
        if (tableExists(connection, table)) {
            return;
        }
        try (var statement = connection.createStatement()) {
            statement.execute(sql);
        }
    }

    private void ensureColumn(
            Connection connection,
            String table,
            String column,
            String definition
    ) throws SQLException {
        if (columns(connection, table).contains(column)) {
            return;
        }
        try (var statement = connection.createStatement()) {
            statement.execute("alter table " + table + " add column " + definition);
        }
    }

    private boolean tableExists(Connection connection, String table) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(
                "select 1 from sqlite_master where type='table' and name=?")) {
            statement.setString(1, table);
            try (ResultSet rows = statement.executeQuery()) {
                return rows.next();
            }
        }
    }

    private Set<String> columns(Connection connection, String table) throws SQLException {
        Set<String> columns = new HashSet<>();
        try (var statement = connection.createStatement();
             ResultSet rows = statement.executeQuery("pragma table_info(" + table + ")")) {
            while (rows.next()) {
                columns.add(rows.getString("name"));
            }
        }
        return columns;
    }
}
