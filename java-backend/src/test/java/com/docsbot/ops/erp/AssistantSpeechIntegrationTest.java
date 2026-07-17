package com.docsbot.ops.erp;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class AssistantSpeechIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void speechRequiresAuthentication() throws Exception {
        mockMvc.perform(post("/erp/assistant/speech")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"Merhaba\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void speechReturns503WhenSynthesizerIsNotConfigured() throws Exception {
        // No DOCSBOT_TTS_URL in the test environment — the endpoint must degrade loudly (503),
        // not crash, so clients can hide their speech buttons.
        mockMvc.perform(post("/erp/assistant/speech")
                        .header("Authorization", "Bearer " + loginAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"Günaydın, bugün üç göreviniz var.\"}"))
                .andExpect(status().isServiceUnavailable());
    }

    @Test
    void speechRejectsBlankText() throws Exception {
        mockMvc.perform(post("/erp/assistant/speech")
                        .header("Authorization", "Bearer " + loginAdmin())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"text\":\"  \"}"))
                .andExpect(status().isBadRequest());
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
