package com.docsbot.ops.auth.application;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import com.docsbot.ops.common.config.DocsBotProperties;

/**
 * Sends account-related emails (currently the sign-up verification code) via SMTP. The
 * JavaMailSender bean only exists when spring.mail.host is configured, so this is injected
 * optionally — with no SMTP configured, sending fails loudly rather than silently pretending.
 */
@Service
public class AccountEmailService {

    private final ObjectProvider<JavaMailSender> mailSenderProvider;
    private final DocsBotProperties properties;

    public AccountEmailService(ObjectProvider<JavaMailSender> mailSenderProvider, DocsBotProperties properties) {
        this.mailSenderProvider = mailSenderProvider;
        this.properties = properties;
    }

    public boolean canSend() {
        return mailSenderProvider.getIfAvailable() != null;
    }

    public void sendVerificationCode(String toEmail, String name, String code) {
        JavaMailSender sender = mailSenderProvider.getIfAvailable();
        if (sender == null) {
            throw new IllegalStateException("Email sender is not configured (spring.mail.host missing)");
        }
        DocsBotProperties.Account account = properties.account();
        String appName = account != null && account.appName() != null ? account.appName() : "Mobit";
        int ttl = account != null ? account.codeTtlMinutes() : 15;
        String from = account != null && account.fromAddress() != null ? account.fromAddress() : "no-reply@mobit.com.tr";

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(from);
        message.setTo(toEmail);
        message.setSubject(appName + " · E-posta doğrulama kodu");
        message.setText(
                "Merhaba " + (name == null || name.isBlank() ? "" : name) + ",\n\n"
                + appName + " hesap talebiniz için doğrulama kodunuz:\n\n"
                + "    " + code + "\n\n"
                + "Bu kodu uygulamadaki doğrulama ekranına girin. Kod " + ttl + " dakika geçerlidir.\n\n"
                + "Bu talebi siz oluşturmadıysanız bu e-postayı yok sayabilirsiniz.");
        sender.send(message);
    }
}
