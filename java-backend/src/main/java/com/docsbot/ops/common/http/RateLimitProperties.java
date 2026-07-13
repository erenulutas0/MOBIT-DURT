package com.docsbot.ops.common.http;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "docsbot.rate-limit")
public class RateLimitProperties {

    private boolean enabled = true;
    /**
     * Number of trusted reverse proxies between this app and the client. The client IP is read
     * as the Nth-from-the-right entry of X-Forwarded-For. Default 0 means the header is NOT
     * trusted at all (use the direct socket address) so a client cannot spoof X-Forwarded-For
     * to dodge rate limiting. Set to 1 when running behind a single reverse proxy (nginx/Caddy).
     */
    private int trustedProxyHops = 0;
    private int authLimit = 120;
    private int authWindowSeconds = 60;
    private int accountRequestLimit = 60;
    private int accountRequestWindowSeconds = 300;
    private int messageLimit = 240;
    private int messageWindowSeconds = 60;
    private int uploadLimit = 60;
    private int uploadWindowSeconds = 300;
    // Deliberately tighter than chat messaging: the assistant runs DB retrieval per call today and
    // will call a paid LLM later, so an unbounded client is a cost/abuse vector.
    private int assistantLimit = 30;
    private int assistantWindowSeconds = 60;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public int getTrustedProxyHops() {
        return trustedProxyHops;
    }

    public void setTrustedProxyHops(int trustedProxyHops) {
        this.trustedProxyHops = trustedProxyHops;
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

    public int getAssistantLimit() {
        return assistantLimit;
    }

    public void setAssistantLimit(int assistantLimit) {
        this.assistantLimit = assistantLimit;
    }

    public int getAssistantWindowSeconds() {
        return assistantWindowSeconds;
    }

    public void setAssistantWindowSeconds(int assistantWindowSeconds) {
        this.assistantWindowSeconds = assistantWindowSeconds;
    }
}
