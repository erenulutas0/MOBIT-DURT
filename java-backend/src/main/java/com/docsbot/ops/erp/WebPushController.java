package com.docsbot.ops.erp;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.docsbot.ops.erp.application.ErpPrincipal;
import com.docsbot.ops.erp.application.WebPushService;
import com.docsbot.ops.erp.domain.ErpPushSubscription;
import com.fasterxml.jackson.annotation.JsonProperty;

@RestController
@RequestMapping("/erp/web-push")
@Profile("postgres")
public class WebPushController {

    private final WebPushService webPushService;

    public WebPushController(WebPushService webPushService) {
        this.webPushService = webPushService;
    }

    @GetMapping("/vapid-public-key")
    VapidPublicKeyResponse vapidPublicKey() {
        return new VapidPublicKeyResponse(webPushService.configured(), webPushService.publicKey());
    }

    @PostMapping("/subscriptions")
    PushSubscriptionResponse subscribe(
            JwtAuthenticationToken authentication,
            @Valid @RequestBody PushSubscriptionRequest request
    ) {
        ErpPushSubscription subscription = webPushService.subscribe(
                ErpPrincipal.from(authentication),
                request.endpoint(),
                request.keys().p256dh(),
                request.keys().auth(),
                request.userAgent());
        return PushSubscriptionResponse.from(subscription);
    }

    @DeleteMapping("/subscriptions")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void unsubscribe(
            JwtAuthenticationToken authentication,
            @Valid @RequestBody DeletePushSubscriptionRequest request
    ) {
        webPushService.unsubscribe(ErpPrincipal.from(authentication), request.endpoint());
    }

    record VapidPublicKeyResponse(
            boolean enabled,
            @JsonProperty("public_key") String publicKey
    ) {
    }

    record PushSubscriptionRequest(
            @NotBlank String endpoint,
            @Valid PushSubscriptionKeys keys,
            @JsonProperty("user_agent") String userAgent
    ) {
    }

    record DeletePushSubscriptionRequest(@NotBlank String endpoint) {
    }

    record PushSubscriptionKeys(
            @NotBlank String p256dh,
            @NotBlank String auth
    ) {
    }

    record PushSubscriptionResponse(
            long id,
            @JsonProperty("user_id") long userId,
            String endpoint,
            boolean active
    ) {
        static PushSubscriptionResponse from(ErpPushSubscription subscription) {
            return new PushSubscriptionResponse(
                    subscription.getId(),
                    subscription.getUserId(),
                    subscription.getEndpoint(),
                    subscription.isActive());
        }
    }
}
