package com.docsbot.ops.telegram;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.context.annotation.Profile;
import org.springframework.data.domain.Sort;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.docsbot.ops.telegram.domain.TelegramChatBinding;
import com.docsbot.ops.telegram.domain.TelegramChatSetup;
import com.docsbot.ops.telegram.infrastructure.TelegramChatBindingRepository;
import com.docsbot.ops.telegram.infrastructure.TelegramChatSetupRepository;

@RestController
@RequestMapping("/telegram/chats")
@Profile("postgres")
public class TelegramChatAdminController {

    private final TelegramChatSetupRepository setupRepository;
    private final TelegramChatBindingRepository bindingRepository;

    public TelegramChatAdminController(
            TelegramChatSetupRepository setupRepository,
            TelegramChatBindingRepository bindingRepository
    ) {
        this.setupRepository = setupRepository;
        this.bindingRepository = bindingRepository;
    }

    @GetMapping
    List<TelegramChatResponse> chats() {
        Map<String, TelegramChatRow> rows = new LinkedHashMap<>();
        setupRepository.findAll(Sort.by(Sort.Order.desc("updatedAt"))).forEach(setup ->
                rows.computeIfAbsent(setup.getChatId(), TelegramChatRow::new).setup = setup);
        bindingRepository.findAll(Sort.by(Sort.Order.desc("updatedAt"))).forEach(binding ->
                rows.computeIfAbsent(binding.getChatId(), TelegramChatRow::new).binding = binding);
        return rows.values().stream()
                .map(TelegramChatResponse::from)
                .sorted((left, right) -> right.updatedAt().compareTo(left.updatedAt()))
                .toList();
    }

    @PutMapping("/{chatId}/setup")
    TelegramChatResponse setup(
            @PathVariable String chatId,
            @Valid @RequestBody ChatSetupRequest request
    ) {
        TelegramChatSetup setup = setupRepository.findByChatId(chatId)
                .orElseGet(() -> TelegramChatSetup.selectUnit(
                        chatId,
                        normalized(request.chatTitle()),
                        request.internalUnit()));
        setup.update(normalized(request.chatTitle()), request.internalUnit());
        setupRepository.saveAndFlush(setup);
        return response(chatId);
    }

    @PutMapping("/{chatId}/binding")
    TelegramChatResponse binding(
            @PathVariable String chatId,
            @Valid @RequestBody ChatBindingRequest request
    ) {
        TelegramChatSetup setup = setupRepository.findByChatId(chatId).orElse(null);
        String title = normalized(request.chatTitle());
        if (title == null && setup != null) {
            title = setup.getChatTitle();
        }
        String bindingTitle = title;
        TelegramChatBinding binding = bindingRepository.findByChatId(chatId)
                .orElseGet(() -> TelegramChatBinding.bind(chatId, bindingTitle, request.tenderId()));
        binding.rebind(bindingTitle, request.tenderId());
        bindingRepository.saveAndFlush(binding);
        return response(chatId);
    }

    @DeleteMapping("/{chatId}/binding")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteBinding(@PathVariable String chatId) {
        bindingRepository.findByChatId(chatId).ifPresent(bindingRepository::delete);
    }

    @DeleteMapping("/{chatId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void deleteChat(@PathVariable String chatId) {
        bindingRepository.findByChatId(chatId).ifPresent(bindingRepository::delete);
        setupRepository.findByChatId(chatId).ifPresent(setupRepository::delete);
    }

    private TelegramChatResponse response(String chatId) {
        TelegramChatRow row = new TelegramChatRow(chatId);
        row.setup = setupRepository.findByChatId(chatId).orElse(null);
        row.binding = bindingRepository.findByChatId(chatId).orElse(null);
        return TelegramChatResponse.from(row);
    }

    private static String normalized(String value) {
        return value == null || value.isBlank() ? null : String.join(" ", value.trim().split("\\s+"));
    }

    private static final class TelegramChatRow {
        private final String chatId;
        private TelegramChatSetup setup;
        private TelegramChatBinding binding;

        private TelegramChatRow(String chatId) {
            this.chatId = chatId;
        }
    }

    record TelegramChatResponse(
            String chatId,
            String chatTitle,
            String internalUnit,
            String tenderId,
            Instant setupUpdatedAt,
            Instant bindingUpdatedAt,
            Instant updatedAt
    ) {
        static TelegramChatResponse from(TelegramChatRow row) {
            String title = row.setup != null && row.setup.getChatTitle() != null
                    ? row.setup.getChatTitle()
                    : row.binding == null ? null : row.binding.getChatTitle();
            Instant setupUpdatedAt = row.setup == null ? Instant.EPOCH : row.setup.getUpdatedAt();
            Instant bindingUpdatedAt = row.binding == null ? Instant.EPOCH : row.binding.getUpdatedAt();
            Instant updatedAt = setupUpdatedAt.compareTo(bindingUpdatedAt) >= 0
                    ? setupUpdatedAt
                    : bindingUpdatedAt;
            return new TelegramChatResponse(
                    row.chatId,
                    title,
                    row.setup == null ? null : row.setup.getInternalUnit(),
                    row.binding == null ? null : row.binding.getTenderId(),
                    row.setup == null ? null : row.setup.getUpdatedAt(),
                    row.binding == null ? null : row.binding.getUpdatedAt(),
                    updatedAt);
        }
    }

    record ChatSetupRequest(
            @Size(max = 255) String chatTitle,
            @NotBlank @Size(max = 64) String internalUnit
    ) {
    }

    record ChatBindingRequest(
            @Size(max = 255) String chatTitle,
            @NotBlank @Size(max = 128) String tenderId
    ) {
    }
}
