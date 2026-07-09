package com.docsbot.ops.common.http;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "docsbot.rate-limit.auth-limit=2",
        "docsbot.rate-limit.auth-window-seconds=60"
})
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class RateLimitFilterTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void authEndpointsReturnTooManyRequestsAfterLimitIsExceeded() throws Exception {
        String body = "{\"username\":\"admin\",\"password\":\"wrong-password\"}";

        mockMvc.perform(post("/erp/auth/admin-login")
                        .header("X-Forwarded-For", "203.0.113.10")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("X-RateLimit-Limit", "2"))
                .andExpect(header().string("X-RateLimit-Remaining", "1"));

        mockMvc.perform(post("/erp/auth/admin-login")
                        .header("X-Forwarded-For", "203.0.113.10")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("X-RateLimit-Remaining", "0"));

        mockMvc.perform(post("/erp/auth/admin-login")
                        .header("X-Forwarded-For", "203.0.113.10")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(jsonPath("$.message").value("Çok fazla istek gönderildi. Lütfen kısa süre sonra tekrar deneyin."));
    }

    @Test
    void rateLimitBucketsAreSeparatedByClientIp() throws Exception {
        String body = "{\"username\":\"admin\",\"password\":\"wrong-password\"}";

        mockMvc.perform(post("/erp/auth/admin-login")
                        .header("X-Forwarded-For", "203.0.113.20")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(post("/erp/auth/admin-login")
                        .header("X-Forwarded-For", "203.0.113.21")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isUnauthorized())
                .andExpect(header().string("X-RateLimit-Remaining", "1"));
    }
}
