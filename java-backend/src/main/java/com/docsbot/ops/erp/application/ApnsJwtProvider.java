package com.docsbot.ops.erp.application;

import java.io.IOException;
import java.math.BigInteger;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.docsbot.ops.common.config.DocsBotProperties;

import tools.jackson.databind.ObjectMapper;

@Service
@Profile("postgres")
public class ApnsJwtProvider {
    private static final Duration TOKEN_TTL = Duration.ofMinutes(50);
    private static final int ECDSA_SIGNATURE_BYTES = 64;

    private final DocsBotProperties properties;
    private final ObjectMapper objectMapper;
    private final Clock clock;
    private volatile CachedToken cachedToken;

    @Autowired
    public ApnsJwtProvider(DocsBotProperties properties, ObjectMapper objectMapper) {
        this(properties, objectMapper, Clock.systemUTC());
    }

    ApnsJwtProvider(DocsBotProperties properties, ObjectMapper objectMapper, Clock clock) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.clock = clock;
    }

    public boolean configured() {
        DocsBotProperties.MobilePush mobilePush = mobilePush();
        return mobilePush != null && mobilePush.apnsConfigured();
    }

    public String token() {
        DocsBotProperties.MobilePush mobilePush = mobilePush();
        if (mobilePush == null || !mobilePush.apnsConfigured()) {
            throw new IllegalStateException("APNs credentials are not configured");
        }

        CachedToken current = cachedToken;
        Instant now = clock.instant();
        if (current != null && current.expiresAt().isAfter(now)) {
            return current.value();
        }
        synchronized (this) {
            current = cachedToken;
            now = clock.instant();
            if (current != null && current.expiresAt().isAfter(now)) {
                return current.value();
            }
            String jwt = jwt(mobilePush, now);
            cachedToken = new CachedToken(jwt, now.plus(TOKEN_TTL));
            return jwt;
        }
    }

    private String jwt(DocsBotProperties.MobilePush mobilePush, Instant now) {
        try {
            String header = objectMapper.writeValueAsString(Map.of(
                    "alg", "ES256",
                    "kid", mobilePush.apnsKeyId()));
            String claims = objectMapper.writeValueAsString(Map.of(
                    "iss", mobilePush.apnsTeamId(),
                    "iat", now.getEpochSecond()));
            String signingInput = base64Url(header.getBytes(StandardCharsets.UTF_8))
                    + "."
                    + base64Url(claims.getBytes(StandardCharsets.UTF_8));

            Signature signature = Signature.getInstance("SHA256withECDSA");
            signature.initSign(privateKey(mobilePush));
            signature.update(signingInput.getBytes(StandardCharsets.UTF_8));
            return signingInput + "." + base64Url(derToJose(signature.sign()));
        } catch (Exception exception) {
            throw new IllegalStateException("APNs JWT could not be signed", exception);
        }
    }

    private PrivateKey privateKey(DocsBotProperties.MobilePush mobilePush) throws Exception {
        String pem = mobilePush.apnsPrivateKey();
        if (blank(pem) && !blank(mobilePush.apnsPrivateKeyPath())) {
            try {
                pem = Files.readString(Path.of(mobilePush.apnsPrivateKeyPath()), StandardCharsets.UTF_8);
            } catch (IOException exception) {
                throw new IllegalStateException("APNs private key file could not be read", exception);
            }
        }
        if (blank(pem)) {
            throw new IllegalStateException("APNs private key is not configured");
        }
        String stripped = pem
                .replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replaceAll("\\s", "");
        byte[] decoded = Base64.getDecoder().decode(stripped);
        return KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(decoded));
    }

    private byte[] derToJose(byte[] der) {
        int[] offset = {0};
        expect(der, offset, 0x30);
        readLength(der, offset);
        expect(der, offset, 0x02);
        byte[] r = readBytes(der, offset, readLength(der, offset));
        expect(der, offset, 0x02);
        byte[] s = readBytes(der, offset, readLength(der, offset));

        byte[] jose = new byte[ECDSA_SIGNATURE_BYTES];
        copyFixed(new BigInteger(r), jose, 0);
        copyFixed(new BigInteger(s), jose, 32);
        return jose;
    }

    private void copyFixed(BigInteger integer, byte[] target, int offset) {
        byte[] source = integer.toByteArray();
        int sourceOffset = source.length > 32 && source[0] == 0 ? 1 : 0;
        int sourceLength = source.length - sourceOffset;
        if (sourceLength > 32) {
            throw new IllegalArgumentException("ECDSA signature component is too long");
        }
        System.arraycopy(source, sourceOffset, target, offset + 32 - sourceLength, sourceLength);
    }

    private void expect(byte[] der, int[] offset, int expected) {
        if (offset[0] >= der.length || (der[offset[0]++] & 0xff) != expected) {
            throw new IllegalArgumentException("Invalid ECDSA signature encoding");
        }
    }

    private int readLength(byte[] der, int[] offset) {
        if (offset[0] >= der.length) {
            throw new IllegalArgumentException("Invalid ECDSA signature length");
        }
        int length = der[offset[0]++] & 0xff;
        if ((length & 0x80) == 0) {
            return length;
        }
        int byteCount = length & 0x7f;
        int value = 0;
        for (int i = 0; i < byteCount; i++) {
            if (offset[0] >= der.length) {
                throw new IllegalArgumentException("Invalid ECDSA signature length");
            }
            value = (value << 8) | (der[offset[0]++] & 0xff);
        }
        return value;
    }

    private byte[] readBytes(byte[] der, int[] offset, int length) {
        if (length < 0 || offset[0] + length > der.length) {
            throw new IllegalArgumentException("Invalid ECDSA signature component");
        }
        byte[] bytes = new byte[length];
        System.arraycopy(der, offset[0], bytes, 0, length);
        offset[0] += length;
        return bytes;
    }

    private String base64Url(byte[] value) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
    }

    private DocsBotProperties.MobilePush mobilePush() {
        return properties.mobilePush();
    }

    private boolean blank(String value) {
        return value == null || value.isBlank();
    }

    private record CachedToken(String value, Instant expiresAt) {
    }
}
