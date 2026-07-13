package com.docsbot.ops.common.health;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.Map;

import javax.sql.DataSource;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Public liveness/readiness endpoint hit by systemd + Nginx. It probes the database with a
 * 2s validity check so a Postgres outage (or exhausted connection pool) reports 503 "down"
 * instead of a misleading 200 — the old stub returned {"status":"ok"} unconditionally,
 * which meant the "API health" alert could never detect a DB-down incident.
 *
 * The DataSource is injected optionally: the default test profile excludes
 * DataSourceAutoConfiguration, so with no DataSource present we keep the legacy "ok"
 * response rather than failing to start.
 */
@RestController
public class HealthController {

    private static final int VALIDATION_TIMEOUT_SECONDS = 2;

    private final ObjectProvider<DataSource> dataSourceProvider;

    HealthController(ObjectProvider<DataSource> dataSourceProvider) {
        this.dataSourceProvider = dataSourceProvider;
    }

    @GetMapping("/health")
    ResponseEntity<Map<String, String>> health() {
        DataSource dataSource = dataSourceProvider.getIfAvailable();
        if (dataSource == null) {
            return ResponseEntity.ok(Map.of("status", "ok"));
        }
        try (Connection connection = dataSource.getConnection()) {
            if (connection.isValid(VALIDATION_TIMEOUT_SECONDS)) {
                return ResponseEntity.ok(Map.of("status", "ok"));
            }
        } catch (SQLException ignored) {
            // fall through to the down response
        }
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
                .body(Map.of("status", "down", "detail", "database"));
    }
}
