package com.docsbot.ops.erp.application;

import java.util.List;

import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.common.page.OffsetLimitPageable;
import com.docsbot.ops.erp.domain.ErpActivityEvent;
import com.docsbot.ops.erp.infrastructure.ErpActivityEventRepository;

@Service
@Profile("postgres")
public class ErpActivityService {

    private final ErpActivityEventRepository repository;

    public ErpActivityService(ErpActivityEventRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public PageResult page(ErpPrincipal principal, int offset, int limit) {
        if (!principal.admin()) {
            throw new ErpExceptions.Forbidden("Admin role is required");
        }
        var pageable = new OffsetLimitPageable(
                limit,
                offset,
                Sort.by(Sort.Order.desc("createdAt"), Sort.Order.desc("id")));
        return new PageResult(
                repository.count(),
                repository.findAllByOrderByCreatedAtDescIdDesc(pageable));
    }

    public record PageResult(
            long total,
            List<ErpActivityEvent> items
    ) {
    }
}
