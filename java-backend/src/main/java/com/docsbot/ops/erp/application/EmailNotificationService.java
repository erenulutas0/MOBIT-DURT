package com.docsbot.ops.erp.application;

import java.time.Clock;
import java.time.Instant;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Profile;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.auth.infrastructure.ErpUserRepository;
import com.docsbot.ops.common.config.DocsBotProperties;
import com.docsbot.ops.erp.domain.ErpNotification;
import com.docsbot.ops.erp.domain.ErpNotificationDelivery;
import com.docsbot.ops.erp.infrastructure.ErpNotificationDeliveryRepository;
import com.docsbot.ops.erp.infrastructure.ErpNotificationPreferenceRepository;

@Service
@Profile("postgres")
public class EmailNotificationService {

    private final DocsBotProperties properties;
    private final ErpUserRepository userRepository;
    private final ErpNotificationPreferenceRepository preferenceRepository;
    private final ErpNotificationDeliveryRepository deliveryRepository;
    private final ObjectProvider<JavaMailSender> mailSenderProvider;
    private final Clock clock;

    @Autowired
    public EmailNotificationService(
            DocsBotProperties properties,
            ErpUserRepository userRepository,
            ErpNotificationPreferenceRepository preferenceRepository,
            ErpNotificationDeliveryRepository deliveryRepository,
            ObjectProvider<JavaMailSender> mailSenderProvider
    ) {
        this(
                properties,
                userRepository,
                preferenceRepository,
                deliveryRepository,
                mailSenderProvider,
                Clock.systemUTC());
    }

    EmailNotificationService(
            DocsBotProperties properties,
            ErpUserRepository userRepository,
            ErpNotificationPreferenceRepository preferenceRepository,
            ErpNotificationDeliveryRepository deliveryRepository,
            ObjectProvider<JavaMailSender> mailSenderProvider,
            Clock clock
    ) {
        this.properties = properties;
        this.userRepository = userRepository;
        this.preferenceRepository = preferenceRepository;
        this.deliveryRepository = deliveryRepository;
        this.mailSenderProvider = mailSenderProvider;
        this.clock = clock;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void deliver(ErpNotification notification) {
        if (!emailAllowed(notification.getUserId())) {
            return;
        }
        DocsBotProperties.Email email = properties.email();
        if (email == null || !email.enabled()) {
            return;
        }
        Instant now = clock.instant();
        String recipient = recipientEmail(notification.getUserId());
        if (recipient == null) {
            deliveryRepository.save(ErpNotificationDelivery.failed(
                    notification.getId(),
                    "EMAIL",
                    "Notification recipient does not have an email address",
                    now));
            return;
        }
        if (email.dryRun()) {
            deliveryRepository.save(ErpNotificationDelivery.accepted(
                    notification.getId(),
                    "EMAIL",
                    now));
            return;
        }
        JavaMailSender mailSender = mailSenderProvider.getIfAvailable();
        if (mailSender == null) {
            deliveryRepository.save(ErpNotificationDelivery.failed(
                    notification.getId(),
                    "EMAIL",
                    "Email sender is not configured",
                    now));
            return;
        }
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(email.from());
            message.setTo(recipient);
            message.setSubject(subject(email, notification));
            message.setText(body(notification));
            mailSender.send(message);
            deliveryRepository.save(ErpNotificationDelivery.accepted(
                    notification.getId(),
                    "EMAIL",
                    now));
        } catch (RuntimeException exception) {
            deliveryRepository.save(ErpNotificationDelivery.failed(
                    notification.getId(),
                    "EMAIL",
                    exception.getMessage(),
                    now));
        }
    }

    private boolean emailAllowed(long userId) {
        return preferenceRepository.findById(userId)
                .map(preference -> preference.isEmailEnabled())
                .orElse(false);
    }

    private String recipientEmail(long userId) {
        if (userId == ErpNotification.ADMIN_RECIPIENT_ID) {
            return normalize(properties.email() == null ? null : properties.email().adminTo());
        }
        return userRepository.findById(userId)
                .map(user -> normalize(user.getEmail()))
                .orElse(null);
    }

    private String subject(DocsBotProperties.Email email, ErpNotification notification) {
        String prefix = normalize(email.subjectPrefix());
        return (prefix == null ? "" : prefix + " ") + notification.getTitle();
    }

    private String body(ErpNotification notification) {
        StringBuilder body = new StringBuilder();
        body.append(notification.getTitle()).append("\n\n");
        if (notification.getBody() != null && !notification.getBody().isBlank()) {
            body.append(notification.getBody()).append("\n\n");
        }
        if (notification.getTaskId() != null) {
            body.append("Task ID: ").append(notification.getTaskId()).append("\n");
        }
        body.append("Notification ID: ").append(notification.getId());
        return body.toString();
    }

    private String normalize(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }
}
