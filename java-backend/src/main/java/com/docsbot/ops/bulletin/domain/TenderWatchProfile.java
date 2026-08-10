package com.docsbot.ops.bulletin.domain;

import java.time.Instant;
import java.util.Arrays;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Which of the day's tenders are this company's work.
 *
 * <p>Stored as comma-separated text rather than as join tables. There are eleven categories and
 * eighty-one provinces, one row, and read on every bulletin screen — a pair of join tables would be
 * three more files and two more queries to express a list somebody edits twice a year.
 *
 * <p>Empty means everything, on both axes. A company that has not filled the form in yet sees the
 * whole bulletin, which is what it saw before this existed; the alternative — an empty screen until
 * somebody configures it — is how a feature earns a reputation for being broken.
 */
@Entity
@Table(name = "erp_tender_watch_profile")
public class TenderWatchProfile {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, columnDefinition = "text")
    private String categories = "";

    @Column(nullable = false, columnDefinition = "text")
    private String provinces = "";

    @Column(name = "notify_daily", nullable = false)
    private boolean notifyDaily = true;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt = Instant.now();

    @Column(name = "updated_by", length = 160)
    private String updatedBy;

    protected TenderWatchProfile() {
    }

    public void update(List<String> categories, List<String> provinces, boolean notifyDaily,
                       String updatedBy, Instant now) {
        this.categories = join(categories);
        this.provinces = join(provinces);
        this.notifyDaily = notifyDaily;
        this.updatedBy = updatedBy;
        this.updatedAt = now;
    }

    public Long getId() {
        return id;
    }

    public List<String> categoryCodes() {
        return split(categories);
    }

    public List<String> provinceNames() {
        return split(provinces);
    }

    public boolean isNotifyDaily() {
        return notifyDaily;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public String getUpdatedBy() {
        return updatedBy;
    }

    /** True when the company has said nothing, and every announcement is therefore theirs. */
    public boolean watchesEverything() {
        return categoryCodes().isEmpty() && provinceNames().isEmpty();
    }

    private static String join(List<String> values) {
        if (values == null) {
            return "";
        }
        // Order preserved and duplicates dropped: the list is shown back to the user as they
        // entered it, and a category picked twice is still one category.
        Set<String> cleaned = new LinkedHashSet<>();
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                cleaned.add(value.trim());
            }
        }
        return String.join(",", cleaned);
    }

    private static List<String> split(String value) {
        if (value == null || value.isBlank()) {
            return List.of();
        }
        return Arrays.stream(value.split(",")).map(String::trim).filter(part -> !part.isEmpty()).toList();
    }
}
