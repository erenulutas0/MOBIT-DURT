from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.database import get_db
from app.ingestion.checksum import sha256_bytes
from app.ingestion.classifier import Classification, classify_document
from app.ingestion.storage import LocalFileStorage
from app.models import Document, Tender, TenderOrganization
from app.obsidian.vault_writer import ObsidianVaultWriter
from app.tenders.service import INTERNAL_UNITS, add_tender_organization, create_and_bind_dated_tender


router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("", response_class=HTMLResponse)
def dashboard(db: Session = Depends(get_db), settings: Settings = Depends(get_settings)) -> str:
    tenders = db.query(Tender).order_by(Tender.created_at.desc(), Tender.id.desc()).limit(80).all()
    organizations = (
        db.query(TenderOrganization)
        .filter(TenderOrganization.active == 1)
        .order_by(TenderOrganization.name)
        .all()
    )
    documents = (
        db.query(Document)
        .order_by(Document.timestamp.desc(), Document.id.desc())
        .limit(120)
        .all()
    )
    return _page_html(tenders, organizations, documents, settings)


@router.get("/tree")
def file_tree(settings: Settings = Depends(get_settings)) -> dict[str, object]:
    data_root = settings.resolved_data_dir / "originals"
    vault_root = settings.resolved_vault_dir / "ihaleler"
    return {
        "data_originals": _tree_node(data_root, settings.resolved_data_dir),
        "obsidian_vault": _tree_node(vault_root, settings.resolved_vault_dir),
    }


@router.get("/vault/notes")
def vault_notes(settings: Settings = Depends(get_settings)) -> dict[str, object]:
    vault_root = settings.resolved_vault_dir / "ihaleler"
    notes = []
    if vault_root.exists():
        for path in sorted(vault_root.rglob("*.md"), key=lambda item: item.as_posix().lower()):
            content = path.read_text(encoding="utf-8", errors="replace")
            relative_path = path.relative_to(vault_root).as_posix()
            notes.append(
                {
                    "name": path.stem,
                    "path": relative_path,
                    "updated": datetime.fromtimestamp(path.stat().st_mtime).isoformat(),
                    "linked_files": content.count("[["),
                    "tags": _note_tags(content, relative_path),
                }
            )
    return {"vault_root": "vault/ihaleler", "notes": notes}


@router.get("/vault/notes/{note_path:path}")
def vault_note(note_path: str, settings: Settings = Depends(get_settings)) -> dict[str, str]:
    vault_root = (settings.resolved_vault_dir / "ihaleler").resolve()
    target = (vault_root / note_path).resolve()
    if not target.is_relative_to(vault_root) or target.suffix.lower() != ".md" or not target.is_file():
        raise HTTPException(status_code=404, detail="Vault note not found")
    return {
        "path": target.relative_to(vault_root).as_posix(),
        "content": target.read_text(encoding="utf-8", errors="replace"),
    }


@router.get("/files/{document_id}")
def download_document(document_id: int, db: Session = Depends(get_db)) -> FileResponse:
    document = db.get(Document, document_id)
    if document is None or not document.file_path:
        raise HTTPException(status_code=404, detail="Document not found")
    path = Path(document.file_path)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Stored file is missing")
    return FileResponse(path, filename=document.stored_filename or document.original_filename or path.name)


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    internal_unit: str = Form(...),
    organization: str = Form(...),
    tender_id: str = Form(""),
    year: int = Form(...),
    caption: str = Form(""),
    db: Session = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> RedirectResponse:
    if internal_unit not in INTERNAL_UNITS:
        raise HTTPException(status_code=400, detail="Unknown internal unit")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Empty file")
    if len(content) > settings.max_file_size_bytes:
        raise HTTPException(status_code=413, detail="File too large")

    organization = _normalize_choice(organization)
    if not organization:
        raise HTTPException(status_code=400, detail="Organization is required")
    add_tender_organization(db, organization)

    timestamp = datetime.now(timezone.utc)
    tender = _resolve_tender(db, tender_id, internal_unit, organization, year, timestamp)
    detected = classify_document(file.filename, caption, timestamp)
    classification = Classification(
        year=tender.year,
        organization=tender.organization,
        tender_id=tender.tender_id,
        document_type=detected.document_type,
        internal_unit=tender.internal_unit,
    )

    storage = LocalFileStorage(settings.resolved_data_dir)
    stored = storage.save(content, file.filename, file.content_type, classification, timestamp)
    checksum = sha256_bytes(content)
    document = Document(
        message_id=f"dashboard-{uuid4()}",
        sender_hash="dashboard-upload",
        source="dashboard",
        timestamp=timestamp,
        media_id=f"dashboard-{uuid4()}",
        mime_type=file.content_type,
        original_filename=file.filename,
        stored_filename=stored.safe_filename,
        caption=caption or None,
        checksum=checksum,
        file_path=str(stored.path),
        file_size=len(content),
        internal_unit=classification.internal_unit,
        organization=classification.organization,
        year=classification.year,
        tender_id=classification.tender_id,
        document_type=classification.document_type,
        status="stored",
    )
    db.add(document)
    db.commit()
    db.refresh(document)

    ObsidianVaultWriter(settings.resolved_vault_dir).write_document(document)
    return RedirectResponse(url="/dashboard", status_code=303)


def _resolve_tender(
    db: Session,
    tender_id: str,
    internal_unit: str,
    organization: str,
    year: int,
    timestamp: datetime,
) -> Tender:
    selected = tender_id.strip()
    if selected:
        tender = db.query(Tender).filter(Tender.tender_id == selected).one_or_none()
        if tender is None:
            raise HTTPException(status_code=400, detail="Tender not found")
        return tender

    created = create_and_bind_dated_tender(
        db,
        chat_id=f"dashboard-{uuid4()}",
        chat_title="Dashboard Upload",
        organization=organization,
        created_at=timestamp.replace(year=year),
        internal_unit=internal_unit,
    )
    return created


def _tree_node(path: Path, base: Path, depth: int = 0) -> dict[str, object]:
    if not path.exists():
        return {"name": path.name, "path": str(path), "type": "missing", "children": []}
    if depth >= 5 or path.is_file():
        return {
            "name": path.name,
            "path": str(path.relative_to(base)) if path.is_relative_to(base) else str(path),
            "type": "file" if path.is_file() else "folder",
            "size": path.stat().st_size if path.is_file() else None,
            "children": [],
        }
    children = sorted(path.iterdir(), key=lambda item: (item.is_file(), item.name.lower()))[:200]
    return {
        "name": path.name,
        "path": str(path.relative_to(base)) if path.is_relative_to(base) else str(path),
        "type": "folder",
        "children": [_tree_node(child, base, depth + 1) for child in children],
    }


def _normalize_choice(value: str) -> str:
    return " ".join(value.strip().split())


def _note_tags(content: str, relative_path: str) -> list[str]:
    tags = []
    for part in relative_path.replace(".md", "").split("/"):
        cleaned = part.strip().lower().replace(" ", "-")
        if cleaned and cleaned not in tags:
            tags.append(cleaned)
        if len(tags) >= 4:
            return tags
    for line in content.splitlines():
        if line.startswith("tags:"):
            values = line.removeprefix("tags:").replace("[", "").replace("]", "").split(",")
            for value in values:
                cleaned = value.strip().strip('"').strip("'")
                if cleaned and cleaned not in tags:
                    tags.append(cleaned)
                if len(tags) >= 4:
                    return tags
    return tags


def _page_html(
    tenders: list[Tender],
    organizations: list[TenderOrganization],
    documents: list[Document],
    settings: Settings,
) -> str:
    tender_options = "\n".join(
        f'<option value="{_esc(tender.tender_id)}">{_esc(tender.tender_id)}</option>'
        for tender in tenders
    )
    org_options = "\n".join(
        f'<option value="{_esc(org.code)}">{_esc(org.name)} ({_esc(org.code)})</option>'
        for org in organizations
    )
    unit_options = "\n".join(
        f'<option value="{_esc(unit)}">{_esc(unit)}</option>' for unit in INTERNAL_UNITS
    )
    document_rows = "\n".join(_document_row(document) for document in documents)
    return f"""<!doctype html>
<html lang="tr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>DocsBot Dashboard</title>
  <style>
    :root {{ color-scheme: light; --ink:#1f2937; --muted:#667085; --line:#d8dee8; --soft:#f4f6f8; --accent:#0f766e; --accent2:#284b63; }}
    * {{ box-sizing:border-box; }}
    body {{ margin:0; font-family:Segoe UI, Arial, sans-serif; color:var(--ink); background:#eef2f5; }}
    header {{ height:58px; display:flex; align-items:center; justify-content:space-between; padding:0 22px; background:#ffffff; border-bottom:1px solid var(--line); }}
    h1 {{ margin:0; font-size:19px; font-weight:650; letter-spacing:0; }}
    main {{ display:grid; grid-template-columns:360px 1fr; gap:14px; padding:14px; }}
    section {{ background:#fff; border:1px solid var(--line); border-radius:8px; min-width:0; }}
    .panel-head {{ display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-bottom:1px solid var(--line); }}
    h2 {{ margin:0; font-size:15px; }}
    .tree {{ padding:10px 14px 16px; overflow:auto; max-height:calc(100vh - 102px); font-size:13px; }}
    .tree details {{ margin:4px 0; }}
    .tree summary {{ cursor:pointer; padding:3px 0; }}
    .tree .file {{ color:var(--muted); margin:4px 0 4px 18px; white-space:nowrap; }}
    .content {{ display:grid; grid-template-rows:auto 1fr; gap:14px; min-width:0; }}
    form {{ display:grid; grid-template-columns:repeat(4, minmax(150px, 1fr)); gap:10px; padding:14px; align-items:end; }}
    label {{ display:grid; gap:5px; font-size:12px; color:var(--muted); }}
    input, select {{ height:36px; border:1px solid var(--line); border-radius:6px; padding:0 10px; background:#fff; color:var(--ink); min-width:0; }}
    input[type=file] {{ padding:7px; }}
    button {{ height:36px; border:0; border-radius:6px; background:var(--accent); color:white; font-weight:650; cursor:pointer; }}
    .wide {{ grid-column:span 2; }}
    table {{ width:100%; border-collapse:collapse; font-size:13px; }}
    th, td {{ padding:9px 10px; border-bottom:1px solid var(--line); text-align:left; vertical-align:top; }}
    th {{ background:#f8fafb; font-size:12px; color:#475467; position:sticky; top:0; }}
    td a {{ color:var(--accent2); font-weight:650; text-decoration:none; }}
    .table-wrap {{ overflow:auto; max-height:calc(100vh - 280px); }}
    .muted {{ color:var(--muted); }}
    .pill {{ display:inline-block; padding:3px 7px; border-radius:999px; background:var(--soft); font-size:12px; }}
    @media (max-width: 980px) {{ main {{ grid-template-columns:1fr; }} form {{ grid-template-columns:1fr 1fr; }} .wide {{ grid-column:span 2; }} }}
  </style>
</head>
<body>
  <header>
    <h1>DocsBot Dashboard</h1>
    <div class="muted">Data: {_esc(str(settings.resolved_data_dir))}</div>
  </header>
  <main>
    <section>
      <div class="panel-head"><h2>Klasor agaci</h2><button type="button" onclick="loadTree()">Yenile</button></div>
      <div id="tree" class="tree">Yukleniyor...</div>
    </section>
    <div class="content">
      <section>
        <div class="panel-head"><h2>Manuel dokuman yukle</h2><span class="muted">Ayni pipeline ile kaydeder</span></div>
        <form method="post" action="/dashboard/upload" enctype="multipart/form-data">
          <label>Sirket kolu<select name="internal_unit" required>{unit_options}</select></label>
          <label>Ihalenin yapilacagi sirket<select name="organization" required>{org_options}</select></label>
          <label>Yil<input name="year" type="number" min="2020" max="2035" value="{datetime.now().year}" required></label>
          <label>Mevcut ihale<select name="tender_id"><option value="">Yeni dated tender olustur</option>{tender_options}</select></label>
          <label class="wide">Dosya<input name="file" type="file" required></label>
          <label class="wide">Aciklama<input name="caption" placeholder="Opsiyonel not"></label>
          <button type="submit">Yukle</button>
        </form>
      </section>
      <section>
        <div class="panel-head"><h2>Son dokumanlar</h2><span class="muted">{len(documents)} kayit</span></div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>ID</th><th>Dosya</th><th>Ihale</th><th>Sirket kolu</th><th>Tip</th><th>Durum</th><th>Tarih</th></tr></thead>
            <tbody>{document_rows or '<tr><td colspan="7" class="muted">Henuz dokuman yok.</td></tr>'}</tbody>
          </table>
        </div>
      </section>
    </div>
  </main>
  <script>
    function esc(value) {{ return String(value).replace(/[&<>"']/g, c => ({{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}}[c])); }}
    function renderNode(node) {{
      if (node.type === 'file') return `<div class="file">${{esc(node.name)}}</div>`;
      const children = (node.children || []).map(renderNode).join('');
      return `<details open><summary>${{esc(node.name)}} <span class="muted">${{esc(node.path || '')}}</span></summary>${{children}}</details>`;
    }}
    async function loadTree() {{
      const target = document.getElementById('tree');
      target.textContent = 'Yukleniyor...';
      const response = await fetch('/dashboard/tree');
      const data = await response.json();
      target.innerHTML = renderNode(data.data_originals) + renderNode(data.obsidian_vault);
    }}
    loadTree();
  </script>
</body>
</html>"""


def _document_row(document: Document) -> str:
    filename = document.stored_filename or document.original_filename or f"document-{document.id}"
    link = (
        f'<a href="/dashboard/files/{document.id}">{_esc(filename)}</a>'
        if document.file_path
        else _esc(filename)
    )
    return (
        "<tr>"
        f"<td>{document.id}</td>"
        f"<td>{link}<br><span class=\"muted\">{_esc(document.original_filename or '')}</span></td>"
        f"<td>{_esc(document.tender_id)}</td>"
        f"<td>{_esc(document.internal_unit or '-')}</td>"
        f"<td><span class=\"pill\">{_esc(document.document_type)}</span></td>"
        f"<td>{_esc(document.status)}</td>"
        f"<td>{_esc(document.timestamp.strftime('%Y-%m-%d %H:%M'))}</td>"
        "</tr>"
    )


def _esc(value: object) -> str:
    return (
        str(value)
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&#39;")
    )
