package com.docsbot.ops.bulletin;

import java.time.Instant;
import java.util.List;
import java.util.Map;

import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.docsbot.ops.bulletin.domain.TenderCategory;
import com.docsbot.ops.bulletin.domain.TenderNotice;
import com.docsbot.ops.bulletin.domain.TenderWatchProfile;
import com.docsbot.ops.bulletin.infrastructure.TenderNoticeRepository;
import com.docsbot.ops.erp.application.ErpPrincipal;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Published tenders: what is open, and where in the country it is.
 *
 * <p>Only live announcements are served. Cancellations are stored — a tender that was withdrawn is
 * worth knowing about when it reappears — but they are never offered as something to bid on.
 */
@RestController
@RequestMapping("/erp/bulletin")
@Profile("postgres")
public class BulletinController {

    private final TenderNoticeRepository repository;
    private final BulletinIngestService ingestService;
    private final TenderWatchService watchService;

    public BulletinController(TenderNoticeRepository repository, BulletinIngestService ingestService,
                              TenderWatchService watchService) {
        this.repository = repository;
        this.ingestService = ingestService;
        this.watchService = watchService;
    }

    @GetMapping("/notices")
    List<NoticeResponse> notices(
            JwtAuthenticationToken authentication,
            @RequestParam(name = "province", required = false) String province,
            @RequestParam(name = "category", required = false) String category,
            @RequestParam(name = "type", required = false) String bulletinType,
            @RequestParam(name = "mine", defaultValue = "false") boolean mineOnly,
            @RequestParam(name = "limit", defaultValue = "50") int limit
    ) {
        ErpPrincipal.from(authentication);
        List<TenderNotice> open = repository.findOpen(Instant.now(), blankToNull(province),
                blankToNull(category), blankToNull(bulletinType));
        // The profile narrows on top of whatever the chips already narrowed, rather than replacing
        // it: "our line of work, in this province" is the question, not one or the other.
        if (mineOnly) {
            open = watchService.matching(open, watchService.profile());
        }
        return open.stream()
                .limit(Math.max(1, Math.min(limit, 200)))
                .map(NoticeResponse::from)
                .toList();
    }

    /** What the company watches for. Readable by everyone; only an admin decides it. */
    @GetMapping("/profile")
    ProfileResponse profile(JwtAuthenticationToken authentication) {
        ErpPrincipal.from(authentication);
        return ProfileResponse.from(watchService.profile(),
                watchService.matching(repository.findOpen(Instant.now(), null, null, null),
                        watchService.profile()).size());
    }

    @PutMapping("/profile")
    ProfileResponse saveProfile(JwtAuthenticationToken authentication, @RequestBody ProfileRequest request) {
        ErpPrincipal principal = ErpPrincipal.from(authentication);
        TenderWatchProfile saved = watchService.save(
                request.categories(), request.provinces(),
                request.notifyDaily() == null || request.notifyDaily(),
                principal.displayName());
        return ProfileResponse.from(saved,
                watchService.matching(repository.findOpen(Instant.now(), null, null, null), saved).size());
    }

    record ProfileRequest(
            List<String> categories,
            List<String> provinces,
            @JsonProperty("notify_daily") Boolean notifyDaily
    ) {
    }

    record ProfileResponse(
            List<String> categories,
            List<String> provinces,
            @JsonProperty("notify_daily") boolean notifyDaily,
            /** How many of today's open announcements this profile keeps — the form's own feedback. */
            @JsonProperty("matching_count") int matchingCount,
            @JsonProperty("updated_by") String updatedBy,
            @JsonProperty("updated_at") Instant updatedAt
    ) {
        static ProfileResponse from(TenderWatchProfile profile, int matchingCount) {
            if (profile == null) {
                return new ProfileResponse(List.of(), List.of(), false, matchingCount, null, null);
            }
            return new ProfileResponse(
                    profile.categoryCodes(), profile.provinceNames(), profile.isNotifyDaily(),
                    matchingCount, profile.getUpdatedBy(), profile.getUpdatedAt());
        }
    }

    /** One announcement in full — the text a user reads before deciding to bid. */
    @GetMapping("/notices/{id}")
    NoticeDetailResponse notice(JwtAuthenticationToken authentication, @PathVariable long id) {
        ErpPrincipal.from(authentication);
        TenderNotice notice = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "İlan bulunamadı"));
        return new NoticeDetailResponse(
                NoticeResponse.from(notice), notice.getBody(), notice.getSection());
    }

    /** Live announcements per province — the numbers the map is drawn from. */
    @GetMapping("/provinces")
    List<ProvinceCount> provinces(JwtAuthenticationToken authentication) {
        ErpPrincipal.from(authentication);
        return repository.countOpenByProvince(Instant.now()).stream()
                .map(row -> new ProvinceCount((String) row[0], ((Number) row[1]).longValue()))
                .toList();
    }

    /**
     * The categories, with how many live announcements each holds.
     *
     * <p>Every category is listed, including the empty ones: a filter that appears and disappears
     * with the day's bulletin is a filter nobody learns the shape of. Ordered by count so the ones
     * worth opening are at the top.
     */
    @GetMapping("/categories")
    List<CategoryCount> categories(JwtAuthenticationToken authentication) {
        ErpPrincipal.from(authentication);
        Map<String, Long> counts = repository.countOpenByCategory(Instant.now()).stream()
                .collect(java.util.stream.Collectors.toMap(
                        row -> (String) row[0], row -> ((Number) row[1]).longValue()));
        return java.util.Arrays.stream(TenderCategory.values())
                .map(category -> new CategoryCount(
                        category.code(), category.label(), counts.getOrDefault(category.code(), 0L)))
                .sorted(java.util.Comparator.comparingLong(CategoryCount::count).reversed())
                .toList();
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /** Pulls the bulletins now instead of waiting for the morning run. */
    @PostMapping("/refresh")
    Map<String, Object> refresh(JwtAuthenticationToken authentication) {
        ErpPrincipal.from(authentication);
        int stored = ingestService.ingestAll();
        return Map.of("stored", stored);
    }

    record ProvinceCount(String province, long count) {
    }

    record CategoryCount(String code, String label, long count) {
    }

    record NoticeResponse(
            long id,
            String ikn,
            String title,
            String authority,
            String province,
            String category,
            @JsonProperty("category_label") String categoryLabel,
            @JsonProperty("bulletin_type") String bulletinType,
            @JsonProperty("tender_at_text") String tenderAtText,
            @JsonProperty("tender_at") Instant tenderAt,
            String quantity,
            @JsonProperty("delivery_place") String deliveryPlace,
            String address
    ) {
        static NoticeResponse from(TenderNotice notice) {
            return new NoticeResponse(
                    notice.getId(),
                    notice.getIkn(),
                    notice.getTitle(),
                    notice.getAuthority(),
                    notice.getProvince(),
                    notice.getCategory(),
                    notice.getCategoryLabel(),
                    notice.getBulletinType(),
                    notice.getTenderAtText(),
                    notice.getTenderAt(),
                    notice.getQuantity(),
                    notice.getDeliveryPlace(),
                    notice.getAddress());
        }
    }

    /** The whole announcement, as printed. Kept off the list because it is several KB each. */
    record NoticeDetailResponse(NoticeResponse notice, String body, String section) {
    }
}
