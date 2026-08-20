package com.docsbot.ops.bulletin;

import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.bulletin.domain.BidOutcome;
import com.docsbot.ops.bulletin.domain.RivalProfile;
import com.docsbot.ops.bulletin.domain.TenderResult;
import com.docsbot.ops.bulletin.infrastructure.TenderResultRepository;

/**
 * Who a company is bidding against.
 *
 * <p>Built out of the same public results the rest of the bulletin uses, with one line that is not
 * public at all: how many of <em>our</em> bids this firm has taken. The record says who won; only
 * the company's own bid memory says who won against us.
 */
@Service
@Profile("postgres")
public class RivalService {

    /** A search box shows ten; asking for more would only make the query slower. */
    private static final int SEARCH_LIMIT = 10;

    private final TenderResultRepository resultRepository;
    private final BidMemoryService bidMemoryService;

    public RivalService(TenderResultRepository resultRepository, BidMemoryService bidMemoryService) {
        this.resultRepository = resultRepository;
        this.bidMemoryService = bidMemoryService;
    }

    /** @return firm name and how many contracts we hold for it, busiest first */
    @Transactional(readOnly = true)
    public List<Object[]> search(String term) {
        if (term == null || term.trim().length() < 2) {
            // One letter matches three thousand firms and answers nothing.
            return List.of();
        }
        return resultRepository.searchWinners(term.trim(), PageRequest.of(0, SEARCH_LIMIT));
    }

    @Transactional(readOnly = true)
    public RivalProfile profile(String winner) {
        List<TenderResult> contracts =
                resultRepository.findByWinnerOrderByContractDateDescIdDesc(winner);
        int beatUs = 0;
        for (BidOutcome outcome : bidMemoryService.outcomes()) {
            if (outcome.status() == BidOutcome.Status.LOST
                    && winner.equalsIgnoreCase(outcome.winner() == null ? "" : outcome.winner().trim())) {
                beatUs++;
            }
        }
        return RivalProfile.of(winner, contracts, beatUs);
    }
}
