package com.docsbot.ops.tender;

import java.time.Instant;
import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.docsbot.ops.erp.application.ErpPrincipal;
import com.fasterxml.jackson.annotation.JsonProperty;

@RestController
@RequestMapping("/erp/search")
@Profile("postgres")
public class CommunicationSearchController {

    private final CommunicationSearchService searchService;

    public CommunicationSearchController(CommunicationSearchService searchService) {
        this.searchService = searchService;
    }

    @GetMapping
    List<SearchResultResponse> search(
            JwtAuthenticationToken authentication,
            @RequestParam("q") String query
    ) {
        return searchService.search(ErpPrincipal.from(authentication), query).stream()
                .map(SearchResultResponse::from)
                .toList();
    }

    record SearchResultResponse(
            String type,
            long id,
            @JsonProperty("group_id") Long groupId,
            @JsonProperty("group_name") String groupName,
            @JsonProperty("other_user_id") Long otherUserId,
            String title,
            String snippet,
            @JsonProperty("created_at") Instant createdAt
    ) {
        static SearchResultResponse from(CommunicationSearchService.SearchResult result) {
            return new SearchResultResponse(
                    result.type(),
                    result.id(),
                    result.groupId(),
                    result.groupName(),
                    result.otherUserId(),
                    result.title(),
                    result.snippet(),
                    result.createdAt());
        }
    }
}
