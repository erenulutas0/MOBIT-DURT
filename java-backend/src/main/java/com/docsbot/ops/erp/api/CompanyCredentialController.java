package com.docsbot.ops.erp.api;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.context.annotation.Profile;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.docsbot.ops.erp.application.CompanyCredentialService;
import com.docsbot.ops.erp.application.ErpPrincipal;
import com.docsbot.ops.erp.domain.CompanyCredential;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * The company's own expiring paperwork. Admin-only, like everything else about the document
 * archive: these dates decide whether a bid can be submitted at all.
 */
@RestController
@RequestMapping("/erp/company-credentials")
@Profile("postgres")
public class CompanyCredentialController {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Europe/Istanbul");

    private final CompanyCredentialService service;

    public CompanyCredentialController(CompanyCredentialService service) {
        this.service = service;
    }

    @GetMapping
    List<CredentialResponse> list(JwtAuthenticationToken authentication) {
        ErpPrincipal.from(authentication);
        LocalDate today = LocalDate.now(BUSINESS_ZONE);
        return service.all().stream().map(credential -> CredentialResponse.from(credential, today)).toList();
    }

    @PostMapping
    CredentialResponse create(JwtAuthenticationToken authentication, @Valid @RequestBody CredentialRequest request) {
        ErpPrincipal.from(authentication);
        return CredentialResponse.from(
                service.create(request.name(), request.kind(), request.issuedAt(),
                        request.validUntil(), request.documentId(), request.note()),
                LocalDate.now(BUSINESS_ZONE));
    }

    @PutMapping("/{id}")
    CredentialResponse update(
            JwtAuthenticationToken authentication,
            @PathVariable long id,
            @Valid @RequestBody CredentialRequest request
    ) {
        ErpPrincipal.from(authentication);
        return CredentialResponse.from(
                service.update(id, request.name(), request.kind(), request.issuedAt(),
                        request.validUntil(), request.documentId(), request.note()),
                LocalDate.now(BUSINESS_ZONE));
    }

    @DeleteMapping("/{id}")
    void delete(JwtAuthenticationToken authentication, @PathVariable long id) {
        ErpPrincipal.from(authentication);
        service.delete(id);
    }

    record CredentialRequest(
            @NotBlank @Size(max = 200) String name,
            @Size(max = 80) String kind,
            @JsonProperty("issued_at") LocalDate issuedAt,
            @JsonProperty("valid_until") LocalDate validUntil,
            @JsonProperty("document_id") Long documentId,
            String note
    ) {
    }

    record CredentialResponse(
            long id,
            String name,
            String kind,
            @JsonProperty("issued_at") LocalDate issuedAt,
            @JsonProperty("valid_until") LocalDate validUntil,
            @JsonProperty("document_id") Long documentId,
            String note,
            /** Negative once lapsed; null when the document has no expiry, which is not urgency. */
            @JsonProperty("days_remaining") Long daysRemaining
    ) {
        static CredentialResponse from(CompanyCredential credential, LocalDate today) {
            return new CredentialResponse(
                    credential.getId(),
                    credential.getName(),
                    credential.getKind(),
                    credential.getIssuedAt(),
                    credential.getValidUntil(),
                    credential.getDocumentId(),
                    credential.getNote(),
                    credential.daysRemaining(today));
        }
    }
}
