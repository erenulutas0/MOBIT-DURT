package com.docsbot.ops.tender;

import java.text.Normalizer;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.stereotype.Component;

@Component
public class TenderClassifier {

    private static final Map<String, List<String>> DOCUMENT_TYPES = new LinkedHashMap<>();

    static {
        DOCUMENT_TYPES.put("technical_spec", List.of(
                "technical specification", "teknik sartname"));
        DOCUMENT_TYPES.put("administrative_spec", List.of(
                "administrative specification", "idari sartname"));
        DOCUMENT_TYPES.put("proposal", List.of("proposal", "teklif"));
        DOCUMENT_TYPES.put("contract", List.of("contract", "sozlesme"));
        DOCUMENT_TYPES.put("quantity_takeoff", List.of(
                "quantity", "takeoff", "metraj", "kesif", "boq"));
        DOCUMENT_TYPES.put("guarantee", List.of("guarantee", "garanti", "teminat"));
    }

    public String documentType(String filename, String caption) {
        String text = normalize(String.join(
                " ",
                filename == null ? "" : filename,
                caption == null ? "" : caption));
        for (Map.Entry<String, List<String>> entry : DOCUMENT_TYPES.entrySet()) {
            if (entry.getValue().stream().anyMatch(alias -> matches(text, alias))) {
                return entry.getKey();
            }
        }
        return "unknown";
    }

    public String normalizeCode(String value) {
        String normalized = normalize(value).replace(' ', '_').toUpperCase(Locale.ROOT);
        normalized = normalized.replaceAll("[^A-Z0-9_-]", "");
        return normalized.substring(0, Math.min(normalized.length(), 64));
    }

    private boolean matches(String text, String alias) {
        String normalizedAlias = normalize(alias);
        return text.contains(normalizedAlias)
                || text.replace(" ", "").contains(normalizedAlias.replace(" ", ""));
    }

    private String normalize(String value) {
        String separated = value.replaceAll(
                "([a-zçğıöşü])([A-ZÇĞİÖŞÜ])",
                "$1 $2");
        String decomposed = Normalizer.normalize(
                separated.toLowerCase(Locale.forLanguageTag("tr")),
                Normalizer.Form.NFKD);
        String withoutMarks = Pattern.compile("\\p{M}+").matcher(decomposed).replaceAll("");
        return withoutMarks
                .replace('ı', 'i')
                .replaceAll("[^a-z0-9]+", " ")
                .trim();
    }

}
