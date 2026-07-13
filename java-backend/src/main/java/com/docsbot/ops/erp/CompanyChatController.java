package com.docsbot.ops.erp;

import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.context.annotation.Profile;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.docsbot.ops.erp.application.CompanyChatService;
import com.docsbot.ops.erp.application.ErpPrincipal;

@RestController
@RequestMapping("/erp/company-chat")
@Profile("postgres")
public class CompanyChatController {

    private final CompanyChatService companyChatService;

    public CompanyChatController(CompanyChatService companyChatService) {
        this.companyChatService = companyChatService;
    }

    @GetMapping("/messages")
    List<ErpDtos.CompanyChatMessageResponse> messages() {
        return companyChatService.listMessages().stream()
                .map(ErpDtos.CompanyChatMessageResponse::from)
                .toList();
    }

    @PostMapping("/messages")
    ErpDtos.CompanyChatMessageResponse sendMessage(
            JwtAuthenticationToken authentication,
            @Valid @RequestBody SendCompanyChatMessageRequest request
    ) {
        return ErpDtos.CompanyChatMessageResponse.from(companyChatService.sendMessage(
                ErpPrincipal.from(authentication),
                request.body()));
    }

    record SendCompanyChatMessageRequest(
            @NotBlank @Size(max = 4_000) String body
    ) {
    }
}
