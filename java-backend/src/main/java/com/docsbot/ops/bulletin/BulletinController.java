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
import com.docsbot.ops.bulletin.domain.BidMemory;
import com.docsbot.ops.bulletin.domain.BossBriefing;
import com.docsbot.ops.bulletin.domain.BidOutcome;
import com.docsbot.ops.bulletin.domain.TenderBid;
import com.docsbot.ops.bulletin.domain.CompanyQualification;
import com.docsbot.ops.bulletin.domain.QualificationCheck;
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
    private final QualificationService qualificationService;
    private final BidMemoryService bidMemoryService;
    private final BossBriefingService bossBriefingService;

    public BulletinController(TenderNoticeRepository repository, TenderResultRepository resultRepository,
                              BulletinIngestService ingestService,
                              TenderWatchService watchService, BulletinTaskService taskService,
                              QualificationService qualificationService,
                              BidMemoryService bidMemoryService,
                              BossBriefingService bossBriefingService) {
        this.repository = repository;
        this.resultRepository = resultRepository;
        this.ingestService = ingestService;
        this.watchService = watchService;
        this.taskService = taskService;
        this.qualificationService = qualificationService;
        this.bidMemoryService = bidMemoryService;
        this.bossBriefingService = bossBriefingService;
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


    /**
     * "Bu ihaleye girebilir miyiz?" — the announcement's bars beside what the company can prove.
     *
     * <p>Every bar in an announcement is a ratio of the bid, so the amount is the input. Without
     * one the answer is the ratios themselves rather than a verdict, which is still worth reading.
     */
    @GetMapping("/notices/{id}/qualification")
    QualificationResponse qualification(
            JwtAuthenticationToken authentication,
            @PathVariable long id,
            @RequestParam(name = "bid", required = false) BigDecimal bid
    ) {
        ErpPrincipal.from(authentication);
        TenderNotice notice = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "İlan bulunamadı"));
        QualificationCheck check = qualificationService.check(notice, bid);
        return new QualificationResponse(
                check.qualificationPublished(),
                check.bidAmount(),
                check.items().stream()
                        .map(item -> new QualificationItemResponse(
                                item.key(), item.label(), item.status().name(),
                                item.required(), item.available(), item.note()))
                        .toList());
    }

    record QualificationResponse(
            /** False when the announcement carries no qualification section — mal alımı, mostly. */
            @JsonProperty("qualification_published") boolean qualificationPublished,
            @JsonProperty("bid_amount") BigDecimal bidAmount,
            List<QualificationItemResponse> items
    ) {
    }

    record QualificationItemResponse(
            String key,
            String label,
            /**
             * MET | SHORT | NOT_REQUIRED | UNKNOWN | INFORMATION. UNKNOWN and SHORT are kept apart
             * on purpose: "we do not know your turnover" is not "you do not qualify", and a client
             * that painted both red would talk companies out of tenders they could have won.
             */
            String status,
            BigDecimal required,
            BigDecimal available,
            String note
    ) {
    }

    /** The company's own yeterlik figures. Readable by all; only an admin sets them. */
    @GetMapping("/company-qualification")
    CompanyQualificationResponse companyQualification(JwtAuthenticationToken authentication) {
        ErpPrincipal.from(authentication);
        return CompanyQualificationResponse.from(qualificationService.company());
    }

    @PutMapping("/company-qualification")
    CompanyQualificationResponse saveCompanyQualification(
            JwtAuthenticationToken authentication,
            @RequestBody CompanyQualificationRequest request
    ) {
        ErpPrincipal principal = ErpPrincipal.from(authentication);
        return CompanyQualificationResponse.from(qualificationService.save(
                request.experienceAmount(), request.experienceDate(), request.experienceSubject(),
                request.turnoverLastYear(), request.turnoverPreviousYear(), request.sectorTurnover(),
                request.currentRatio(), request.equityRatio(), request.bankDebtRatio(),
                request.bankReferenceLimit(), principal.displayName()));
    }

    record CompanyQualificationRequest(
            @JsonProperty("experience_amount") BigDecimal experienceAmount,
            @JsonProperty("experience_date") LocalDate experienceDate,
            @JsonProperty("experience_subject") String experienceSubject,
            @JsonProperty("turnover_last_year") BigDecimal turnoverLastYear,
            @JsonProperty("turnover_previous_year") BigDecimal turnoverPreviousYear,
            @JsonProperty("sector_turnover") BigDecimal sectorTurnover,
            @JsonProperty("current_ratio") BigDecimal currentRatio,
            @JsonProperty("equity_ratio") BigDecimal equityRatio,
            @JsonProperty("bank_debt_ratio") BigDecimal bankDebtRatio,
            @JsonProperty("bank_reference_limit") BigDecimal bankReferenceLimit
    ) {
    }

    record CompanyQualificationResponse(
            @JsonProperty("experience_amount") BigDecimal experienceAmount,
            @JsonProperty("experience_date") LocalDate experienceDate,
            @JsonProperty("experience_subject") String experienceSubject,
            @JsonProperty("turnover_last_year") BigDecimal turnoverLastYear,
            @JsonProperty("turnover_previous_year") BigDecimal turnoverPreviousYear,
            @JsonProperty("sector_turnover") BigDecimal sectorTurnover,
            @JsonProperty("current_ratio") BigDecimal currentRatio,
            @JsonProperty("equity_ratio") BigDecimal equityRatio,
            @JsonProperty("bank_debt_ratio") BigDecimal bankDebtRatio,
            @JsonProperty("bank_reference_limit") BigDecimal bankReferenceLimit,
            @JsonProperty("updated_by") String updatedBy,
            @JsonProperty("updated_at") Instant updatedAt
    ) {
        static CompanyQualificationResponse from(CompanyQualification q) {
            if (q == null) {
                return new CompanyQualificationResponse(null, null, null, null, null, null,
                        null, null, null, null, null, null);
            }
            return new CompanyQualificationResponse(
                    q.getExperienceAmount(), q.getExperienceDate(), q.getExperienceSubject(),
                    q.getTurnoverLastYear(), q.getTurnoverPreviousYear(), q.getSectorTurnover(),
                    q.getCurrentRatio(), q.getEquityRatio(), q.getBankDebtRatio(),
                    q.getBankReferenceLimit(), q.getUpdatedBy(), q.getUpdatedAt());
        }
    }


    /**
     * Records what the company offered for one tender.
     *
     * <p>The figure no competing service can hold: every platform reads the same public bulletin
     * and can say what a job went for, but only the software a company bids through knows what it
     * offered. Kept beside the published result it stops being a statistic and becomes a lesson.
     */
    @PostMapping("/notices/{id}/bid")
    BidResponse recordBid(
            JwtAuthenticationToken authentication,
            @PathVariable long id,
            @RequestBody BidRequest request
    ) {
        ErpPrincipal principal = ErpPrincipal.from(authentication);
        if (request.amount() == null || request.amount().signum() <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Teklif tutarı gerekli");
        }
        try {
            TenderBid bid = bidMemoryService.record(id, request.amount(), request.bidAt(),
                    request.note(), request.outcome(), principal.displayName());
            return BidResponse.from(bid);
        } catch (IllegalArgumentException exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, exception.getMessage());
        }
    }

    /** The bid already recorded for one tender, so the screen can show it instead of an empty box. */
    @GetMapping("/notices/{id}/bid")
    BidResponse bidForNotice(JwtAuthenticationToken authentication, @PathVariable long id) {
        ErpPrincipal.from(authentication);
        TenderNotice notice = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "İlan bulunamadı"));
        return BidResponse.from(bidMemoryService.find(notice.getIkn()));
    }

    record BidRequest(
            BigDecimal amount,
            @JsonProperty("bid_at") LocalDate bidAt,
            String note,
            /** WON | LOST | UNCLEAR when somebody who was in the room corrects the arithmetic. */
            String outcome
    ) {
    }

    record BidResponse(
            Long id,
            String ikn,
            BigDecimal amount,
            @JsonProperty("bid_at") LocalDate bidAt,
            String note,
            String outcome,
            @JsonProperty("recorded_by") String recordedBy
    ) {
        static BidResponse from(TenderBid bid) {
            if (bid == null) {
                return new BidResponse(null, null, null, null, null, null, null);
            }
            return new BidResponse(bid.getId(), bid.getIkn(), bid.getAmount(), bid.getBidAt(),
                    bid.getNote(), bid.getOutcomeOverride(), bid.getRecordedBy());
        }
    }

    /**
     * "Neden kaybediyoruz?" — every bid this company has made, with what the bulletin later said.
     *
     * <p>Nothing here comes from the public record alone. It is the company's own figures joined to
     * the public ones, which is why no competitor can produce this screen.
     */
    @GetMapping("/bids")
    BidMemoryResponse bids(JwtAuthenticationToken authentication) {
        ErpPrincipal.from(authentication);
        List<BidOutcome> outcomes = bidMemoryService.outcomes();
        BidMemory memory = BidMemory.of(outcomes);
        return new BidMemoryResponse(
                memory.totalBids(), memory.won(), memory.lost(), memory.pending(), memory.unclear(),
                memory.medianGapPercent(), memory.smallestGapPercent(),
                memory.rivals().stream()
                        .map(rival -> new RivalResponse(
                                rival.rival(), rival.beatUs(), rival.medianGapPercent()))
                        .toList(),
                memory.authorities().stream()
                        .map(record -> new AuthorityRecordResponse(
                                record.authority(), record.bids(), record.won(),
                                record.medianGapPercent()))
                        .toList(),
                outcomes.stream().map(OutcomeResponse::from).toList());
    }

    record BidMemoryResponse(
            @JsonProperty("total_bids") int totalBids,
            int won,
            int lost,
            int pending,
            int unclear,
            /** Null below three comparable losses: two is an anecdote, not a habit. */
            @JsonProperty("median_gap_percent") BigDecimal medianGapPercent,
            @JsonProperty("smallest_gap_percent") BigDecimal smallestGapPercent,
            List<RivalResponse> rivals,
            List<AuthorityRecordResponse> authorities,
            List<OutcomeResponse> outcomes
    ) {
    }

    record RivalResponse(
            String rival,
            @JsonProperty("beat_us") int beatUs,
            @JsonProperty("median_gap_percent") BigDecimal medianGapPercent
    ) {
    }

    record AuthorityRecordResponse(
            String authority,
            int bids,
            int won,
            @JsonProperty("median_gap_percent") BigDecimal medianGapPercent
    ) {
    }

    record OutcomeResponse(
            Long id,
            String ikn,
            String title,
            String authority,
            String province,
            @JsonProperty("bid_amount") BigDecimal bidAmount,
            @JsonProperty("bid_at") LocalDate bidAt,
            /** PENDING | WON | LOST | UNCLEAR — worked out from the result, not stored. */
            String status,
            @JsonProperty("winning_amount") BigDecimal winningAmount,
            String winner,
            @JsonProperty("gap_percent") BigDecimal gapPercent,
            String note
    ) {
        static OutcomeResponse from(BidOutcome outcome) {
            TenderBid bid = outcome.bid();
            return new OutcomeResponse(
                    bid.getId(), bid.getIkn(), bid.getTitle(), bid.getAuthority(), bid.getProvince(),
                    bid.getAmount(), bid.getBidAt(), outcome.status().name(),
                    outcome.winningAmount(), outcome.winner(), outcome.gapPercent(),
                    outcome.note());
        }
    }


    /**
     * The owner's own screen: what is waiting on them, and where the money stands.
     *
     * <p>The home screen answers "what do I have to deal with today" and is shaped for whoever does
     * the work. An owner asks two other questions and gets neither from a task list.
     */
    @GetMapping("/briefing")
    BriefingResponse briefing(JwtAuthenticationToken authentication) {
        ErpPrincipal.from(authentication);
        BossBriefing briefing = bossBriefingService.briefing();
        return new BriefingResponse(
                briefing.periodStart(),
                briefing.bidsThisMonth(),
                briefing.wonThisMonth(),
                briefing.wonAmountThisMonth(),
                briefing.wonAmountFromOurOwnFigure(),
                briefing.awaitingResult(),
                briefing.awaitingAmount(),
                briefing.pendingApproval(),
                briefing.overdueTasks(),
                briefing.dueThisWeek(),
                briefing.lapsedCredentials(),
                briefing.expiringCredentials(),
                briefing.upcoming().stream()
                        .map(item -> new UpcomingResponse(
                                item.noticeId(), item.ikn(), item.title(), item.authority(),
                                item.tenderAtText(), item.tenderAt(), item.taskId()))
                        .toList());
    }

    record BriefingResponse(
            @JsonProperty("period_start") LocalDate periodStart,
            @JsonProperty("bids_this_month") int bidsThisMonth,
            @JsonProperty("won_this_month") int wonThisMonth,
            @JsonProperty("won_amount_this_month") BigDecimal wonAmountThisMonth,
            /**
             * How many of the month's wins are counted at the company's own bid because no price
             * has been published yet. Carried so a total never passes an intention off as a signed
             * number.
             */
            @JsonProperty("won_amount_from_our_own_figure") int wonAmountFromOurOwnFigure,
            @JsonProperty("awaiting_result") int awaitingResult,
            @JsonProperty("awaiting_amount") BigDecimal awaitingAmount,
            @JsonProperty("pending_approval") int pendingApproval,
            @JsonProperty("overdue_tasks") int overdueTasks,
            @JsonProperty("due_this_week") int dueThisWeek,
            @JsonProperty("lapsed_credentials") int lapsedCredentials,
            @JsonProperty("expiring_credentials") int expiringCredentials,
            List<UpcomingResponse> upcoming
    ) {
    }

    record UpcomingResponse(
            @JsonProperty("notice_id") long noticeId,
            String ikn,
            String title,
            String authority,
            @JsonProperty("tender_at_text") String tenderAtText,
            @JsonProperty("tender_at") Instant tenderAt,
            @JsonProperty("task_id") Long taskId
    ) {
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
