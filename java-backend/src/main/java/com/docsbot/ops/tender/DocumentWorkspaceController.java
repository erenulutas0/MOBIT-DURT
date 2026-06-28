package com.docsbot.ops.tender;

import java.time.Clock;
import java.util.List;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;

import org.springframework.context.annotation.Profile;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.docsbot.ops.dashboard.DashboardFileService;
import com.docsbot.ops.erp.application.ErpPrincipal;
import com.fasterxml.jackson.annotation.JsonProperty;

@RestController
@Profile("postgres")
public class DocumentWorkspaceController {
    private final DocumentWorkspaceService workspaceService;
    private final DashboardFileService fileService;
    private final Clock clock;

    public DocumentWorkspaceController(
            DocumentWorkspaceService workspaceService,
            DashboardFileService fileService
    ) {
        this.workspaceService = workspaceService;
        this.fileService = fileService;
        this.clock = Clock.systemUTC();
    }

    @GetMapping("/documents/favorites")
    List<TenderDtos.DocumentWorkspaceResponse> favorites(JwtAuthenticationToken authentication) {
        return workspaceService.favorites(ErpPrincipal.from(authentication)).stream()
                .map(TenderDtos.DocumentWorkspaceResponse::from)
                .toList();
    }

    @GetMapping("/documents/recent")
    List<TenderDtos.DocumentWorkspaceResponse> recent(
            JwtAuthenticationToken authentication,
            @RequestParam(defaultValue = "20") int limit
    ) {
        return workspaceService.recent(ErpPrincipal.from(authentication), limit).stream()
                .map(TenderDtos.DocumentWorkspaceResponse::from)
                .toList();
    }

    @PutMapping("/documents/{documentId}/favorite")
    TenderDtos.DocumentWorkspaceResponse favorite(
            JwtAuthenticationToken authentication,
            @PathVariable long documentId,
            @RequestBody FavoriteRequest request
    ) {
        return TenderDtos.DocumentWorkspaceResponse.from(workspaceService.setFavorite(
                ErpPrincipal.from(authentication),
                documentId,
                request.favorite()));
    }

    @PostMapping("/documents/{documentId}/share-links")
    TenderDtos.CreatedDocumentShareLinkResponse createShareLink(
            JwtAuthenticationToken authentication,
            @PathVariable long documentId,
            @Valid @RequestBody CreateShareLinkRequest request
    ) {
        var created = workspaceService.createShareLink(
                ErpPrincipal.from(authentication),
                documentId,
                request.expiresInHours());
        return new TenderDtos.CreatedDocumentShareLinkResponse(
                TenderDtos.DocumentShareLinkResponse.from(created.link(), clock.instant()),
                "/shared/documents/" + created.token());
    }

    @GetMapping("/documents/{documentId}/share-links")
    List<TenderDtos.DocumentShareLinkResponse> shareLinks(
            JwtAuthenticationToken authentication,
            @PathVariable long documentId
    ) {
        return workspaceService.shareLinks(ErpPrincipal.from(authentication), documentId).stream()
                .map(link -> TenderDtos.DocumentShareLinkResponse.from(link, clock.instant()))
                .toList();
    }

    @DeleteMapping("/documents/share-links/{shareLinkId}")
    TenderDtos.DocumentShareLinkResponse revokeShareLink(
            JwtAuthenticationToken authentication,
            @PathVariable long shareLinkId
    ) {
        return TenderDtos.DocumentShareLinkResponse.from(
                workspaceService.revokeShareLink(ErpPrincipal.from(authentication), shareLinkId),
                clock.instant());
    }

    @GetMapping("/shared/documents/{token}")
    ResponseEntity<Resource> sharedDocument(
            @PathVariable String token,
            @RequestParam(defaultValue = "false") boolean download
    ) {
        long documentId = workspaceService.resolveSharedDocument(token);
        return fileResponse(fileService.documentFile(documentId), download);
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

    record FavoriteRequest(boolean favorite) {
    }

    record CreateShareLinkRequest(
            @JsonProperty("expires_in_hours")
            @Min(1)
            @Max(720)
            int expiresInHours
    ) {
        CreateShareLinkRequest {
            if (expiresInHours == 0) {
                expiresInHours = 24;
            }
        }
    }
}
