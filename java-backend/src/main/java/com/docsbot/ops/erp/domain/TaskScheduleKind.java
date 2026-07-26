package com.docsbot.ops.erp.domain;

/**
 * How a task's dates should be read. Tender work is rarely "due at this exact instant" — it is
 * expressed relative to another date: start after the bid opens, finish before submission, hand it
 * in by Friday, do it between two dates.
 *
 * <p>{@code deadlineAt} means "must be done by" for every kind, so the due-soon and overdue ladders
 * work identically regardless of which one is chosen. {@code startsAt} is the second anchor: the
 * "not before" date for {@link #AFTER} and the window opening for {@link #BETWEEN}.
 */
public enum TaskScheduleKind {

    /**
     * Belirli tarihte — a plain due date, and what every task created before this existed uses.
     * The date stays OPTIONAL here: a task with no deadline at all is perfectly normal, and this is
     * the default kind, so requiring one would reject ordinary task creation.
     */
    AT(false, false),

    /** …den önce — finish ahead of the date. */
    BEFORE(false, true),

    /** …e kadar — the same shape as BEFORE; kept separate because it is how people say it. */
    UNTIL(false, true),

    /** …den sonra — cannot start before the date. A due date is optional here. */
    AFTER(true, false),

    /** …arasında — a window with both ends. */
    BETWEEN(true, true);

    private final boolean startRequired;
    private final boolean deadlineRequired;

    TaskScheduleKind(boolean startRequired, boolean deadlineRequired) {
        this.startRequired = startRequired;
        this.deadlineRequired = deadlineRequired;
    }

    public boolean isStartRequired() {
        return startRequired;
    }

    public boolean isDeadlineRequired() {
        return deadlineRequired;
    }

    /** True when this kind has no use for a start anchor, so one must not be stored. */
    public boolean ignoresStart() {
        return !startRequired;
    }
}
