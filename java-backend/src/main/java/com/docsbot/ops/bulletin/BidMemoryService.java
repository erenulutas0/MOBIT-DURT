package com.docsbot.ops.bulletin;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.bulletin.domain.BidMemory;
import com.docsbot.ops.bulletin.domain.BidOutcome;
import com.docsbot.ops.bulletin.domain.TenderBid;
import com.docsbot.ops.bulletin.domain.TenderNotice;
import com.docsbot.ops.bulletin.domain.TenderResult;
import com.docsbot.ops.bulletin.infrastructure.TenderBidRepository;
import com.docsbot.ops.bulletin.infrastructure.TenderNoticeRepository;
import com.docsbot.ops.bulletin.infrastructure.TenderResultRepository;

/**
 * The company's own bidding memory: what it offered, and what the bulletin later said happened.
 *
 * <p>Outcomes are worked out on read rather than stored. A bid recorded today has no answer for
 * weeks and the answer arrives by itself when the result bulletin catches up, so nothing has to be
 * revisited by hand — and a stored verdict would be a second copy of a fact that already lives in
 * the results table.
 */
@Service
@Profile("postgres")
public class BidMemoryService {

    private static final ZoneId BUSINESS_ZONE = ZoneId.of("Europe/Istanbul");

    private final TenderBidRepository bidRepository;
    private final TenderResultRepository resultRepository;
    private final TenderNoticeRepository noticeRepository;
    private final Clock clock;

    @org.springframework.beans.factory.annotation.Autowired
    public BidMemoryService(TenderBidRepository bidRepository,
                            TenderResultRepository resultRepository,
                            TenderNoticeRepository noticeRepository) {
        this(bidRepository, resultRepository, noticeRepository, Clock.systemUTC());
    }

    BidMemoryService(TenderBidRepository bidRepository, TenderResultRepository resultRepository,
                     TenderNoticeRepository noticeRepository, Clock clock) {
        this.bidRepository = bidRepository;
        this.resultRepository = resultRepository;
        this.noticeRepository = noticeRepository;
        this.clock = clock;
    }

    /**
     * Records what the company offered for one tender, or corrects it.
     *
     * <p>The announcement's details are copied onto the bid so the memory survives the bulletin's
     * retention window; a bid whose tender was purged would otherwise become a number with no name.
     */
    @Transactional
    public TenderBid record(long noticeId, BigDecimal amount, LocalDate bidAt, String note,
                            String outcomeOverride, String recordedBy) {
        TenderNotice notice = noticeRepository.findById(noticeId)
                .orElseThrow(() -> new IllegalArgumentException("İlan bulunamadı"));
        LocalDate when = bidAt != null ? bidAt : LocalDate.ofInstant(clock.instant(), BUSINESS_ZONE);
        return bidRepository.findByIkn(notice.getIkn())
                .map(existing -> {
                    existing.update(amount, when, note, outcomeOverride, recordedBy, clock.instant());
                    return existing;
                })
                .orElseGet(() -> bidRepository.save(new TenderBid(
                        notice.getIkn(), notice.getId(), notice.getTitle(), notice.getAuthority(),
                        notice.getProvince(), notice.getCategory(), amount, "TRY", when, note,
                        recordedBy, clock.instant())));
    }

    @Transactional(readOnly = true)
    public TenderBid find(String ikn) {
        return bidRepository.findByIkn(ikn).orElse(null);
    }

    @Transactional(readOnly = true)
    public List<BidOutcome> outcomes() {
        List<TenderBid> bids = bidRepository.findAllByOrderByBidAtDescIdDesc();
        if (bids.isEmpty()) {
            return List.of();
        }
        // One query for every result behind these bids rather than one per bid: a company with two
        // hundred bids would otherwise open two hundred transactions to build one screen.
        Map<String, List<TenderResult>> byIkn = resultRepository
                .findByIknIn(bids.stream().map(TenderBid::getIkn).toList()).stream()
                .collect(Collectors.groupingBy(TenderResult::getIkn));
        List<BidOutcome> outcomes = new ArrayList<>();
        for (TenderBid bid : bids) {
            outcomes.add(BidOutcome.of(bid, byIkn.getOrDefault(bid.getIkn(), List.of())));
        }
        return outcomes;
    }

    @Transactional(readOnly = true)
    public BidMemory memory() {
        return BidMemory.of(outcomes());
    }
}
