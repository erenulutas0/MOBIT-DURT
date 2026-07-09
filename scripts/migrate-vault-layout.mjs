#!/usr/bin/env node
/**
 * Re-files the Obsidian vault into the canonical layout:
 *
 *   vault/ihaleler/{year}/{INTERNAL_UNIT}/{ORGANIZATION}/{tender_id}/...
 *
 * The vault historically holds three layouts ({year}/{org}, {unit}/{year}/{org},
 * unclassified/unclassified) plus Turkish-character duplicate organization
 * directories (BEDAS vs BEDAŞ). Unit/organization directory names are normalized
 * with the same transliteration as the Java TenderVaultWriter; tender directory
 * names and note filenames are left untouched, so [[wikilinks]] keep working.
 *
 * Also, per note (apply mode):
 *   - backfills missing `internal_unit:` frontmatter (UNCLASSIFIED when unknown)
 *   - fixes non-numeric `year:` frontmatter from the tender id
 *   - backfills `tags:` on tender and document notes
 *   - regenerates the AUTO:DOCUMENTS block after merges
 *   - writes `_index.md` files (root + per year) with Dataview tables
 *
 * Usage:
 *   node scripts/migrate-vault-layout.mjs           # dry run (default): prints the plan
 *   node scripts/migrate-vault-layout.mjs --apply   # makes a backup, then applies
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APPLY = process.argv.includes("--apply");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VAULT = path.join(ROOT, "vault");
const IHALELER = path.join(VAULT, "ihaleler");

const DOCUMENTS_START = "<!-- AUTO:DOCUMENTS:START -->";
const DOCUMENTS_END = "<!-- AUTO:DOCUMENTS:END -->";
const INDEX_START = "<!-- AUTO:INDEX:START -->";
const INDEX_END = "<!-- AUTO:INDEX:END -->";

const TURKISH_MAP = { ı: "i", İ: "I", ş: "s", Ş: "S", ğ: "g", Ğ: "G", ü: "u", Ü: "U", ö: "o", Ö: "O", ç: "c", Ç: "C" };

function vaultSegment(value) {
  if (!value || !String(value).trim()) return "UNCLASSIFIED";
  const mapped = String(value).trim().replace(/[ıİşŞğĞüÜöÖçÇ]/g, (ch) => TURKISH_MAP[ch]);
  const ascii = mapped.normalize("NFD").replace(/\p{M}/gu, "");
  const segment = ascii.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return segment || "UNCLASSIFIED";
}

const tagSlug = (value) => vaultSegment(value).toLowerCase();

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) result[kv[1]] = kv[2].trim();
  }
  return result;
}

function upsertFrontmatterField(content, key, value) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return content;
  const body = match[1];
  const line = `${key}: ${value}`;
  const updated = new RegExp(`^${key}:.*$`, "m").test(body)
    ? body.replace(new RegExp(`^${key}:.*$`, "m"), line)
    : body + "\n" + line;
  return content.replace(match[0], `---\n${updated}\n---`);
}

/** Finds tender directories: any directory whose own .md note carries a tender_id. */
function findTenderDirs(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (!statSync(full).isDirectory()) continue;
    if (entry === "documents") continue;
    const note = path.join(full, `${entry}.md`);
    if (existsSync(note)) {
      found.push(full);
    } else {
      findTenderDirs(full, found);
    }
  }
  return found;
}

function canonicalTarget(tenderDir) {
  const name = path.basename(tenderDir);
  const note = readFileSync(path.join(tenderDir, `${name}.md`), "utf8");
  const fm = parseFrontmatter(note);

  let year = /^\d{4}$/.test(fm.year || "") ? fm.year : null;
  if (!year) year = (fm.tender_id || name).match(/(20\d{2})/)?.[1] || "unknown";

  const unit = vaultSegment(fm.internal_unit);
  const org = vaultSegment(fm.organization || (fm.tender_id || name).split("-")[0]);
  return { target: path.join(IHALELER, year, unit, org, name), year, unit, org, frontmatter: fm };
}

function listMarkdown(dir) {
  return existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".md")) : [];
}

function regenerateDocumentsBlock(tenderDir) {
  const name = path.basename(tenderDir);
  const notePath = path.join(tenderDir, `${name}.md`);
  if (!existsSync(notePath)) return;
  const links = listMarkdown(path.join(tenderDir, "documents"))
    .sort()
    .map((f) => f.replace(/\.md$/, ""))
    .map((n) => `- [[documents/${n}|${n}]]`)
    .join("\n");
  const block = `${DOCUMENTS_START}\n${links ? links + "\n" : ""}${DOCUMENTS_END}`;
  const content = readFileSync(notePath, "utf8");
  const pattern = new RegExp(`${DOCUMENTS_START}[\\s\\S]*?${DOCUMENTS_END}`);
  const updated = pattern.test(content)
    ? content.replace(pattern, block)
    : content.trimEnd() + "\n\n" + block;
  writeFileSync(notePath, updated.trimEnd() + "\n", "utf8");
}

function mergeInto(sourceDir, targetDir, log) {
  const sourceDocs = path.join(sourceDir, "documents");
  const targetDocs = path.join(targetDir, "documents");
  mkdirSync(targetDocs, { recursive: true });
  let copied = 0;
  for (const file of listMarkdown(sourceDocs)) {
    const destination = path.join(targetDocs, file);
    if (!existsSync(destination)) {
      cpSync(path.join(sourceDocs, file), destination);
      copied++;
    }
  }
  log.push(`  MERGE ${rel(sourceDir)} -> ${rel(targetDir)} (${copied} document note(s) copied)`);
}

function backfillNote(tenderDir, meta, log) {
  const name = path.basename(tenderDir);
  const notePath = path.join(tenderDir, `${name}.md`);
  let content = readFileSync(notePath, "utf8");
  const fm = parseFrontmatter(content);
  let changed = false;
  if (!fm.internal_unit) {
    content = upsertFrontmatterField(content, "internal_unit", meta.unit);
    changed = true;
  }
  if (!/^\d{4}$/.test(fm.year || "")) {
    content = upsertFrontmatterField(content, "year", meta.year);
    changed = true;
  }
  if (!fm.tags) {
    content = upsertFrontmatterField(content, "tags", `[tender, ${tagSlug(meta.unit)}, ${tagSlug(meta.org)}]`);
    changed = true;
  }
  if (changed) {
    writeFileSync(notePath, content, "utf8");
    log.push(`  BACKFILL ${rel(notePath)}`);
  }
  for (const file of listMarkdown(path.join(tenderDir, "documents"))) {
    const documentPath = path.join(tenderDir, "documents", file);
    let documentContent = readFileSync(documentPath, "utf8");
    const documentFm = parseFrontmatter(documentContent);
    if (!documentFm.tags) {
      const documentType = tagSlug(documentFm.document_type || "unknown");
      documentContent = upsertFrontmatterField(
        documentContent,
        "tags",
        `[document, ${documentType}, ${tagSlug(meta.unit)}, ${tagSlug(meta.org)}]`
      );
      writeFileSync(documentPath, documentContent, "utf8");
    }
  }
}

function pruneEmptyDirs(dir) {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return;
  for (const entry of readdirSync(dir)) {
    pruneEmptyDirs(path.join(dir, entry));
  }
  if (dir !== IHALELER && readdirSync(dir).length === 0) rmdirSync(dir);
}

function writeIndexPages(log) {
  const years = readdirSync(IHALELER).filter(
    (entry) => /^\d{4}$/.test(entry) && statSync(path.join(IHALELER, entry)).isDirectory()
  );
  const rootBlock = [
    INDEX_START,
    "## Yıllar",
    "",
    ...years.sort().map((year) => `- [[ihaleler/${year}/_index|${year}]]`),
    INDEX_END,
  ].join("\n");
  writeManagedIndex(path.join(IHALELER, "_index.md"), "İhaleler", rootBlock, log);

  for (const year of years) {
    const block = [
      INDEX_START,
      "```dataview",
      `TABLE WITHOUT ID file.link AS "İhale", organization AS "Kurum", internal_unit AS "Birim", source AS "Kaynak"`,
      `FROM "ihaleler/${year}"`,
      "WHERE tender_id",
      "SORT organization ASC, file.name ASC",
      "```",
      INDEX_END,
    ].join("\n");
    writeManagedIndex(path.join(IHALELER, year, "_index.md"), `İhaleler ${year}`, block, log);
  }
}

function writeManagedIndex(indexPath, title, block, log) {
  let content;
  if (existsSync(indexPath)) {
    content = readFileSync(indexPath, "utf8");
    const pattern = new RegExp(`${INDEX_START}[\\s\\S]*?${INDEX_END}`);
    content = pattern.test(content)
      ? content.replace(pattern, block)
      : content.trimEnd() + "\n\n" + block;
  } else {
    content = `# ${title}\n\n${block}`;
  }
  writeFileSync(indexPath, content.trimEnd() + "\n", "utf8");
  log.push(`  INDEX ${rel(indexPath)}`);
}

const rel = (p) => path.relative(VAULT, p).replaceAll("\\", "/");

const listDirs = (dir) =>
  readdirSync(dir).filter((entry) => statSync(path.join(dir, entry)).isDirectory());

/**
 * Renames unit/org directories whose name differs from the canonical segment
 * (e.g. `unclassified` vs `UNCLASSIFIED`). Windows resolves paths
 * case-insensitively, so mkdir cannot fix casing — a two-step rename can.
 */
function canonicalizeSegmentCasing(apply, log) {
  for (const year of listDirs(IHALELER).filter((entry) => /^\d{4}$/.test(entry))) {
    const yearPath = path.join(IHALELER, year);
    for (const unit of listDirs(yearPath)) {
      const unitPath = fixDirName(yearPath, unit, vaultSegment(unit), apply, log);
      for (const org of listDirs(unitPath)) {
        fixDirName(unitPath, org, vaultSegment(org), apply, log);
      }
    }
  }
}

function fixDirName(parent, name, canonical, apply, log) {
  if (name === canonical) return path.join(parent, name);
  const source = path.join(parent, name);
  const target = path.join(parent, canonical);
  if (!apply) {
    log.push(`  CASEFIX ${rel(source)} -> ${rel(target)}`);
    return source;
  }
  if (readdirSync(parent).includes(canonical)) {
    // a true sibling with the canonical name exists: move children across
    for (const child of readdirSync(source)) {
      const destination = path.join(target, child);
      if (!existsSync(destination)) renameSync(path.join(source, child), destination);
    }
    if (readdirSync(source).length === 0) rmdirSync(source);
    log.push(`  CASEMERGE ${rel(source)} -> ${rel(target)}`);
    return target;
  }
  const temp = source + "__casefix";
  renameSync(source, temp);
  renameSync(temp, target);
  log.push(`  CASEFIX ${rel(source)} -> ${rel(target)}`);
  return target;
}

function main() {
  if (!existsSync(IHALELER)) {
    console.error(`Vault directory not found: ${IHALELER}`);
    process.exit(1);
  }

  if (APPLY) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupDir = path.join(ROOT, `vault_backup_${stamp}`);
    cpSync(IHALELER, path.join(backupDir, "ihaleler"), { recursive: true });
    console.log(`Backup written to ${path.relative(ROOT, backupDir)}\n`);
  }

  const casingLog = [];
  canonicalizeSegmentCasing(APPLY, casingLog);
  if (casingLog.length > 0) {
    console.log(`Segment casing ${APPLY ? "fixed" : "fixes needed"}:`);
    for (const line of casingLog) console.log(line);
    console.log("");
  }

  const tenderDirs = findTenderDirs(IHALELER);
  const moves = [];
  for (const dir of tenderDirs) {
    const { target, year, unit, org } = canonicalTarget(dir);
    moves.push({ source: dir, target, year, unit, org, conflict: dir !== target && existsSync(target) });
  }

  const pending = moves.filter((m) => m.source !== m.target);
  console.log(`Vault layout migration ${APPLY ? "(APPLY)" : "(dry run)"}`);
  console.log(`Tender directories found: ${moves.length}, needing re-file: ${pending.length}\n`);
  for (const move of moves) {
    if (move.source === move.target) {
      console.log(`  OK      ${rel(move.source)}`);
    } else {
      console.log(`  ${move.conflict ? "MERGE ->" : "MOVE ->"} ${rel(move.source)}\n           => ${rel(move.target)}`);
    }
  }

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to execute (a backup is made first).");
    return;
  }

  const log = [];
  for (const move of pending) {
    // re-check at apply time: an earlier move may have claimed the target
    move.conflict = existsSync(move.target);
    if (move.conflict) {
      mergeInto(move.source, move.target, log);
      regenerateDocumentsBlock(move.target);
      // remove the merged source tree (documents were unioned into the target)
      rmSync(move.source, { recursive: true, force: true });
    } else {
      mkdirSync(path.dirname(move.target), { recursive: true });
      renameSync(move.source, move.target);
      log.push(`  MOVED ${rel(move.source)} -> ${rel(move.target)}`);
    }
  }

  for (const dir of findTenderDirs(IHALELER)) {
    const meta = canonicalTarget(dir);
    backfillNote(dir, meta, log);
  }

  pruneEmptyDirs(IHALELER);
  writeIndexPages(log);

  console.log("\nActions:");
  for (const line of log) console.log(line);
  console.log("\nDone. Verify with: node scripts/migrate-vault-layout.mjs (should report 0 needing re-file)");
}

main();
