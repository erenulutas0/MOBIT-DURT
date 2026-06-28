package com.docsbot.ops.dashboard;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonProperty;

public final class DashboardDtos {
    private DashboardDtos() {
    }

    public record TreeNode(
            String name,
            String path,
            String type,
            Long size,
            @JsonProperty("download_url") String downloadUrl,
            @JsonProperty("view_url") String viewUrl,
            List<TreeNode> children
    ) {
    }

    public record TreeResponse(
            @JsonProperty("data_originals") TreeNode dataOriginals,
            @JsonProperty("obsidian_vault") TreeNode obsidianVault
    ) {
    }

    public record VaultNote(
            String name,
            String path,
            String updated,
            @JsonProperty("linked_files") long linkedFiles,
            List<String> tags
    ) {
    }

    public record VaultNotesResponse(
            @JsonProperty("vault_root") String vaultRoot,
            List<VaultNote> notes
    ) {
    }

    public record VaultNoteContent(String path, String content) {
    }
}
