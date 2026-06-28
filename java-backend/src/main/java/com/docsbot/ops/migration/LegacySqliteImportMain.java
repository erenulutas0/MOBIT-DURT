package com.docsbot.ops.migration;

import java.nio.file.Path;

import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;

import com.docsbot.ops.DocsBotApplication;

public final class LegacySqliteImportMain {

    private LegacySqliteImportMain() {
    }

    public static void main(String[] args) {
        Path source = args.length > 0
                ? Path.of(args[0])
                : Path.of("..", "data", "db.sqlite3");
        try (var context = new SpringApplicationBuilder(DocsBotApplication.class)
                .profiles("postgres")
                .web(WebApplicationType.NONE)
                .run()) {
            LegacySqliteImportService.ImportReport report =
                    context.getBean(LegacySqliteImportService.class)
                            .importDatabase(source);
            System.out.printf(
                    "Legacy import complete: documents=%d tenders=%d bindings=%d "
                            + "setups=%d organizations=%d skipped=%d checksum=%s%n",
                    report.documentsInserted(),
                    report.tendersInserted(),
                    report.bindingsInserted(),
                    report.setupsInserted(),
                    report.organizationsInserted(),
                    report.skippedRows(),
                    report.sourceChecksum());
        }
    }
}
