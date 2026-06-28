package com.docsbot.ops.dashboard;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.context.annotation.Profile;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.docsbot.ops.erp.application.ErpPrincipal;
import com.docsbot.ops.tender.DocumentWorkspaceService;

@RestController
@Profile("postgres")
public class DashboardController {

    private final DashboardFileService fileService;
    private final DashboardFileAuditRecorder auditRecorder;
    private final DocumentWorkspaceService workspaceService;

    public DashboardController(
            DashboardFileService fileService,
            DashboardFileAuditRecorder auditRecorder,
            DocumentWorkspaceService workspaceService
    ) {
        this.fileService = fileService;
        this.auditRecorder = auditRecorder;
        this.workspaceService = workspaceService;
    }

    @GetMapping("/dashboard/tree")
    DashboardDtos.TreeResponse tree() {
        return fileService.tree();
    }

    @GetMapping("/dashboard/vault/notes")
    DashboardDtos.VaultNotesResponse notes() {
        return fileService.vaultNotes();
    }

    @GetMapping("/dashboard/vault/note")
    DashboardDtos.VaultNoteContent note(@RequestParam String path) {
        return fileService.vaultNote(path);
    }

    @GetMapping("/dashboard/vault/notes/{*notePath}")
    DashboardDtos.VaultNoteContent legacyNote(@PathVariable String notePath) {
        return fileService.vaultNote(notePath);
    }

    @GetMapping("/dashboard/files/{documentId}")
    ResponseEntity<Resource> downloadDocument(JwtAuthenticationToken authentication, @PathVariable long documentId) {
        DashboardFileService.StoredFile file = fileService.documentFile(documentId);
        ErpPrincipal principal = ErpPrincipal.from(authentication);
        workspaceService.recordAccess(principal, documentId);
        auditRecorder.record(
                principal,
                "admin_file_download",
                "tender_document",
                Long.toString(documentId));
        return fileResponse(file, true);
    }

    @GetMapping("/dashboard/files/{documentId}/view")
    ResponseEntity<Resource> viewDocument(JwtAuthenticationToken authentication, @PathVariable long documentId) {
        DashboardFileService.StoredFile file = fileService.documentFile(documentId);
        ErpPrincipal principal = ErpPrincipal.from(authentication);
        workspaceService.recordAccess(principal, documentId);
        auditRecorder.record(
                principal,
                "admin_file_view",
                "tender_document",
                Long.toString(documentId));
        return fileResponse(file, false);
    }

    @GetMapping("/dashboard/tree-file")
    ResponseEntity<Resource> treeFile(
            JwtAuthenticationToken authentication,
            @RequestParam(name = "root_key") String rootKey,
            @RequestParam String path,
            @RequestParam(defaultValue = "false") boolean download
    ) {
        DashboardFileService.StoredFile file = fileService.treeFile(rootKey, path);
        auditRecorder.record(
                ErpPrincipal.from(authentication),
                download ? "admin_file_download" : "admin_file_view",
                "dashboard_tree_file",
                rootKey + ":" + path);
        return fileResponse(file, download);
    }

    private ResponseEntity<Resource> fileResponse(
            DashboardFileService.StoredFile file,
            boolean download
    ) {
        ContentDisposition disposition = (download
                ? ContentDisposition.attachment()
                : ContentDisposition.inline())
                .filename(file.filename())
                .build();
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(file.contentType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
                .body(new FileSystemResource(file.path()));
    }
}
