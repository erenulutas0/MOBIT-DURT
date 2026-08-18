package com.docsbot.ops.bulletin;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
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

import com.docsbot.ops.bulletin.domain.AuthorityProfile;
import com.docsbot.ops.bulletin.domain.TenderCategory;
import com.docsbot.ops.bulletin.domain.TenderNotice;
import com.docsbot.ops.bulletin.domain.TenderResult;
import com.docsbot.ops.bulletin.domain.TenderWatchProfile;
import com.docsbot.ops.bulletin.infrastructure.TenderNoticeRepository;
import com.docsbot.ops.bulletin.infrastructure.TenderResultRepository;
import com.docsbot.ops.erp.application.ErpPrincipal;
import com.docsbot.ops.erp.domain.ErpTask;
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
    private final TenderResultRepository resultRepository;
    private final BulletinIngestService ingestService;
    private final TenderWatchService watchService;
    private final BulletinTaskService taskService;

    public BulletinController(TenderNoticeRepository repository, TenderResultRepository resultRepository,
                              BulletinIngestService ingestService,
                              TenderWatchService watchService, BulletinTaskService taskService) {
        this.repository = repository;
        this.resultRepository = resultRepository;
        this.ingestService = ingestService;
        this.watchService = watchService;
        this.taskService = taskService;
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

    /**
     * Awarded contracts: who took the work, for how much, against how many bidders.
     *
     * <p>The one screen in this application that answers "what should we bid". An announcement says
     * what an idare wants; a result says what somebody else got it for, next to the idare's own
     * estimate — and that gap is the number a company has otherwise had to guess at.
     */
    @GetMapping("/results")
    List<ResultResponse> results(
            JwtAuthenticationToken authentication,
            @RequestParam(name = "province", required = false) String province,
            @RequestParam(name = "category", required = false) String category,
            @RequestParam(name = "type", required = false) String bulletinType,
            @RequestParam(name = "ikn", required = false) String ikn,
            @RequestParam(name = "mine", defaultValue = "false") boolean mineOnly,
            @RequestParam(name = "limit", defaultValue = "50") int limit
    ) {
        ErpPrincipal.from(authentication);
        // Asking by İKN is asking about one tender, and the filters would only get in its way —
        // a company following a tender in Ankara still wants its result when the work was let in
        // Konya.
        if (blankToNull(ikn) != null) {
            return resultRepository.findByIkn(ikn.trim()).stream().map(ResultResponse::from).toList();
        }
        int size = Math.max(1, Math.min(limit, 200));
        // Asked for with room to spare when the watch profile still has to narrow it: the profile
        // filters in Java, so a page sized exactly to the screen would come back short.
        int fetch = mineOnly ? Math.min(size * 4, 400) : size;
        List<TenderResult> recent = resultRepository.findRecent(
                blankToNull(province), blankToNull(category), blankToNull(bulletinType),
                org.springframework.data.domain.PageRequest.of(0, fetch));
        if (mineOnly) {
            recent = watchService.matchingResults(recent, watchService.profile());
        }
        return recent.stream().limit(size).map(ResultResponse::from).toList();
    }

    /**
     * One result as printed, for the reader who does not trust a card.
     *
     * <p>The figures on the list are parsed out of this text, and somebody deciding what to bid is
     * entitled to check them against the bulletin's own words — the same reason "Belgelere Sor"
     * quotes clauses instead of paraphrasing them.
     */
    @GetMapping("/results/{id}")
    ResultDetailResponse result(JwtAuthenticationToken authentication, @PathVariable long id) {
        ErpPrincipal.from(authentication);
        TenderResult result = resultRepository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Sonuç bulunamadı"));
        return new ResultDetailResponse(ResultResponse.from(result), result.getBody());
    }

    record ResultDetailResponse(ResultResponse result, String body) {
    }

    /**
     * How one idare has been letting work: the middle discount, the spread, and who keeps winning.
     *
     * <p>"What did this tender go for" is a fact. "What does this buyer usually pay" is the
     * question somebody actually has before pricing a bid, and it is not in any single
     * announcement.
     */
    @GetMapping("/authorities/profile")
    AuthorityProfileResponse authorityProfile(
            JwtAuthenticationToken authentication,
            @RequestParam(name = "authority") String authority
    ) {
        ErpPrincipal.from(authentication);
        String name = blankToNull(authority);
        if (name == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "İdare adı gerekli");
        }
        List<TenderResult> awards = resultRepository
                .findByAuthorityOrderByContractDateDescIdDesc(name);
        return AuthorityProfileResponse.from(AuthorityProfile.of(name, awards), awards);
    }

    record AuthorityProfileResponse(
            String authority,
            @JsonProperty("total_awards") int totalAwards,
            /** How many awards the discount could honestly be computed from. */
            @JsonProperty("sample_size") int sampleSize,
            /**
             * Null below three usable awards. Not zero and not a dash: the client has to be able to
             * say "not enough data yet" rather than print a figure drawn from a coin flip.
             */
            @JsonProperty("median_discount") BigDecimal medianDiscount,
            @JsonProperty("lowest_discount") BigDecimal lowestDiscount,
            @JsonProperty("highest_discount") BigDecimal highestDiscount,
            @JsonProperty("average_bidders") BigDecimal averageBidders,
            @JsonProperty("top_winners") List<WinnerResponse> topWinners,
            /** The awards themselves, so a reader with two data points can look at both. */
            List<ResultResponse> awards
    ) {
        static AuthorityProfileResponse from(AuthorityProfile profile, List<TenderResult> awards) {
            return new AuthorityProfileResponse(
                    profile.authority(),
                    profile.totalAwards(),
                    profile.sampleSize(),
                    profile.medianDiscount(),
                    profile.lowestDiscount(),
                    profile.highestDiscount(),
                    profile.averageBidders(),
                    profile.topWinners().stream()
                            .map(winner -> new WinnerResponse(winner.winner(), winner.awards()))
                            .toList(),
                    awards.stream().limit(20).map(ResultResponse::from).toList());
        }
    }

    record WinnerResponse(String winner, int awards) {
    }

    record ResultResponse(
            long id,
            String ikn,
            String title,
            String authority,
            String province,
            String category,
            @JsonProperty("category_label") String categoryLabel,
            @JsonProperty("bulletin_type") String bulletinType,
            @JsonProperty("work_place") String workPlace,
            String procedure,
            @JsonProperty("tender_date") LocalDate tenderDate,
            @JsonProperty("contract_date") LocalDate contractDate,
            @JsonProperty("estimated_cost") BigDecimal estimatedCost,
            @JsonProperty("contract_amount") BigDecimal contractAmount,
            String currency,
            @JsonProperty("bid_count") Integer bidCount,
            @JsonProperty("valid_bid_count") Integer validBidCount,
            String winner,
            @JsonProperty("winner_province") String winnerProvince,
            /**
             * How far under the estimate the work was let, or null when saying would be a lie —
             * see {@link TenderResult#discountPercent()}. Null and zero mean opposite things here,
             * so the client has to be given the null.
             */
            @JsonProperty("discount_percent") BigDecimal discountPercent,
            @JsonProperty("partial_award") boolean partialAward
    ) {
        static ResultResponse from(TenderResult result) {
            return new ResultResponse(
                    result.getId(),
                    result.getIkn(),
                    result.getTitle(),
                    result.getAuthority(),
                    result.getProvince(),
                    result.getCategory(),
                    result.getCategoryLabel(),
                    result.getBulletinType(),
                    result.getWorkPlace(),
                    result.getProcedureName(),
                    result.getTenderDate(),
                    result.getContractDate(),
                    result.getEstimatedCost(),
                    result.getContractAmount(),
                    result.getContractCurrency() != null
                            ? result.getContractCurrency() : result.getEstimatedCurrency(),
                    result.getBidCount(),
                    result.getValidBidCount(),
                    result.getWinner(),
                    result.getWinnerProvince(),
                    result.discountPercent(),
                    result.isPartialAward());
        }
    }

    private static String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /**
     * Opens the preparation task for a tender, with its deadline set to the tender hour.
     *
     * <p>Conflict rather than a second task when one already exists: two people reading the same
     * bulletin on the same morning is the normal case, not the exception.
     */
    @PostMapping("/notices/{id}/task")
    Map<String, Object> openTask(
            JwtAuthenticationToken authentication,
            @PathVariable long id,
            @RequestBody(required = false) OpenTaskRequest request
    ) {
        ErpPrincipal principal = ErpPrincipal.from(authentication);
        try {
            ErpTask task = taskService.openTask(principal, id,
                    request == null ? List.of() : request.assigneeUserIds(),
                    request == null ? null : request.priority());
            return Map.of("task_id", task.getId(), "title", task.getTitle());
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, exception.getMessage());
        } catch (IllegalStateException exception) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, exception.getMessage());
        }
    }

    record OpenTaskRequest(
            @JsonProperty("assignee_user_ids") List<Long> assigneeUserIds,
            String priority
    ) {
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
            String address,
            /** The preparation task, when somebody has already opened one. */
            @JsonProperty("task_id") Long taskId
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
                    notice.getAddress(),
                    notice.getTaskId());
        }
    }

    /** The whole announcement, as printed. Kept off the list because it is several KB each. */
    record NoticeDetailResponse(NoticeResponse notice, String body, String section) {
    }
}
