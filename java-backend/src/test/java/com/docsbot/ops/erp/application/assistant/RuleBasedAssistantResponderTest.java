package com.docsbot.ops.erp.application.assistant;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import com.docsbot.ops.erp.application.AssistantService;
import com.docsbot.ops.erp.domain.ErpTask;
import com.docsbot.ops.erp.domain.TaskPriority;
import com.docsbot.ops.erp.domain.TaskStatus;

import static org.assertj.core.api.Assertions.assertThat;

/** Fast, no-Spring coverage of the rule-based responder's intents and safety guards. */
class RuleBasedAssistantResponderTest {

    private static final String BULLET = "•"; // •
    private final RuleBasedAssistantResponder responder = new RuleBasedAssistantResponder("Europe/Istanbul");

    @Test
    void routesEachIntentToItsSection() {
        AssistantService.Briefing briefing = briefing(
                List.of(task("Vergi beyani", TaskStatus.OVERDUE)),
                List.of(task("Bugun teslim", TaskStatus.TODO)),
                List.of(task("Hafta ici is", TaskStatus.TODO)),
                List.of(task("Onu acilan", TaskStatus.TODO)),
                List.of(task("Bekleyen is", TaskStatus.BLOCKED)),
                4, 2);

        assertThat(responder.respond("geciken görevlerim neler?", briefing)).contains("Vergi beyani");
        assertThat(responder.respond("bugün ne teslim?", briefing)).contains("Bugun teslim");
        assertThat(responder.respond("bu hafta ne var", briefing)).contains("Hafta ici is");
        assertThat(responder.respond("önü açılan görevler", briefing)).contains("Onu acilan");
        assertThat(responder.respond("bekleyen işler", briefing)).contains("Bekleyen is");
        assertThat(responder.respond("okunmamış mesajlarım", briefing)).contains("4").contains("2");
        assertThat(responder.respond("yardım", briefing)).contains(AssistantService.ASSISTANT_NAME);
        assertThat(responder.respond("merhaba", briefing)).containsIgnoringCase("merhaba");
    }

    @Test
    void searchesByTitleKeywordAndFallsBackOtherwise() {
        AssistantService.Briefing briefing = briefing(
                List.of(task("BEDAŞ ihale dosyası", TaskStatus.OVERDUE)),
                List.of(), List.of(), List.of(), List.of(), 0, 0);

        assertThat(responder.respond("bedaş", briefing)).contains("BEDAŞ ihale dosyası");
        assertThat(responder.respond("zxq", briefing)).isNotBlank();
    }

    @Test
    void emptyBriefingSaysNothingPending() {
        AssistantService.Briefing briefing = briefing(
                List.of(), List.of(), List.of(), List.of(), List.of(), 0, 0);
        assertThat(responder.respond("durum nedir", briefing)).contains("🎉"); // 🎉
    }

    @Test
    void sanitizesTitlesAndCapsLongLists() {
        // A title with newlines/control chars must collapse to one clean bullet line.
        ErpTask nasty = task("Satir1\nSatir2\tSON", TaskStatus.OVERDUE);
        String reply = responder.respond("geciken",
                briefing(List.of(nasty), List.of(), List.of(), List.of(), List.of(), 0, 0));
        assertThat(reply).doesNotContain("\t");
        assertThat(reply.lines().filter(l -> l.startsWith(BULLET)).count()).isEqualTo(1L);

        // 20 overdue tasks → list capped at 15 with a "and N more" tail.
        List<ErpTask> many = new ArrayList<>();
        for (int i = 0; i < 20; i++) {
            many.add(task("Gorev " + i, TaskStatus.OVERDUE));
        }
        String capped = responder.respond("geciken",
                briefing(many, List.of(), List.of(), List.of(), List.of(), 0, 0));
        assertThat(capped).contains("tane daha");
        assertThat(capped.lines().filter(l -> l.startsWith(BULLET)).count()).isEqualTo(15L);
    }

    private ErpTask task(String title, TaskStatus status) {
        ErpTask task = ErpTask.create(title, null, 1L, TaskPriority.NORMAL, null, Instant.now());
        ReflectionTestUtils.setField(task, "status", status);
        return task;
    }

    private AssistantService.Briefing briefing(
            List<ErpTask> overdue,
            List<ErpTask> dueToday,
            List<ErpTask> dueThisWeek,
            List<ErpTask> ready,
            List<ErpTask> blocked,
            long unreadMessages,
            long unreadNotifications
    ) {
        AssistantService.Sections sections =
                new AssistantService.Sections(overdue, dueToday, dueThisWeek, ready, blocked);
        return new AssistantService.Briefing(
                AssistantService.ASSISTANT_NAME, "Test Kullanıcı", Instant.now(),
                sections, unreadMessages, unreadNotifications);
    }
}
