package com.docsbot.ops.bulletin;

import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.docsbot.ops.bulletin.domain.TenderNotice;
import com.docsbot.ops.bulletin.infrastructure.TenderNoticeRepository;

import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * The bulletin is pulled every weekday from somebody else's website, which makes the interesting
 * properties the unglamorous ones: running twice must not double the corpus, a bulletin that fails
 * to download must not take the other three with it, and a page that changed shape must be loud
 * rather than quietly producing a day with no tenders in it.
 */
class BulletinIngestServiceTest {

    private static final Instant NOW = Instant.parse("2026-08-09T06:00:00Z");

    private HttpServer server;
    private String baseUrl;
    private final AtomicInteger calls = new AtomicInteger();
    private final List<String> requestedPaths = new ArrayList<>();
    private volatile String response = payload("BULTEN_07082026_YAPIM.pdf", NOTICE);
    private volatile int status = 200;

    private final TenderNoticeRepository repository = mock(TenderNoticeRepository.class);
    private final ObjectMapper objectMapper = new ObjectMapper();

    private static final String NOTICE = """
            {"ikn":"2026/1434625","kind":"ilan","section":"YAPIM İŞLERİ İHALE İLANLARI",
             "authority":"Siirt İl Özel İdaresi","address":"Bahçelievler Mah. Siirt Merkez/Siirt",
             "province":"Siirt","tender_at":"26.08.2026 - 10:00",
             "title":"Köy yolu asfalt yapım işi","quantity":"12 km","delivery_place":"Siirt",
             "text":"1. İdarenin adı: Siirt İl Özel İdaresi ..."}""";

    @BeforeEach
    void startStub() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/bulletin", exchange -> {
            calls.incrementAndGet();
            requestedPaths.add(exchange.getRequestURI().getPath());
            respond(exchange, status, response);
        });
        server.start();
        baseUrl = "http://127.0.0.1:" + server.getAddress().getPort();
    }

    @AfterEach
    void stopStub() {
        server.stop(0);
    }

    private BulletinIngestService service(boolean enabled) {
        return new BulletinIngestService(
                repository, objectMapper, baseUrl, enabled, 120, Clock.fixed(NOW, ZoneOffset.UTC));
    }

    @Test
    void storesAnAnnouncementWithItsProvinceAndTenderDate() {
        assertThat(service(true).ingest("yapim")).isEqualTo(1);

        ArgumentCaptor<TenderNotice> saved = ArgumentCaptor.forClass(TenderNotice.class);
        verify(repository).save(saved.capture());
        TenderNotice notice = saved.getValue();
        assertThat(notice.getIkn()).isEqualTo("2026/1434625");
        assertThat(notice.getProvince()).isEqualTo("Siirt");
        assertThat(notice.getBulletinType()).isEqualTo("yapim");
        assertThat(notice.isLiveTender()).isTrue();
        // 10:00 in Istanbul, which is 07:00 UTC — stored as an instant so "still open" is a
        // comparison and not a string.
        assertThat(notice.getTenderAt()).isEqualTo(Instant.parse("2026-08-26T07:00:00Z"));
        assertThat(notice.getBody()).contains("Siirt İl Özel İdaresi");
    }

    @Test
    void takesTheBulletinsOwnDateFromTheArchiveNameRatherThanFromToday() {
        service(true).ingest("yapim");

        ArgumentCaptor<TenderNotice> saved = ArgumentCaptor.forClass(TenderNotice.class);
        verify(repository).save(saved.capture());
        // The file is BULTEN_07082026_YAPIM.pdf and today is the 9th: dating it today would make
        // every re-run look like a new bulletin and store the same tenders again.
        assertThat(saved.getValue().getBulletinDate()).isEqualTo(LocalDate.of(2026, 8, 7));
    }

    @Test
    void runningTwiceDoesNotStoreTheSameAnnouncementTwice() {
        when(repository.existsByIknAndKindAndBulletinDateAndBulletinType(
                eq("2026/1434625"), eq("ilan"), any(), eq("yapim"))).thenReturn(true);

        assertThat(service(true).ingest("yapim")).isZero();
        verify(repository, never()).save(any());
    }

    @Test
    void aBulletinThatFailedToDownloadIsReportedRatherThanReadAsAQuietDay() {
        response = "{\"ok\":false,\"error\":\"arşivde ilan bülteni bulunamadı\",\"notices\":[]}";

        // "Their page changed" and "there were no tenders today" are the same number of rows and
        // very different problems; only one of them needs somebody to look at it.
        assertThat(catchIngest("yapim")).contains("arşivde ilan bülteni bulunamadı");
    }

    @Test
    void oneBulletinFailingStillLeavesTheOtherThree() {
        // The four are independent documents. Losing yapım must not cost mal, hizmet and
        // danışmanlık as well: three quarters of the day's tenders beats none of them.
        server.removeContext("/bulletin");
        server.createContext("/bulletin", exchange -> {
            calls.incrementAndGet();
            boolean broken = exchange.getRequestURI().getPath().endsWith("/yapim");
            respond(exchange, broken ? 500 : 200, broken ? "kaput" : response);
        });

        assertThat(service(true).ingestAll()).isEqualTo(3);
        assertThat(calls.get()).isEqualTo(4);
    }

    @Test
    void theDateIsReadWhetherOrNotTheBulletinPrintedADash() {
        // The danışmanlık bulletin writes "24.08.2026 10:00" where the other three write
        // "24.08.2026 - 10:00". Both are the same moment and neither is a typo worth losing a
        // tender's deadline over.
        response = payload("BULTEN_07082026_DANISMANLIK.pdf",
                NOTICE.replace("\"26.08.2026 - 10:00\"", "\"26.08.2026 10:00\""));

        service(true).ingest("danismanlik");
        ArgumentCaptor<TenderNotice> saved = ArgumentCaptor.forClass(TenderNotice.class);
        verify(repository).save(saved.capture());
        assertThat(saved.getValue().getTenderAt()).isEqualTo(Instant.parse("2026-08-26T07:00:00Z"));
    }

    @Test
    void anAnnouncementWithNoParseableDateIsStillKept() {
        response = payload("BULTEN_07082026_YAPIM.pdf",
                NOTICE.replace("\"26.08.2026 - 10:00\"", "\"belirtilmemiştir\""));

        assertThat(service(true).ingest("yapim")).isEqualTo(1);
        ArgumentCaptor<TenderNotice> saved = ArgumentCaptor.forClass(TenderNotice.class);
        verify(repository).save(saved.capture());
        // A date nobody can parse costs sorting, not the record: the text still says what the
        // tender is, and the printed form is kept so a human can read what the machine could not.
        assertThat(saved.getValue().getTenderAt()).isNull();
        assertThat(saved.getValue().getTenderAtText()).isEqualTo("belirtilmemiştir");
    }

    @Test
    void anAnnouncementWithNoProvinceIsStoredWithoutOneRatherThanWithAnEmptyString() {
        response = payload("BULTEN_07082026_YAPIM.pdf",
                NOTICE.replace("\"province\":\"Siirt\"", "\"province\":\"\""));

        service(true).ingest("yapim");
        ArgumentCaptor<TenderNotice> saved = ArgumentCaptor.forClass(TenderNotice.class);
        verify(repository).save(saved.capture());
        // The map counts provinces with a GROUP BY; an empty string would become a province of its
        // own and draw a column for a place that does not exist.
        assertThat(saved.getValue().getProvince()).isNull();
    }

    @Test
    void allFourBulletinsAreAskedFor() {
        service(true).ingestAll();

        assertThat(requestedPaths).containsExactly(
                "/bulletin/mal", "/bulletin/yapim", "/bulletin/hizmet", "/bulletin/danismanlik");
    }

    @Test
    void oldBulletinsArePrunedFromTheDateTheyWerePublished() {
        service(true).purgeOld();

        // Three hundred announcements a day arrive with their whole printed text; left alone this
        // is the table that fills the disk. 120 days back from 9 August is 11 April.
        verify(repository).deleteOlderThan(LocalDate.of(2026, 4, 11));
    }

    @Test
    void aRetentionWindowOfZeroKeepsEverything() {
        new BulletinIngestService(repository, objectMapper, baseUrl, true, 0,
                Clock.fixed(NOW, ZoneOffset.UTC)).purgeOld();

        verify(repository, never()).deleteOlderThan(any());
    }

    @Test
    void switchingItOffDoesNotTouchTheirSite() {
        assertThat(service(false).ingestAll()).isZero();
        assertThat(calls.get()).isZero();
    }

    @Test
    void speaksHttp11BecauseTheSidecarIsUvicorn() {
        // Third time in this codebase. Java's client defaults to HTTP/2, and over plaintext that
        // opens with "Upgrade: h2c", which uvicorn answers by serving the request with an empty
        // body. Nothing here needs HTTP/2 and the trap is invisible until every request is empty.
        assertThat(service(true).protocolVersion()).isEqualTo(java.net.http.HttpClient.Version.HTTP_1_1);
    }

    private String catchIngest(String type) {
        try {
            service(true).ingest(type);
            return "";
        } catch (RuntimeException exception) {
            return String.valueOf(exception.getMessage());
        }
    }

    private static String payload(String source, String... notices) {
        return "{\"ok\":true,\"source\":\"" + source + "\",\"count\":" + notices.length
                + ",\"notices\":[" + String.join(",", notices) + "]}";
    }

    private static void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().add("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        try (OutputStream output = exchange.getResponseBody()) {
            output.write(bytes);
        }
    }
}
