package com.docsbot.ops.erp.application;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Locale;

import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import com.docsbot.ops.erp.ErpDtos;

@Service
@Profile("postgres")
public class ErpAnalyticsService {

    private final JdbcTemplate jdbcTemplate;

    public ErpAnalyticsService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public ErpDtos.AnalyticsSummaryResponse summary(ErpPrincipal principal) {
        if (!principal.admin()) {
            throw new ErpExceptions.Forbidden("Admin role is required");
        }

        Instant now = Instant.now();
        long tasksTotal = count("select count(*) from erp_tasks");
        long doneTasks = count("select count(*) from erp_tasks where status = 'DONE'");
        return new ErpDtos.AnalyticsSummaryResponse(
                now,
                count("select count(*) from erp_users"),
                count("select count(*) from erp_users where status in ('ONLINE', 'AWAY')"),
                count("select count(*) from erp_teams"),
                tasksTotal,
                groupedCounts("""
                        select status as metric_key, count(*) as metric_count
                          from erp_tasks
                         group by status
                         order by status
                        """),
                groupedCounts("""
                        select priority as metric_key, count(*) as metric_count
                          from erp_tasks
                         group by priority
                         order by priority
                        """),
                count("""
                        select count(*)
                          from erp_tasks
                         where status = 'OVERDUE'
                            or (
                                deadline_at < current_timestamp
                                and status not in ('DONE', 'CANCELLED')
                            )
                        """),
                count("""
                        select count(*)
                          from erp_tasks
                         where deadline_at >= ?
                           and deadline_at < ?
                           and status not in ('DONE', 'CANCELLED')
                        """,
                        Timestamp.from(now),
                        Timestamp.from(now.plus(7, ChronoUnit.DAYS))),
                count("select count(*) from erp_tasks where status = 'BLOCKED'"),
                count("select count(*) from erp_tasks where status = 'PENDING_APPROVAL'"),
                count("""
                        select count(*)
                          from erp_tasks task
                         where not exists (
                               select 1
                                 from erp_task_assignments assignment
                                where assignment.task_id = task.id
                         )
                        """),
                count("select count(*) from erp_task_documents"),
                count("select count(*) from erp_notifications where read_at is null"),
                tasksTotal == 0 ? 0.0 : (double) doneTasks / (double) tasksTotal);
    }

    private long count(String sql, Object... params) {
        Long value = jdbcTemplate.queryForObject(sql, Long.class, params);
        return value == null ? 0 : value;
    }

    private List<ErpDtos.MetricCount> groupedCounts(String sql) {
        return jdbcTemplate.query(
                sql,
                (resultSet, rowNumber) -> new ErpDtos.MetricCount(
                        resultSet.getString("metric_key").toLowerCase(Locale.ROOT),
                        resultSet.getLong("metric_count")));
    }
}
