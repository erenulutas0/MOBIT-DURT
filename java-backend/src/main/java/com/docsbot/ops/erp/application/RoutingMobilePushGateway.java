package com.docsbot.ops.erp.application;

import java.util.Locale;

import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.docsbot.ops.erp.domain.ErpMobilePushToken;
import com.docsbot.ops.erp.domain.ErpNotification;

@Primary
@Service
@Profile("postgres")
public class RoutingMobilePushGateway implements MobilePushGateway {
    private final FcmMobilePushGateway fcmGateway;
    private final ApnsMobilePushGateway apnsGateway;

    public RoutingMobilePushGateway(FcmMobilePushGateway fcmGateway, ApnsMobilePushGateway apnsGateway) {
        this.fcmGateway = fcmGateway;
        this.apnsGateway = apnsGateway;
    }

    @Override
    public boolean configured() {
        return fcmGateway.configured() || apnsGateway.configured();
    }

    @Override
    public Result send(ErpMobilePushToken token, ErpNotification notification) {
        String platform = token.getPlatform() == null ? "" : token.getPlatform().toLowerCase(Locale.ROOT);
        return switch (platform) {
            case "android" -> fcmGateway.send(token, notification);
            case "ios" -> apnsGateway.send(token, notification);
            default -> Result.dead("Unsupported mobile push platform: " + platform);
        };
    }
}
