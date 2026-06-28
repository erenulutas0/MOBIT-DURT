package com.docsbot.ops.telegram;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Service;

import com.docsbot.ops.erp.application.ErpExceptions;
import com.docsbot.ops.telegram.TelegramUpdateParser.Callback;
import com.docsbot.ops.telegram.TelegramUpdateParser.MediaMessage;
import com.docsbot.ops.telegram.TelegramUpdateParser.TextMessage;
import com.docsbot.ops.tender.TenderIngestionService;
import com.docsbot.ops.tender.domain.Tender;
import com.docsbot.ops.tender.domain.TenderDocument;
import com.docsbot.ops.tender.domain.TenderOrganization;
import tools.jackson.databind.JsonNode;

@Service
@Profile("postgres")
public class TelegramUpdateProcessor {

    private static final String HELP_TEXT = """
            DocsBot ihale dokümanlarını düzenler, arşivler ve Obsidian notları oluşturur.

            Komutlar:
            /unit - Kendi şirket kolunuzu seçin
            /company - İhalenin yapılacağı şirketi seçin
            /company_search <ad> - İhale şirketi ara
            /company_add <ad> - Yeni ihale şirketi ekle (grup yöneticisi)
            /documents - Bu ihaleye yüklenen son 10 dokümanı göster
            /stats - İhale doküman istatistiklerini göster
            /tender_status - Grubun bağlı olduğu ihaleyi göster
            /security_info - Grup ve kullanıcı ID bilginizi göster
            /help - Kullanım rehberini göster

            Kullanım:
            1. /unit ile şirket kolunu seçin.
            2. /company ile ihale şirketini seçin.
            3. PDF, Word, Excel veya görselleri gruba yükleyin.
            """;

    private final TelegramGateway gateway;
    private final TelegramUpdateParser parser;
    private final TelegramTenderService tenderService;
    private final TenderIngestionService ingestionService;
    private final TelegramAccessPolicy accessPolicy;

    public TelegramUpdateProcessor(
            TelegramGateway gateway,
            TelegramUpdateParser parser,
            TelegramTenderService tenderService,
            TenderIngestionService ingestionService,
            TelegramAccessPolicy accessPolicy
    ) {
        this.gateway = gateway;
        this.parser = parser;
        this.tenderService = tenderService;
        this.ingestionService = ingestionService;
        this.accessPolicy = accessPolicy;
    }

    public void process(JsonNode update) {
        var membership = parser.membership(update);
        if (membership.isPresent() && membership.get().joined()) {
            if (!accessPolicy.isChatAllowed(membership.get().chatId())) return;
            welcome(membership.get().chatId());
            return;
        }

        var callback = parser.callback(update);
        if (callback.isPresent()) {
            if (!accessPolicy.isChatAllowed(callback.get().chatId())) return;
            handleCallback(callback.get());
            return;
        }

        var media = parser.media(update);
        if (media.isPresent()) {
            if (!accessPolicy.isChatAllowed(media.get().chatId())) return;
            handleMedia(media.get());
            return;
        }

        parser.textMessage(update)
                .filter(message -> accessPolicy.isChatAllowed(message.chatId()))
                .ifPresent(this::handleText);
    }

    private void handleMedia(MediaMessage message) {
        Tender tender = tenderService.boundTender(message.chatId());
        if (tender == null) {
            gateway.sendMessage(
                    message.chatId(),
                    "Doküman alınmadı. Bu grup henüz bir ihaleye bağlı değil.\n"
                            + "Önce /unit, sonra /company ile kurulumu tamamlayın.");
            return;
        }
        if (ingestionService.alreadyProcessed(message.messageId())) {
            return;
        }
        TelegramGateway.DownloadedFile downloaded =
                gateway.downloadFile(message.fileId(), message.fileSize());
        String contentType = "application/octet-stream".equals(downloaded.contentType())
                && message.mimeType() != null
                ? message.mimeType()
                : downloaded.contentType();
        TenderDocument document = ingestionService.ingestTelegram(
                tender,
                message.messageId(),
                "telegram:" + message.senderId(),
                message.timestamp(),
                message.fileId(),
                message.filename(),
                contentType,
                message.caption(),
                downloaded.content());
        gateway.sendMessage(
                message.chatId(),
                "Doküman kaydedildi.\n"
                        + "Tender: " + document.getTenderId() + "\n"
                        + "Type: " + document.getDocumentType() + "\n"
                        + "Status: " + document.getStatus());
    }

    private void handleText(TextMessage message) {
        String[] parts = message.text().trim().split("\\s+", 2);
        String command = parts[0]
                .split("@", 2)[0]
                .toLowerCase();
        String argument = parts.length == 2 ? parts[1].trim() : "";
        switch (command) {
            case "/start", "/help", "/commands" ->
                    gateway.sendMessage(message.chatId(), HELP_TEXT);
            case "/unit" -> showUnitSelector(message.chatId());
            case "/company" -> showCompanySelector(message.chatId(), 0);
            case "/company_search" -> searchCompanies(message.chatId(), argument);
            case "/company_add" -> addCompany(message, argument);
            case "/tender_status" -> showStatus(message.chatId());
            case "/documents" -> showDocuments(message.chatId());
            case "/stats" -> showStats(message.chatId());
            case "/security_info" -> gateway.sendMessage(
                    message.chatId(),
                    "Telegram güvenlik bilgileri\n"
                            + "Grup ID: " + message.chatId() + "\n"
                            + "Kullanıcı ID: " + message.senderId());
            default -> {
                // Text-only chat history is intentionally ignored.
            }
        }
    }

    private void handleCallback(Callback callback) {
        gateway.answerCallback(callback.callbackId());
        try {
            if (callback.data().startsWith("unit:")) {
                String unit = callback.data().substring("unit:".length());
                tenderService.selectUnit(callback.chatId(), callback.chatTitle(), unit);
                gateway.sendMessage(callback.chatId(), "Şirket kolu seçildi: " + unit);
                showCompanySelector(callback.chatId(), 0);
                return;
            }
            if (callback.data().startsWith("orgpage:")) {
                showCompanySelector(
                        callback.chatId(),
                        Integer.parseInt(callback.data().substring("orgpage:".length())));
                return;
            }
            if (callback.data().startsWith("orgsel:")) {
                Tender tender = tenderService.selectOrganization(
                        callback.chatId(),
                        callback.chatTitle(),
                        Long.parseLong(callback.data().substring("orgsel:".length())));
                gateway.sendMessage(
                        callback.chatId(),
                        "İhale grubu hazır.\n"
                                + "Şirket kolu: " + tender.getInternalUnit() + "\n"
                                + "İhale şirketi: " + tender.getOrganization() + "\n"
                                + "Tender: " + tender.getTenderId() + "\n"
                                + "Artık doküman yükleyebilirsiniz.");
            }
        } catch (NumberFormatException | ErpExceptions.BadRequest exception) {
            gateway.sendMessage(callback.chatId(), exception.getMessage());
        }
    }

    private void welcome(String chatId) {
        gateway.sendMessage(
                chatId,
                "Merhaba, ben DocsBot.\n"
                        + "Bu gruptaki ihale dokümanlarını düzenleyip arşivleyeceğim.\n"
                        + "Başlamak için kendi şirket kolunuzu seçin.");
        showUnitSelector(chatId);
    }

    private void showUnitSelector(String chatId) {
        List<List<Map<String, String>>> keyboard = TelegramTenderService.INTERNAL_UNITS.stream()
                .map(unit -> List.of(Map.of(
                        "text", unit.replace('_', ' '),
                        "callback_data", "unit:" + unit)))
                .toList();
        gateway.sendMessage(
                chatId,
                "Kendi şirket kolunuzu seçin:",
                Map.of("inline_keyboard", keyboard));
    }

    private void showCompanySelector(String chatId, int page) {
        var setup = tenderService.setup(chatId);
        if (setup == null || setup.getInternalUnit() == null) {
            gateway.sendMessage(chatId, "Önce /unit ile kendi şirket kolunuzu seçin.");
            return;
        }
        var organizations = tenderService.organizations(page);
        List<List<Map<String, String>>> keyboard = new ArrayList<>();
        for (TenderOrganization organization : organizations.getContent()) {
            keyboard.add(List.of(Map.of(
                    "text", organization.getName(),
                    "callback_data", "orgsel:" + organization.getId())));
        }
        List<Map<String, String>> navigation = new ArrayList<>();
        if (organizations.hasPrevious()) {
            navigation.add(Map.of(
                    "text", "< Önceki",
                    "callback_data", "orgpage:" + (organizations.getNumber() - 1)));
        }
        navigation.add(Map.of(
                "text", (organizations.getNumber() + 1) + "/" + Math.max(1, organizations.getTotalPages()),
                "callback_data", "noop"));
        if (organizations.hasNext()) {
            navigation.add(Map.of(
                    "text", "Sonraki >",
                    "callback_data", "orgpage:" + (organizations.getNumber() + 1)));
        }
        keyboard.add(navigation);
        gateway.sendMessage(
                chatId,
                "İhalenin yapılacağı şirketi seçin:",
                Map.of("inline_keyboard", keyboard));
    }

    private void searchCompanies(String chatId, String query) {
        try {
            List<TenderOrganization> organizations = tenderService.searchOrganizations(query);
            if (organizations.isEmpty()) {
                gateway.sendMessage(chatId, "Eşleşen şirket bulunamadı.");
                return;
            }
            List<List<Map<String, String>>> keyboard = organizations.stream()
                    .map(organization -> List.of(Map.of(
                            "text", organization.getName(),
                            "callback_data", "orgsel:" + organization.getId())))
                    .toList();
            gateway.sendMessage(
                    chatId,
                    "Arama sonuçları:",
                    Map.of("inline_keyboard", keyboard));
        } catch (ErpExceptions.BadRequest exception) {
            gateway.sendMessage(chatId, exception.getMessage());
        }
    }

    private void addCompany(TextMessage message, String name) {
        if (!accessPolicy.isCatalogAdministrator(message.senderId())
                || !gateway.isChatAdministrator(message.chatId(), message.senderId())) {
            gateway.sendMessage(
                    message.chatId(),
                    "Yeni şirket eklemek için grup yöneticisi olmalısınız.");
            return;
        }
        try {
            TenderOrganization organization = tenderService.addOrganization(name);
            gateway.sendMessage(
                    message.chatId(),
                    "Şirket kataloğa eklendi: " + organization.getName());
        } catch (ErpExceptions.BadRequest exception) {
            gateway.sendMessage(message.chatId(), exception.getMessage());
        }
    }

    private void showStatus(String chatId) {
        Tender tender = tenderService.boundTender(chatId);
        if (tender == null) {
            var setup = tenderService.setup(chatId);
            String unit = setup == null || setup.getInternalUnit() == null
                    ? "seçilmedi"
                    : setup.getInternalUnit();
            gateway.sendMessage(
                    chatId,
                    "Bu grup henüz bir ihaleye bağlı değil.\n"
                            + "Şirket kolu: " + unit + "\n"
                            + "Kuruluma devam etmek için /unit ve /company kullanın.");
        } else {
            gateway.sendMessage(
                    chatId,
                    "Şirket kolu: " + tender.getInternalUnit() + "\n"
                            + "Bu grup " + tender.getTenderId() + " ihalesine bağlı.");
        }
    }

    private void showDocuments(String chatId) {
        Tender tender = tenderService.boundTender(chatId);
        if (tender == null) {
            gateway.sendMessage(chatId, "Bu grup henüz bir ihaleye bağlı değil.");
            return;
        }
        List<TenderDocument> documents = tenderService.recentDocuments(tender.getTenderId());
        if (documents.isEmpty()) {
            gateway.sendMessage(
                    chatId,
                    tender.getTenderId() + " için henüz doküman yüklenmedi.");
            return;
        }
        StringBuilder text = new StringBuilder(tender.getTenderId())
                .append(" - Son dokümanlar:");
        for (int index = 0; index < documents.size(); index++) {
            TenderDocument document = documents.get(index);
            String name = document.getOriginalFilename() == null
                    ? document.getStoredFilename()
                    : document.getOriginalFilename();
            text.append("\n").append(index + 1).append(". ").append(name)
                    .append("\n   Type: ").append(document.getDocumentType())
                    .append(" | Status: ").append(document.getStatus());
        }
        gateway.sendMessage(chatId, text.toString());
    }

    private void showStats(String chatId) {
        Tender tender = tenderService.boundTender(chatId);
        if (tender == null) {
            gateway.sendMessage(chatId, "Bu grup henüz bir ihaleye bağlı değil.");
            return;
        }
        List<TenderDocument> documents = tenderService.allDocuments(tender.getTenderId());
        Map<String, Long> byType = documents.stream().collect(
                java.util.stream.Collectors.groupingBy(
                        TenderDocument::getDocumentType,
                        LinkedHashMap::new,
                        java.util.stream.Collectors.counting()));
        Map<String, Long> byStatus = documents.stream().collect(
                java.util.stream.Collectors.groupingBy(
                        TenderDocument::getStatus,
                        LinkedHashMap::new,
                        java.util.stream.Collectors.counting()));
        gateway.sendMessage(
                chatId,
                tender.getTenderId() + " istatistikleri\n"
                        + "Toplam doküman: " + documents.size() + "\n"
                        + "Türler: " + byType + "\n"
                        + "Durumlar: " + byStatus);
    }
}
