package com.docsbot.ops.auth;

import java.time.Instant;
import java.util.List;

import com.jayway.jsonpath.JsonPath;
import com.docsbot.ops.auth.infrastructure.ErpAccountRequestRepository;
import com.docsbot.ops.auth.infrastructure.AuthAuditEventRepository;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("postgres")
class AccountFlowIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ErpAccountRequestRepository requestRepository;

    @Autowired
    private ErpUserRepository userRepository;

    @Autowired
    private AuthAuditEventRepository auditRepository;

    @Autowired
    private JwtEncoder jwtEncoder;

    @BeforeEach
    void cleanDatabase() {
        auditRepository.deleteAll();
        requestRepository.deleteAll();
        userRepository.deleteAll();
    }

    @Test
    void accountRequestApprovalAndEmployeeLoginRespectRoleBoundaries() throws Exception {
        long requestId = createAccountRequest("Ayse Demir", "Ayse@Example.com");

        mockMvc.perform(get("/erp/account-requests"))
                .andExpect(status().isUnauthorized())
                .andExpect(header().doesNotExist("WWW-Authenticate"))
                .andExpect(jsonPath("$.error").value("Unauthorized"));

        String adminToken = loginAdmin();
        mockMvc.perform(get("/erp/account-requests")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].id").value(requestId))
                .andExpect(jsonPath("$[0].email").value("ayse@example.com"))
                .andExpect(jsonPath("$[0].status").value("pending"));

        mockMvc.perform(post("/erp/account-requests/{requestId}/approve", requestId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Ayse Demir"))
                .andExpect(jsonPath("$.role").value("employee"))
                .andExpect(jsonPath("$.approved_at").isNotEmpty());

        String employeeToken = loginEmployee("ayse@example.com");
        mockMvc.perform(get("/erp/overview")
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.users.length()").value(1))
                .andExpect(jsonPath("$.users[0].email").value("ayse@example.com"));

        mockMvc.perform(get("/erp/overview")
                        .header("Authorization", bearer(employeeToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.users.length()").value(1))
                .andExpect(jsonPath("$.users[0].email").value("ayse@example.com"))
                .andExpect(jsonPath("$.tasks.length()").value(0));

        mockMvc.perform(get("/erp/account-requests")
                        .header("Authorization", bearer(employeeToken)))
                .andExpect(status().isForbidden());

        mockMvc.perform(post("/erp/account-requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(accountRequestJson("Ayse Again", "ayse@example.com")))
                .andExpect(status().isConflict());
    }

    @Test
    void duplicatePendingRequestIsRejectedCaseInsensitively() throws Exception {
        createAccountRequest("Murat Kaya", "murat@example.com");

        mockMvc.perform(post("/erp/account-requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(accountRequestJson("Murat Kaya", "MURAT@example.com")))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.message").value(
                        "A pending request already exists for this email"));
    }

    @Test
    void rejectedRequestCannotBeApprovedLater() throws Exception {
        long requestId = createAccountRequest("Can Yilmaz", "can@example.com");
        String adminToken = loginAdmin();

        mockMvc.perform(post("/erp/account-requests/{requestId}/reject", requestId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("rejected"));

        mockMvc.perform(post("/erp/account-requests/{requestId}/approve", requestId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isConflict());
    }

    @Test
    void weakPasswordIsRejectedBeforePersistence() throws Exception {
        mockMvc.perform(post("/erp/account-requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "name": "Test User",
                                  "email": "test@example.com",
                                  "password": "short"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.fieldErrors.password").isNotEmpty());
    }

    @Test
    void expiredAndWrongIssuerTokensAreRejected() throws Exception {
        mockMvc.perform(get("/erp/account-requests")
                        .header("Authorization", bearer(customToken(
                                "wrong-issuer",
                                Instant.now().minusSeconds(5),
                                Instant.now().plusSeconds(300)))))
                .andExpect(status().isUnauthorized());

        mockMvc.perform(get("/erp/account-requests")
                        .header("Authorization", bearer(customToken(
                                "docsbot-ops-test",
                                Instant.now().minusSeconds(600),
                                Instant.now().minusSeconds(300)))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void persistsSuccessfulAndFailedAuthenticationAndAccountDecisions() throws Exception {
        mockMvc.perform(post("/erp/auth/admin-login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"admin","password":"wrong-password"}
                                """))
                .andExpect(status().isUnauthorized());

        long approvedRequestId = createAccountRequest("Audit User", "audit@example.com");
        String adminToken = loginAdmin();
        mockMvc.perform(post("/erp/account-requests/{requestId}/approve", approvedRequestId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk());

        mockMvc.perform(post("/erp/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"audit@example.com","password":"wrong-password"}
                                """))
                .andExpect(status().isUnauthorized());
        loginEmployee("audit@example.com");

        long rejectedRequestId = createAccountRequest("Rejected User", "rejected@example.com");
        mockMvc.perform(post("/erp/account-requests/{requestId}/reject", rejectedRequestId)
                        .header("Authorization", bearer(adminToken)))
                .andExpect(status().isOk());

        var events = auditRepository.findAllByOrderByCreatedAtAscIdAsc();
        org.assertj.core.api.Assertions.assertThat(events)
                .extracting(
                        event -> event.getEventType() + ":" + event.getOutcome())
                .contains(
                        "ADMIN_LOGIN:FAILURE",
                        "ADMIN_LOGIN:SUCCESS",
                        "ACCOUNT_REQUEST_APPROVED:SUCCESS",
                        "EMPLOYEE_LOGIN:FAILURE",
                        "EMPLOYEE_LOGIN:SUCCESS",
                        "ACCOUNT_REQUEST_REJECTED:SUCCESS");
        org.assertj.core.api.Assertions.assertThat(events)
                .noneMatch(event -> event.getActor() != null
                        && event.getActor().contains("wrong-password"));
    }

    private long createAccountRequest(String name, String email) throws Exception {
        String response = mockMvc.perform(post("/erp/account-requests")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(accountRequestJson(name, email)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("pending"))
                .andReturn()
                .getResponse()
                .getContentAsString();
        return ((Number) JsonPath.read(response, "$.id")).longValue();
    }

    private String loginAdmin() throws Exception {
        String response = mockMvc.perform(post("/erp/auth/admin-login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"username":"admin","password":"admin123"}
                                """))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return accessToken(response);
    }

    private String loginEmployee(String email) throws Exception {
        String response = mockMvc.perform(post("/erp/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {"email":"%s","password":"StrongPass123!"}
                                """.formatted(email)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.role").value("user"))
                .andExpect(jsonPath("$.user_id").isNumber())
                .andReturn()
                .getResponse()
                .getContentAsString();
        return accessToken(response);
    }

    private String accessToken(String response) throws Exception {
        return JsonPath.read(response, "$.access_token");
    }

    private String accountRequestJson(String name, String email) {
        return """
                {
                  "name": "%s",
                  "email": "%s",
                  "password": "StrongPass123!",
                  "phone": "+905551112233"
                }
                """.formatted(name, email);
    }

    private String bearer(String token) {
        return "Bearer " + token;
    }

    private String customToken(String issuer, Instant issuedAt, Instant expiresAt) {
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer(issuer)
                .subject("security-test")
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .claim("roles", List.of("ADMIN"))
                .build();
        return jwtEncoder.encode(JwtEncoderParameters.from(
                        JwsHeader.with(MacAlgorithm.HS256).build(),
                        claims))
                .getTokenValue();
    }
}
