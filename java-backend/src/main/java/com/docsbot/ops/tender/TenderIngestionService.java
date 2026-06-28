package com.docsbot.ops.tender;

import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.HexFormat;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.context.annotation.Profile;

import com.docsbot.ops.erp.application.ErpExceptions;
import com.docsbot.ops.common.config.DocsBotProperties;
import com.docsbot.ops.tender.domain.Tender;
import com.docsbot.ops.tender.domain.TenderDocument;
import com.docsbot.ops.tender.domain.TenderOrganization;
import com.docsbot.ops.tender.infrastructure.TenderDocumentRepository;
import com.docsbot.ops.tender.infrastructure.TenderOrganizationRepository;
import com.docsbot.ops.tender.infrastructure.TenderRepository;

@Service
@Profile("postgres")
public class TenderIngestionService {

    private static final Set<String> INTERNAL_UNITS = Set.of(
            "MOBIT",
            "STOK_ENERJI",
            "DEPART",
            "AREA",
            "MOBISER");
    private static final DateTimeFormatter DATE_CODE = DateTimeFormatter.BASIC_ISO_DATE;

    private final TenderRepository tenderRepository;
    private final TenderDocumentRepository documentRepository;
    private final TenderClassifier classifier;
    private final TenderFileStorage storage;
    private final TenderVaultWriter vaultWriter;
    private final TenderOrganizationRepository organizationRepository;
    private final String phoneHashSalt;

    public TenderIngestionService(
            TenderRepository tenderRepository,
            TenderDocumentRepository documentRepository,
            TenderClassifier classifier,
            TenderFileStorage storage,
            TenderVaultWriter vaultWriter,
            TenderOrganizationRepository organizationRepository,
            DocsBotProperties properties
    ) {
        this.tenderRepository = tenderRepository;
        this.documentRepository = documentRepository;
        this.classifier = classifier;
        this.storage = storage;
        this.vaultWriter = vaultWriter;
        this.organizationRepository = organizationRepository;
        this.phoneHashSalt = properties.phoneHashSalt();
    }

    @Transactional
    public TenderDocument upload(
            MultipartFile file,
            String internalUnitValue,
            String organizationValue,
            Integer year,
            String tenderIdValue,
            String caption
    ) {
        String internalUnit = classifier.normalizeCode(internalUnitValue);
        if (!INTERNAL_UNITS.contains(internalUnit)) {
            throw new ErpExceptions.BadRequest("Unknown internal unit");
        }
        String organization = classifier.normalizeCode(organizationValue);
        if (organization.isBlank()) {
            throw new ErpExceptions.BadRequest("Organization is required");
        }
        int selectedYear = year == null ? LocalDate.now(ZoneOffset.UTC).getYear() : year;
        if (selectedYear < 2000 || selectedYear > 2100) {
            throw new ErpExceptions.BadRequest("Year is outside the supported range");
        }

        Tender tender = resolveTender(
                tenderIdValue,
                internalUnit,
                organization,
                selectedYear);
        TenderFileStorage.PreparedFile prepared = storage.prepare(file);
        return persist(
                prepared,
                tender,
                "dashboard:" + UUID.randomUUID(),
                "dashboard-upload",
                "dashboard",
                "dashboard:" + UUID.randomUUID(),
                Instant.now(),
                caption);
    }

    public boolean alreadyProcessed(String messageId) {
        return documentRepository.findFirstByMessageId(messageId).isPresent();
    }

    @Transactional
    public TenderDocument ingestTelegram(
            Tender tender,
            String messageId,
            String senderId,
            Instant timestamp,
            String mediaId,
            String filename,
            String mimeType,
            String caption,
            byte[] content
    ) {
        TenderDocument existing = documentRepository.findFirstByMessageId(messageId)
                .orElse(null);
        if (existing != null) return existing;
        String effectiveFilename = filename;
        if (effectiveFilename == null || effectiveFilename.isBlank()) {
            effectiveFilename = "telegram-media-" + safeMediaStem(mediaId)
                    + extensionFor(mimeType);
        }
        TenderFileStorage.PreparedFile prepared =
                storage.prepare(content, effectiveFilename, mimeType);
        return persist(
                prepared,
                tender,
                messageId,
                senderHash(senderId),
                "telegram",
                mediaId,
                timestamp,
                caption);
    }

    private TenderDocument persist(
            TenderFileStorage.PreparedFile prepared,
            Tender tender,
            String messageId,
            String senderHash,
            String source,
            String mediaId,
            Instant timestamp,
            String caption
    ) {
        List<TenderDocument> duplicates =
                documentRepository.findAllByChecksumAndTenderIdOrderByIdDesc(
                        prepared.checksum(),
                        tender.getTenderId());
        TenderDocument reusable = duplicates.stream()
                .filter(candidate -> candidate.getFilePath() != null)
                .filter(candidate -> storage.exists(candidate.getFilePath()))
                .findFirst()
                .orElse(null);

        TenderFileStorage.StoredFile stored = null;
        String filePath;
        String storedFilename;
        String status;
        if (reusable != null) {
            filePath = reusable.getFilePath();
            storedFilename = reusable.getStoredFilename();
            status = "duplicate";
        } else {
            stored = storage.store(
                    prepared,
                    tender.getYear(),
                    tender.getInternalUnit(),
                    tender.getOrganization(),
                    tender.getTenderId());
            filePath = stored.relativePath();
            storedFilename = stored.storedFilename();
            status = "stored";
        }

        try {
            TenderDocument document = documentRepository.saveAndFlush(
                    TenderDocument.ingested(
                            messageId,
                            senderHash,
                            source,
                            timestamp,
                            mediaId,
                            prepared.contentType(),
                            prepared.originalFilename(),
                            storedFilename,
                            blankToNull(caption),
                            prepared.checksum(),
                            filePath,
                            prepared.content().length,
                            tender.getInternalUnit(),
                            tender.getOrganization(),
                            tender.getYear(),
                            tender.getTenderId(),
                            classifier.documentType(prepared.originalFilename(), caption),
                            status));
            vaultWriter.writeDocument(document);
            return document;
        } catch (RuntimeException exception) {
            if (stored != null && Files.isRegularFile(stored.absolutePath())) {
                storage.delete(stored);
            }
            throw exception;
        }
    }

    private String senderHash(String senderId) {
        try {
            byte[] value = ((phoneHashSalt == null ? "" : phoneHashSalt)
                    + ":" + senderId).getBytes(StandardCharsets.UTF_8);
            return HexFormat.of().formatHex(
                    MessageDigest.getInstance("SHA-256").digest(value));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private String extensionFor(String mimeType) {
        if (mimeType == null) return ".bin";
        return switch (mimeType.toLowerCase()) {
            case "image/jpeg" -> ".jpg";
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            case "application/pdf" -> ".pdf";
            case "application/msword" -> ".doc";
            case "application/vnd.openxmlformats-officedocument.wordprocessingml.document" -> ".docx";
            case "application/vnd.ms-excel" -> ".xls";
            case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" -> ".xlsx";
            case "text/plain" -> ".txt";
            case "text/csv" -> ".csv";
            default -> ".bin";
        };
    }

    private String safeMediaStem(String mediaId) {
        String value = mediaId == null
                ? ""
                : mediaId.replaceAll("[^A-Za-z0-9]", "");
        if (value.isBlank()) return UUID.randomUUID().toString().substring(0, 12);
        return value.substring(0, Math.min(12, value.length()));
    }

    private Tender resolveTender(
            String tenderIdValue,
            String internalUnit,
            String organization,
            int year
    ) {
        String selectedTenderId = tenderIdValue == null ? "" : tenderIdValue.trim();
        if (!selectedTenderId.isBlank()) {
            Tender tender = tenderRepository.findByTenderId(selectedTenderId)
                    .orElseThrow(() -> new ErpExceptions.BadRequest("Tender not found"));
            if (!organization.equals(classifier.normalizeCode(tender.getOrganization()))
                    || !internalUnit.equals(classifier.normalizeCode(tender.getInternalUnit()))
                    || year != tender.getYear()) {
                throw new ErpExceptions.BadRequest(
                        "Tender does not match the selected organization, unit and year");
            }
            return tender;
        }

        LocalDate date = LocalDate.now(ZoneOffset.UTC);
        String prefix = "%s-%d-%s-".formatted(
                organization,
                year,
                DATE_CODE.format(date));
        int sequence = tenderRepository.findAllByTenderIdStartingWith(prefix).stream()
                .map(Tender::getSequence)
                .max(Integer::compareTo)
                .orElse(0) + 1;
        Tender tender = tenderRepository.saveAndFlush(
                Tender.create(
                        prefix + "%03d".formatted(sequence),
                        organization,
                        year,
                        sequence,
                        internalUnit,
                        organization + " " + year + " ihalesi",
                        Instant.now()));
        organizationRepository.findByCode(organization)
                .orElseGet(() -> organizationRepository.saveAndFlush(
                        TenderOrganization.active(organization, organization)));
        return tender;
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
