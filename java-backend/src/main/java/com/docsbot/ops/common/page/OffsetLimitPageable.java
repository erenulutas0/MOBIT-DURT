package com.docsbot.ops.common.page;

import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

public final class OffsetLimitPageable implements Pageable {

    private final int limit;
    private final long offset;
    private final Sort sort;

    public OffsetLimitPageable(int limit, long offset, Sort sort) {
        if (limit < 1) {
            throw new IllegalArgumentException("Limit must be at least 1");
        }
        if (offset < 0) {
            throw new IllegalArgumentException("Offset must not be negative");
        }
        this.limit = limit;
        this.offset = offset;
        this.sort = sort == null ? Sort.unsorted() : sort;
    }

    @Override
    public int getPageNumber() {
        return Math.toIntExact(offset / limit);
    }

    @Override
    public int getPageSize() {
        return limit;
    }

    @Override
    public long getOffset() {
        return offset;
    }

    @Override
    public Sort getSort() {
        return sort;
    }

    @Override
    public Pageable next() {
        return new OffsetLimitPageable(limit, offset + limit, sort);
    }

    @Override
    public Pageable previousOrFirst() {
        return hasPrevious()
                ? new OffsetLimitPageable(limit, Math.max(offset - limit, 0), sort)
                : first();
    }

    @Override
    public Pageable first() {
        return new OffsetLimitPageable(limit, 0, sort);
    }

    @Override
    public Pageable withPage(int pageNumber) {
        if (pageNumber < 0) {
            throw new IllegalArgumentException("Page index must not be negative");
        }
        return new OffsetLimitPageable(limit, (long) pageNumber * limit, sort);
    }

    @Override
    public boolean hasPrevious() {
        return offset > 0;
    }
}
