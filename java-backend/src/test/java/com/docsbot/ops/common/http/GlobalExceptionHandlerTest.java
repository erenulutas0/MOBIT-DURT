package com.docsbot.ops.common.http;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * A client sending a bad request is not a server failure. The catch-all handler used to swallow
 * Spring's own MVC exceptions and answer 500 with an ERROR + stack trace for each — so an
 * internet-facing host turned every stray probe into a logged error, and the uptime monitor's own
 * 3-try GET became a permanent red alert plus a log "error storm".
 */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class GlobalExceptionHandlerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void wrongHttpMethodIsMethodNotAllowedRatherThanServerError() throws Exception {
        // /health is public and GET-only, so this reaches the handler without an auth detour.
        mockMvc.perform(post("/health"))
                .andExpect(status().isMethodNotAllowed());
    }

    @Test
    void unreadableBodyIsABadRequestRatherThanServerError() throws Exception {
        mockMvc.perform(post("/erp/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{ this is not json"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void aGenuineRouteStillAnswersNormally() throws Exception {
        mockMvc.perform(get("/health"))
                .andExpect(status().isOk());
    }
}
