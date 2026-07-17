package com.docsbot.ops.erp;

import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.docsbot.ops.erp.application.ErpPrincipal;
import com.docsbot.ops.erp.application.PerformanceService;
import com.fasterxml.jackson.annotation.JsonProperty;

/** Admin-only per-user task performance (see {@link PerformanceService} for the scoring rules). */
@RestController
@RequestMapping("/erp/performance")
@Profile("postgres")
public class PerformanceController {

    private final PerformanceService performanceService;

    public PerformanceController(PerformanceService performanceService) {
        this.performanceService = performanceService;
    }

    @GetMapping
    List<UserPerformanceResponse> performance(
            JwtAuthenticationToken authentication,
            @RequestParam(defaultValue = "week") String period
    ) {
        return performanceService.listPerformance(ErpPrincipal.from(authentication), period).stream()
                .map(UserPerformanceResponse::from)
                .toList();
    }

    record UserPerformanceResponse(
            @JsonProperty("user_id") long userId,
            String name,
            @JsonProperty("on_time") int onTime,
            int late,
            @JsonProperty("overdue_open") int overdueOpen,
            @JsonProperty("open_active") int openActive,
            Integer score
    ) {
        static UserPerformanceResponse from(PerformanceService.UserPerformance row) {
            return new UserPerformanceResponse(
                    row.userId(), row.name(), row.onTime(), row.late(),
                    row.overdueOpen(), row.openActive(), row.score());
        }
    }
}
