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
import com.docsbot.ops.bulletin.domain.TenderResult;
import com.docsbot.ops.bulletin.infrastructure.TenderNoticeRepository;
import com.docsbot.ops.bulletin.infrastructure.TenderResultRepository;

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
    private final TenderResultRepository resultRepository = mock(TenderResultRepository.class);
    private final TenderWatchService watchService = mock(TenderWatchService.class);
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
                repository, resultRepository, watchService, objectMapper, baseUrl, enabled, 120,
                Clock.fixed(NOW, ZoneOffset.UTC));
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
        new BulletinIngestService(repository, resultRepository, watchService, objectMapper, baseUrl, true, 0,
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


    private static final String RESULT = """
            {"ikn":"2026/951756","kind":"sonuc",
             "title":"Açık stok alanlarının yapılması işi",
             "authority":"TCDD 3. BÖLGE MÜDÜRLÜĞÜ","work_place":"Aliağa İstasyonu",
             "province":"İzmir","procedure":"Açık","tender_date":"30.06.2026",
             "contract_date":"07.08.2026","estimated_cost":"82368000.00",
             "estimated_currency":"TRY","contract_amount":"54524045.00",
             "contract_currency":"TRY","bid_count":"45","valid_bid_count":"31",
             "winner":"Tavsun Enerji A.Ş.","winner_address":"Yenişehir/Diyarbakır",
             "winner_province":"Diyarbakır","text":"1- İhalenin ..."}""";

    /** Same tender, second lot: one İKN, one estimate, a different contract. */
    private static final String RESULT_SECOND_LOT = """
            {"ikn":"2026/951756","kind":"sonuc",
             "title":"Açık stok alanlarının yapılması işi",
             "authority":"TCDD 3. BÖLGE MÜDÜRLÜĞÜ","province":"İzmir",
             "estimated_cost":"82368000.00","estimated_currency":"TRY",
             "contract_amount":"1250000.00","contract_currency":"TRY",
             "winner":"Başka İnşaat Ltd.","text":"1- İhalenin ..."}""";

    @Test
    void storesTheAwardedContractBesideTheAnnouncements() {
        response = results("BULTEN_07082026_YAPIM.pdf", RESULT, NOTICE);

        service(true).ingest("yapim");

        ArgumentCaptor<TenderResult> saved = ArgumentCaptor.forClass(TenderResult.class);
        verify(resultRepository).save(saved.capture());
        TenderResult result = saved.getValue();
        assertThat(result.getIkn()).isEqualTo("2026/951756");
        assertThat(result.getWinner()).isEqualTo("Tavsun Enerji A.Ş.");
        assertThat(result.getContractAmount()).isEqualByComparingTo("54524045.00");
        assertThat(result.getBidCount()).isEqualTo(45);
        // Where the work is, not where the winner is registered.
        assertThat(result.getProvince()).isEqualTo("İzmir");
        assertThat(result.getWinnerProvince()).isEqualTo("Diyarbakır");
        // 54.524.045 against an 82.368.000 estimate.
        assertThat(result.discountPercent()).isEqualByComparingTo("33.8");
    }

    @Test
    void aSecondContractUnderOneIknMarksTheWholeTenderPartial() {
        when(resultRepository.findByIkn("2026/951756"))
                .thenReturn(List.of(mock(TenderResult.class)));
        response = results("BULTEN_07082026_YAPIM.pdf", RESULT_SECOND_LOT);

        service(true).ingest("yapim");

        ArgumentCaptor<TenderResult> saved = ArgumentCaptor.forClass(TenderResult.class);
        verify(resultRepository).save(saved.capture());
        // The estimate covers the whole tender and the amount covers one lot. Reported as a
        // discount that is a 98% saving, which is nonsense and would teach people to distrust the
        // number on the days it is real.
        assertThat(saved.getValue().discountPercent()).isNull();
        // And the row stored earlier, which looked whole because it was alone, is corrected too.
        verify(resultRepository).markPartialByIkn("2026/951756");
    }

    @Test
    void aBrokenResultDoesNotCostTheAnnouncements() {
        response = results("BULTEN_07082026_YAPIM.pdf", "{\"kind\":\"sonuc\"}", NOTICE);

        // No İKN, so nothing to store it under — and the day's announcements still land.
        assertThat(service(true).ingest("yapim")).isEqualTo(1);
        verify(resultRepository, never()).save(any());
    }

    private static String payload(String source, String... notices) {
        return results(source, "", notices);
    }

    private static String results(String source, String results, String... notices) {
        return "{\"ok\":true,\"source\":\"" + source + "\",\"count\":" + notices.length
                + ",\"notices\":[" + String.join(",", notices) + "]"
                + ",\"results\":[" + results + "]}";
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
