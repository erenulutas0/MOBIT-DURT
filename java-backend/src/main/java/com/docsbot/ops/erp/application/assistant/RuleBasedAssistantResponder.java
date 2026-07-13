package com.docsbot.ops.erp.application.assistant;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import com.docsbot.ops.erp.application.AssistantService;
import com.docsbot.ops.erp.domain.ErpTask;

/**
 * Zero-cost, no-LLM responder. It classifies the message by keyword (Turkish) and answers from the
 * already-retrieved briefing — genuinely useful ("what's overdue?", "what's due today?", "how many
 * unread messages?", or a title keyword search) without any external API. It is the default while
 * {@code docsbot.assistant.provider=rule-based}; a Claude responder can replace it later.
 */
@Component
public class RuleBasedAssistantResponder implements AssistantResponder {

    private static final DateTimeFormatter DAY = DateTimeFormatter.ofPattern("d MMM", new Locale("tr"));
    private static final int MAX_LIST_ITEMS = 15;
    private static final int MAX_TITLE_LEN = 140;
    private static final int MAX_REPLY_LEN = 4000;
    private final ZoneId zone;

    public RuleBasedAssistantResponder(
            @Value("${docsbot.assistant.zone:Europe/Istanbul}") String zone) {
        this.zone = ZoneId.of(zone);
    }

    @Override
    public String id() {
        return "rule-based";
    }

    @Override
    public String respond(String message, AssistantService.Briefing briefing) {
        return AssistantSafety.capReply(answer(message, briefing), MAX_REPLY_LEN);
    }

    private String answer(String message, AssistantService.Briefing briefing) {
        String text = message == null ? "" : message.trim().toLowerCase(new Locale("tr"));
        AssistantService.Sections s = briefing.sections();

        if (text.isBlank() || contains(text, "yardım", "yardim", "ne yapabilir", "nasıl")) {
            return help(briefing.displayName());
        }
        if (contains(text, "merhaba", "selam", "günaydın", "gunaydin", "iyi akşam")) {
            return "Merhaba " + firstName(briefing.displayName()) + "! " + overview(briefing);
        }
        if (contains(text, "gecik")) {
            return listOrEmpty("⏰ Geciken görevlerin", s.overdue(), "Geciken görevin yok. 👍");
        }
        if (contains(text, "bugün", "bugun")) {
            return listOrEmpty("📅 Bugün teslim edilecekler", s.dueToday(), "Bugün teslim edilecek görevin yok.");
        }
        if (contains(text, "hafta")) {
            return listOrEmpty("🗓️ Bu hafta teslim edilecekler", s.dueThisWeek(), "Bu hafta teslim edilecek görevin yok.");
        }
        if (contains(text, "hazır", "hazir", "başlay", "baslay", "önü aç", "onu ac")) {
            return listOrEmpty("✅ Önü açılan (başlayabileceğin) görevler", s.readyToStart(),
                    "Şu an başlamaya hazır, önü açılmış bir görevin yok.");
        }
        if (contains(text, "bekle", "bloke", "bağımlı", "bagimli")) {
            return listOrEmpty("🔒 Bekleyen (bağımlı) görevler", s.blocked(),
                    "Başka bir göreve bağlı bekleyen görevin yok.");
        }
        if (contains(text, "mesaj", "okunmam", "bildirim")) {
            return String.format(
                    "📩 %d okunmamış mesajın ve %d okunmamış bildirimin var.",
                    briefing.unreadMessages(), briefing.unreadNotifications());
        }
        if (contains(text, "özet", "ozet", "durum", "ne yapmalı", "ne var", "görevlerim", "gorevlerim")) {
            return overview(briefing);
        }

        // Fallback: keyword search over the actionable tasks the briefing surfaced.
        String match = search(text, s);
        if (match != null) {
            return match;
        }
        return "Bunu tam anlayamadım. Şunları sorabilirsin: *geciken görevler*, *bugün teslim*, "
                + "*bu hafta*, *okunmamış mesajlar*, ya da bir görev adı.\n\n" + overview(briefing);
    }

    private String overview(AssistantService.Briefing b) {
        AssistantService.Sections s = b.sections();
        StringBuilder sb = new StringBuilder("İşte durumun:\n");
        appendCount(sb, "⏰", s.overdue().size(), "geciken görev");
        appendCount(sb, "📅", s.dueToday().size(), "görev bugün teslim");
        appendCount(sb, "🗓️", s.dueThisWeek().size(), "görev bu hafta teslim");
        appendCount(sb, "✅", s.readyToStart().size(), "görevin önü açık");
        appendCount(sb, "🔒", s.blocked().size(), "bekleyen görev");
        appendCount(sb, "📩", (int) Math.min(Integer.MAX_VALUE, b.unreadMessages()), "okunmamış mesaj");
        if (sb.length() == "İşte durumun:\n".length()) {
            return "Harika görünüyor — bekleyen bir şey yok. 🎉";
        }
        return sb.toString().stripTrailing();
    }

    private String search(String text, AssistantService.Sections s) {
        if (text.length() < 3) {
            return null;
        }
        for (List<ErpTask> bucket : List.of(
                s.overdue(), s.dueToday(), s.dueThisWeek(), s.readyToStart(), s.blocked())) {
            for (ErpTask task : bucket) {
                String title = task.getTitle();
                if (title != null && title.toLowerCase(new Locale("tr")).contains(text)) {
                    return "“" + AssistantSafety.inline(title, MAX_TITLE_LEN) + "” — durum: "
                            + statusLabel(task) + deadlineSuffix(task) + ".";
                }
            }
        }
        return null;
    }

    private String listOrEmpty(String header, List<ErpTask> tasks, String emptyText) {
        if (tasks.isEmpty()) {
            return emptyText;
        }
        StringBuilder sb = new StringBuilder(header).append(" (").append(tasks.size()).append("):\n");
        int shown = Math.min(tasks.size(), MAX_LIST_ITEMS);
        for (int i = 0; i < shown; i++) {
            ErpTask t = tasks.get(i);
            sb.append("• ").append(AssistantSafety.inline(t.getTitle(), MAX_TITLE_LEN))
                    .append(deadlineSuffix(t)).append('\n');
        }
        if (tasks.size() > shown) {
            sb.append("… ve ").append(tasks.size() - shown).append(" tane daha.\n");
        }
        return sb.toString().stripTrailing();
    }

    private String help(String displayName) {
        return "Ben " + AssistantService.ASSISTANT_NAME + ", " + firstName(displayName)
                + ". Sana görevlerini hatırlatırım. Şunları sorabilirsin:\n"
                + "• *geciken görevlerim*\n• *bugün ne teslim*\n• *bu hafta ne var*\n"
                + "• *önü açılan görevler*\n• *okunmamış mesajlarım*\n• *bir görev adı*";
    }

    private void appendCount(StringBuilder sb, String icon, int count, String label) {
        if (count > 0) {
            sb.append(icon).append(' ').append(count).append(' ').append(label).append('\n');
        }
    }

    private String deadlineSuffix(ErpTask task) {
        Instant deadline = task.getDeadlineAt();
        if (deadline == null) {
            return "";
        }
        return " (son: " + DAY.format(deadline.atZone(zone)) + ")";
    }

    private String statusLabel(ErpTask task) {
        return switch (task.getStatus()) {
            case OVERDUE -> "gecikmiş";
            case IN_PROGRESS -> "devam ediyor";
            case BLOCKED -> "bekliyor";
            case PENDING_APPROVAL -> "onay bekliyor";
            case TODO -> "yapılacak";
            case DONE -> "tamamlandı";
            case CANCELLED -> "iptal";
        };
    }

    private static boolean contains(String text, String... needles) {
        for (String n : needles) {
            if (text.contains(n)) {
                return true;
            }
        }
        return false;
    }

    private static String firstName(String fullName) {
        if (fullName == null || fullName.isBlank()) {
            return "";
        }
        String trimmed = fullName.trim();
        int space = trimmed.indexOf(' ');
        return space < 0 ? trimmed : trimmed.substring(0, space);
    }
}
