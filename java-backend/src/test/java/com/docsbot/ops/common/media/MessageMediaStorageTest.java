package com.docsbot.ops.common.media;

import java.nio.file.Path;
import java.util.Base64;

import com.docsbot.ops.common.config.DocsBotProperties;
import com.docsbot.ops.erp.application.ErpExceptions;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MessageMediaStorageTest {

    @TempDir
    Path dataDir;

    private MessageMediaStorage storage() {
        DocsBotProperties properties = mock(DocsBotProperties.class);
        when(properties.dataDir()).thenReturn(dataDir.toString());
        when(properties.maxFileSizeBytes()).thenReturn(26_214_400L);
        return new MessageMediaStorage(properties);
    }

    private static String dataUrl(String mimeType, String text) {
        return "data:" + mimeType + ";base64," + Base64.getEncoder().encodeToString(text.getBytes());
    }

    @Test
    void onlyKnownSafeTypesAreServedInline() {
        assertThat(MessageMediaStorage.isInlineSafe("image/png")).isTrue();
        assertThat(MessageMediaStorage.isInlineSafe("application/pdf")).isTrue();
        assertThat(MessageMediaStorage.isInlineSafe("audio/webm")).isTrue();
        // Active-content types are never inline-safe.
        assertThat(MessageMediaStorage.isInlineSafe("image/svg+xml")).isFalse();
        assertThat(MessageMediaStorage.isInlineSafe("text/html")).isFalse();
        assertThat(MessageMediaStorage.isInlineSafe("application/octet-stream")).isFalse();
        assertThat(MessageMediaStorage.isInlineSafe(null)).isFalse();
    }

    @Test
    void rejectsSvgAndHtmlMediaAtStorage() {
        MessageMediaStorage storage = storage();
        // SVG can carry script — not a valid image message.
        assertThatThrownBy(() -> storage.storeDataUrl(
                "direct", "image", dataUrl("image/svg+xml", "<svg onload=alert(1)>"), "image/svg+xml"))
                .isInstanceOf(ErpExceptions.BadRequest.class);
        // HTML as a "file" message would execute if ever rendered — rejected.
        assertThatThrownBy(() -> storage.storeDataUrl(
                "direct", "file", dataUrl("text/html", "<script>alert(1)</script>"), "text/html"))
                .isInstanceOf(ErpExceptions.BadRequest.class);
    }

    @Test
    void acceptsRasterImageAndPdfFile() {
        MessageMediaStorage storage = storage();
        String pngRef = storage.storeDataUrl("direct", "image", dataUrl("image/png", "not-really-png-but-fine"), "image/png");
        assertThat(pngRef).startsWith("media:direct/");
        String pdfRef = storage.storeDataUrl("direct", "file", dataUrl("application/pdf", "%PDF-1.4"), "application/pdf");
        assertThat(pdfRef).startsWith("media:direct/");
    }

    @Test
    void deleteReferenceRemovesTheBackingFileAndIsNoOpForInlineOrNull() {
        MessageMediaStorage storage = storage();
        String ref = storage.storeDataUrl("direct", "image", dataUrl("image/png", "bytes"), "image/png");
        assertThat(storage.reference(ref)).isEqualTo(ref); // exists / readable

        storage.deleteReference(ref);
        // The file is gone: reference() now fails its readable check.
        assertThatThrownBy(() -> storage.reference(ref)).isInstanceOf(ErpExceptions.BadRequest.class);

        // No-ops (never throw) for non-reference / null inputs.
        storage.deleteReference("data:image/png;base64,AAAA");
        storage.deleteReference(null);
        storage.deleteReference(ref); // second delete is harmless
    }
}
