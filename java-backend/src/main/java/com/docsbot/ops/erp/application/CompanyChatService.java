package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Instant;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import com.docsbot.ops.auth.domain.ErpUser;
import com.docsbot.ops.auth.infrastructure.ErpUserRepository;
import com.docsbot.ops.erp.domain.ErpCompanyChatMessage;
import com.docsbot.ops.erp.infrastructure.ErpCompanyChatMessageRepository;

/**
 * Company-wide "all chat" channel: every authenticated user can post, everyone reads the
 * same feed, and a scheduled job hard-deletes the whole channel once a day so it always
 * reads as a fresh daily board rather than an accumulating archive.
 */
@Service
@Profile("postgres")
public class CompanyChatService {

    private final ErpCompanyChatMessageRepository messageRepository;
    private final ErpUserRepository userRepository;
    private final ChatEventPublisher chatEventPublisher;
    private final Clock clock;

    @Autowired
    public CompanyChatService(
            ErpCompanyChatMessageRepository messageRepository,
            ErpUserRepository userRepository,
            ChatEventPublisher chatEventPublisher
    ) {
        this(messageRepository, userRepository, chatEventPublisher, Clock.systemUTC());
    }

    CompanyChatService(
            ErpCompanyChatMessageRepository messageRepository,
            ErpUserRepository userRepository,
            ChatEventPublisher chatEventPublisher,
            Clock clock
    ) {
        this.messageRepository = messageRepository;
        this.userRepository = userRepository;
        this.chatEventPublisher = chatEventPublisher;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public List<ErpCompanyChatMessage> listMessages() {
        return messageRepository.findAllByOrderByCreatedAtAscIdAsc();
    }

    @Transactional
    public ErpCompanyChatMessage sendMessage(ErpPrincipal principal, String body) {
        String cleanedBody = ErpValidation.normalizeRequiredMessage(body);
        String authorName;
        Long authorUserId;
        String authorRole;
        if (principal.admin()) {
            authorUserId = null;
            authorName = "Admin";
            authorRole = "admin";
        } else {
            long userId = principal.requireUserId();
            ErpUser user = userRepository.findById(userId)
                    .orElseThrow(() -> new ErpExceptions.Forbidden("Authenticated employee identity is required"));
            authorUserId = user.getId();
            authorName = user.getName();
            authorRole = "employee";
        }
        ErpCompanyChatMessage message = messageRepository.saveAndFlush(ErpCompanyChatMessage.create(
                authorUserId, authorName, authorRole, cleanedBody, clock.instant()));
        // Publish only after the row is committed and visible — subscribers re-fetch on the
        // event, and a rollback must not announce a message that never landed.
        long messageId = message.getId();
        afterCommit(() -> chatEventPublisher.publishCompanyChatMessage(messageId));
        return message;
    }

    /** Runs once daily; the channel is meant to read fresh each morning, not accumulate. */
    @Scheduled(cron = "${docsbot.company-chat-purge-cron:0 0 0 * * *}",
            zone = "${docsbot.company-chat-purge-zone:Europe/Istanbul}")
    @Transactional
    public void purgeDaily() {
        if (messageRepository.count() == 0) {
            return;
        }
        messageRepository.deleteAllInBatch();
        afterCommit(chatEventPublisher::publishCompanyChatCleared);
    }

    private void afterCommit(Runnable action) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            action.run();
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                action.run();
            }
        });
    }
}
