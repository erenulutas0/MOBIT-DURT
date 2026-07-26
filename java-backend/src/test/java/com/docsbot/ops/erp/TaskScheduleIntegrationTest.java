package com.docsbot.ops.erp;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Flexible scheduling. A task could only say "due at this exact instant", but tender work is
 * expressed relative to a date: start AFTER the bid opens, finish BEFORE submission, hand it in BY
 * Friday, do it BETWEEN two dates. deadline_at keeps meaning "must be done by" throughout, so the
 * due-soon and overdue ladders are unaffected by the choice.
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class TaskScheduleIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void aTaskDefaultsToAPlainDueDate() throws Exception {
        mockMvc.perform(createTask("""
                        {"title":"Duz termin","priority":"normal","deadline_at":"%s"}
                        """.formatted(inDays(3))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.schedule_kind").value("at"))
                .andExpect(jsonPath("$.starts_at").doesNotExist());
    }

    @Test
    void aWindowKeepsBothEnds() throws Exception {
        String start = inDays(2);
        String end = inDays(5);
        mockMvc.perform(createTask("""
                        {"title":"Iki tarih arasinda","priority":"high",
                         "schedule_kind":"between","starts_at":"%s","deadline_at":"%s"}
                        """.formatted(start, end)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.schedule_kind").value("between"))
                .andExpect(jsonPath("$.starts_at").exists())
                .andExpect(jsonPath("$.deadline_at").exists());
    }

    @Test
    void afterKeepsTheStartAnchorAndToleratesNoDueDate() throws Exception {
        mockMvc.perform(createTask("""
                        {"title":"Ihale acilisindan sonra","priority":"normal",
                         "schedule_kind":"after","starts_at":"%s"}
                        """.formatted(inDays(4))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.schedule_kind").value("after"))
                .andExpect(jsonPath("$.starts_at").exists());
    }

    @Test
    void aKindThatNeedsAStartDateIsRejectedWithoutOne() throws Exception {
        mockMvc.perform(createTask("""
                        {"title":"Eksik baslangic","priority":"normal",
                         "schedule_kind":"between","deadline_at":"%s"}
                        """.formatted(inDays(3))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void aStartAfterItsOwnDeadlineIsRejected() throws Exception {
        mockMvc.perform(createTask("""
                        {"title":"Ters aralik","priority":"normal",
                         "schedule_kind":"between","starts_at":"%s","deadline_at":"%s"}
                        """.formatted(inDays(9), inDays(2))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void aPlainDueDateCanBeConvertedIntoAWindowLater() throws Exception {
        String created = mockMvc.perform(createTask("""
                        {"title":"Sonradan aralik","priority":"normal","deadline_at":"%s"}
                        """.formatted(inDays(6))))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        long taskId = ((Number) JsonPath.read(created, "$.id")).longValue();

        mockMvc.perform(patch("/erp/tasks/" + taskId)
                        .header("Authorization", "Bearer " + loginAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"schedule_kind":"between","starts_at":"%s"}
                                """.formatted(inDays(1))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.schedule_kind").value("between"))
                .andExpect(jsonPath("$.starts_at").exists())
                // The due date is untouched, so the deadline ladder keeps working as before.
                .andExpect(jsonPath("$.deadline_at").exists());
    }

    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder createTask(String body)
            throws Exception {
        return post("/erp/tasks")
                .header("Authorization", "Bearer " + loginAdmin())
                .contentType(MediaType.APPLICATION_JSON)
                .content(body);
    }

    private static String inDays(int days) {
        return Instant.now().plus(days, ChronoUnit.DAYS).toString();
    }

    private String loginAdmin() throws Exception {
        String response = mockMvc.perform(post("/erp/auth/admin-login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"username\":\"admin\",\"password\":\"admin123\"}"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(response, "$.access_token");
    }
}
