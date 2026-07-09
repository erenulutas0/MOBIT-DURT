package com.docsbot.ops.common.http;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "docsbot.rate-limit")
public class RateLimitProperties {

    private boolean enabled = true;
    private int authLimit = 120;
    private int authWindowSeconds = 60;
    private int accountRequestLimit = 60;
    private int accountRequestWindowSeconds = 300;
    private int messageLimit = 240;
    private int messageWindowSeconds = 60;
    private int uploadLimit = 60;
    private int uploadWindowSeconds = 300;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public int getAuthLimit() {
        return authLimit;
    }

    public void setAuthLimit(int authLimit) {
        this.authLimit = authLimit;
    }

    public int getAuthWindowSeconds() {
        return authWindowSeconds;
    }

    public void setAuthWindowSeconds(int authWindowSeconds) {
        this.authWindowSeconds = authWindowSeconds;
    }

    public int getAccountRequestLimit() {
        return accountRequestLimit;
    }

    public void setAccountRequestLimit(int accountRequestLimit) {
        this.accountRequestLimit = accountRequestLimit;
    }

    public int getAccountRequestWindowSeconds() {
        return accountRequestWindowSeconds;
    }

    public void setAccountRequestWindowSeconds(int accountRequestWindowSeconds) {
        this.accountRequestWindowSeconds = accountRequestWindowSeconds;
    }

    public int getMessageLimit() {
        return messageLimit;
    }

    public void setMessageLimit(int messageLimit) {
        this.messageLimit = messageLimit;
    }

    public int getMessageWindowSeconds() {
        return messageWindowSeconds;
    }

    public void setMessageWindowSeconds(int messageWindowSeconds) {
        this.messageWindowSeconds = messageWindowSeconds;
    }

    public int getUploadLimit() {
        return uploadLimit;
    }

    public void setUploadLimit(int uploadLimit) {
        this.uploadLimit = uploadLimit;
    }

    public int getUploadWindowSeconds() {
        return uploadWindowSeconds;
    }

    public void setUploadWindowSeconds(int uploadWindowSeconds) {
        this.uploadWindowSeconds = uploadWindowSeconds;
    }
}
