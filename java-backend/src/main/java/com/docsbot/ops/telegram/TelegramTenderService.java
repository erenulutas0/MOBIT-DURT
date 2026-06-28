package com.docsbot.ops.telegram;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Set;

import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.docsbot.ops.erp.application.ErpExceptions;
import com.docsbot.ops.telegram.domain.TelegramChatBinding;
import com.docsbot.ops.telegram.domain.TelegramChatSetup;
import com.docsbot.ops.telegram.infrastructure.TelegramChatBindingRepository;
import com.docsbot.ops.telegram.infrastructure.TelegramChatSetupRepository;
import com.docsbot.ops.tender.TenderClassifier;
import com.docsbot.ops.tender.domain.Tender;
import com.docsbot.ops.tender.domain.TenderDocument;
import com.docsbot.ops.tender.domain.TenderOrganization;
import com.docsbot.ops.tender.infrastructure.TenderDocumentRepository;
import com.docsbot.ops.tender.infrastructure.TenderOrganizationRepository;
import com.docsbot.ops.tender.infrastructure.TenderRepository;

@Service
@Profile("postgres")
public class TelegramTenderService {

    public static final List<String> INTERNAL_UNITS = List.of(
            "MOBIT",
            "STOK_ENERJI",
            "DEPART",
            "AREA",
            "MOBISER");
    private static final Set<String> INTERNAL_UNIT_SET = Set.copyOf(INTERNAL_UNITS);
    private static final ZoneId ISTANBUL = ZoneId.of("Europe/Istanbul");
    private static final DateTimeFormatter DATE_CODE = DateTimeFormatter.BASIC_ISO_DATE;

    private final TelegramChatBindingRepository bindingRepository;
    private final TelegramChatSetupRepository setupRepository;
    private final TenderRepository tenderRepository;
    private final TenderOrganizationRepository organizationRepository;
    private final TenderDocumentRepository documentRepository;
    private final TenderClassifier classifier;

    public TelegramTenderService(
            TelegramChatBindingRepository bindingRepository,
            TelegramChatSetupRepository setupRepository,
            TenderRepository tenderRepository,
            TenderOrganizationRepository organizationRepository,
            TenderDocumentRepository documentRepository,
            TenderClassifier classifier
    ) {
        this.bindingRepository = bindingRepository;
        this.setupRepository = setupRepository;
        this.tenderRepository = tenderRepository;
        this.organizationRepository = organizationRepository;
        this.documentRepository = documentRepository;
        this.classifier = classifier;
    }

    @Transactional
    public TelegramChatSetup selectUnit(
            String chatId,
            String chatTitle,
            String unitValue
    ) {
        String unit = classifier.normalizeCode(unitValue);
        if (!INTERNAL_UNIT_SET.contains(unit)) {
            throw new ErpExceptions.BadRequest("Bilinmeyen şirket kolu");
        }
        TelegramChatSetup setup = setupRepository.findByChatId(chatId)
                .orElseGet(() -> TelegramChatSetup.selectUnit(chatId, chatTitle, unit));
        setup.update(chatTitle, unit);
        return setupRepository.saveAndFlush(setup);
    }

    public TelegramChatSetup setup(String chatId) {
        return setupRepository.findByChatId(chatId).orElse(null);
    }

    public Page<TenderOrganization> organizations(int page) {
        return organizationRepository.findByActiveOrderByNameAsc(
                1,
                PageRequest.of(Math.max(0, page), 5));
    }

    public List<TenderOrganization> searchOrganizations(String query) {
        String value = query == null ? "" : query.trim();
        if (value.length() < 2) {
            throw new ErpExceptions.BadRequest("Arama için en az 2 karakter yazın.");
        }
        return organizationRepository
                .findTop10ByActiveAndNameContainingIgnoreCaseOrderByNameAsc(1, value);
    }

    @Transactional
    public TenderOrganization addOrganization(String name) {
        String normalizedName = name == null ? "" : name.trim();
        if (normalizedName.length() < 2 || normalizedName.length() > 255) {
            throw new ErpExceptions.BadRequest("Şirket adı 2-255 karakter olmalıdır.");
        }
        String code = classifier.normalizeCode(normalizedName);
        if (code.isBlank()) {
            throw new ErpExceptions.BadRequest("Geçerli bir şirket adı yazın.");
        }
        return organizationRepository.findByCode(code)
                .or(() -> organizationRepository.findByNameIgnoreCase(normalizedName))
                .orElseGet(() -> organizationRepository.saveAndFlush(
                        TenderOrganization.active(code, normalizedName)));
    }

    @Transactional
    public Tender selectOrganization(
            String chatId,
            String chatTitle,
            long organizationId
    ) {
        TelegramChatSetup setup = setupRepository.findByChatId(chatId)
                .filter(value -> value.getInternalUnit() != null)
                .orElseThrow(() -> new ErpExceptions.BadRequest(
                        "Kurulum eksik. Önce /unit kullanın."));
        TenderOrganization organization = organizationRepository.findById(organizationId)
                .filter(value -> value.getActive() == 1)
                .orElseThrow(() -> new ErpExceptions.BadRequest("Şirket bulunamadı"));

        LocalDate today = LocalDate.now(ISTANBUL);
        String code = classifier.normalizeCode(organization.getCode());
        String prefix = "%s-%d-%s-".formatted(
                code,
                today.getYear(),
                DATE_CODE.format(today));
        int sequence = tenderRepository.findAllByTenderIdStartingWith(prefix).stream()
                .map(Tender::getTenderId)
                .mapToInt(this::suffixSequence)
                .max()
                .orElse(0) + 1;
        Tender tender = tenderRepository.saveAndFlush(Tender.create(
                prefix + "%03d".formatted(sequence),
                code,
                today.getYear(),
                sequence,
                setup.getInternalUnit(),
                chatTitle,
                Instant.now()));

        TelegramChatBinding binding = bindingRepository.findByChatId(chatId)
                .orElseGet(() -> TelegramChatBinding.bind(
                        chatId,
                        chatTitle,
                        tender.getTenderId()));
        binding.rebind(chatTitle, tender.getTenderId());
        bindingRepository.saveAndFlush(binding);
        return tender;
    }

    public Tender boundTender(String chatId) {
        TelegramChatBinding binding = bindingRepository.findByChatId(chatId).orElse(null);
        if (binding == null) return null;
        return tenderRepository.findByTenderId(binding.getTenderId()).orElse(null);
    }

    public TelegramChatBinding binding(String chatId) {
        return bindingRepository.findByChatId(chatId).orElse(null);
    }

    public List<TenderDocument> recentDocuments(String tenderId) {
        return documentRepository.findTop10ByTenderIdOrderByTimestampDescIdDesc(tenderId);
    }

    public List<TenderDocument> allDocuments(String tenderId) {
        return documentRepository.findAllByTenderIdOrderByTimestampDescIdDesc(tenderId);
    }

    private int suffixSequence(String tenderId) {
        int separator = tenderId.lastIndexOf('-');
        if (separator < 0) return 0;
        try {
            return Integer.parseInt(tenderId.substring(separator + 1));
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }
}
