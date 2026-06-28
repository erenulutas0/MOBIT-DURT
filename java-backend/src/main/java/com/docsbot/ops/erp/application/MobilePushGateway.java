package com.docsbot.ops.erp.application;

import com.docsbot.ops.erp.domain.ErpMobilePushToken;
import com.docsbot.ops.erp.domain.ErpNotification;

public interface MobilePushGateway {

    boolean configured();

    Result send(ErpMobilePushToken token, ErpNotification notification);

    record Result(Status status, String errorMessage) {
        public static Result delivered() {
            return new Result(Status.DELIVERED, null);
        }

        public static Result retry(String errorMessage) {
            return new Result(Status.RETRY, errorMessage);
        }

        public static Result dead(String errorMessage) {
            return new Result(Status.DEAD, errorMessage);
        }
    }

    enum Status {
        DELIVERED,
        RETRY,
        DEAD
    }
}

