package com.docsbot.ops.erp;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.docsbot.ops.erp.application.ErpPrincipal;
import com.docsbot.ops.erp.application.MobilePushService;
import com.docsbot.ops.erp.domain.ErpMobilePushToken;
import com.fasterxml.jackson.annotation.JsonProperty;

@RestController
@RequestMapping("/erp/mobile-push")
@Profile("postgres")
public class MobilePushController {

    private final MobilePushService mobilePushService;

    public MobilePushController(MobilePushService mobilePushService) {
        this.mobilePushService = mobilePushService;
    }

    @PostMapping("/tokens")
    MobilePushTokenResponse register(
            JwtAuthenticationToken authentication,
            @Valid @RequestBody MobilePushTokenRequest request
    ) {
        return MobilePushTokenResponse.from(mobilePushService.register(
                ErpPrincipal.from(authentication),
                request.platform(),
                request.deviceId(),
                request.token(),
                request.appVersion()));
    }

    @DeleteMapping("/tokens")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void unregister(
            JwtAuthenticationToken authentication,
            @Valid @RequestBody DeleteMobilePushTokenRequest request
    ) {
        mobilePushService.unregister(
                ErpPrincipal.from(authentication),
                request.platform(),
                request.deviceId());
    }

    record MobilePushTokenRequest(
            @NotBlank @Size(max = 32) String platform,
            @NotBlank @Size(max = 128) @JsonProperty("device_id") String deviceId,
            @NotBlank @Size(max = 4096) String token,
            @Size(max = 64) @JsonProperty("app_version") String appVersion
    ) {
    }

    record DeleteMobilePushTokenRequest(
            @NotBlank @Size(max = 32) String platform,
            @NotBlank @Size(max = 128) @JsonProperty("device_id") String deviceId
    ) {
    }

    record MobilePushTokenResponse(
            long id,
            @JsonProperty("user_id") long userId,
            String platform,
            @JsonProperty("device_id") String deviceId,
            boolean active
    ) {
        static MobilePushTokenResponse from(ErpMobilePushToken token) {
            return new MobilePushTokenResponse(
                    token.getId(),
                    token.getUserId(),
                    token.getPlatform(),
                    token.getDeviceId(),
                    token.isActive());
        }
    }
}
