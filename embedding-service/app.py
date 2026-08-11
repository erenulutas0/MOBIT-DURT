"""Self-hosted document services for the assistant: embeddings, OCR, and the tender bulletin.

Runs the same way Piper does: a small container on the internal Docker network, reachable only by
the backend. No API key, no per-document cost, and no document text ever leaving the server — which
is the answer to the first question any tender company asks about an AI feature.

The model is multilingual-e5-base: 768 dimensions, ~280M parameters, Turkish among its languages,
and fast enough on CPU that indexing does not need a GPU. The e5 family is instruction-tuned and
expects "query: " / "passage: " prefixes; getting those backwards quietly halves retrieval quality,
so the two endpoints apply them rather than trusting the caller to remember.

Changing EMBEDDING_MODEL is safe but not free: the backend records which model produced each vector
and re-indexes everything when it changes, because distances between vectors from different models
are meaningless. Expect the corpus to be briefly unsearchable while that runs.
"""

import io
import os
import time
from typing import List

import bulletin
import pytesseract
from fastapi import FastAPI, File, UploadFile
from pdf2image import convert_from_bytes
from PIL import Image
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer

MODEL_NAME = os.getenv("EMBEDDING_MODEL", "intfloat/multilingual-e5-base")
# Big enough to amortise per-call overhead, small enough not to spike memory on a shared box.
BATCH_SIZE = int(os.getenv("EMBEDDING_BATCH_SIZE", "16"))

# Turkish first, English as a fallback for the loan-heavy technical pages.
OCR_LANGUAGES = os.getenv("OCR_LANGUAGES", "tur+eng")
# Enough for a şartname, short of letting one 400-page scan hold the queue for an hour.
OCR_MAX_PAGES = int(os.getenv("OCR_MAX_PAGES", "40"))
# 150 DPI reads clean scans reliably and costs a quarter of what 300 does.
OCR_DPI = int(os.getenv("OCR_DPI", "150"))

# The bulletin is published once a day and does not change afterwards, so holding a read for a few
# hours costs nothing in freshness. Four is long enough to cover every tenant's morning run and
# short enough that an admin who presses "çek" in the afternoon still gets the day's bulletin.
BULLETIN_CACHE_SECONDS = int(os.getenv("BULLETIN_CACHE_SECONDS", str(4 * 3600)))
# kind -> (monotonic seconds when it was read, the answer). At most four entries.
_BULLETIN_CACHE: dict = {}

app = FastAPI(title="DocsBot Document Services")
model = SentenceTransformer(MODEL_NAME)


class PassagesRequest(BaseModel):
    passages: List[str] = Field(default_factory=list)


class QueryRequest(BaseModel):
    query: str


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model": MODEL_NAME,
        "dimensions": model.get_sentence_embedding_dimension(),
    }


@app.post("/embed/passages")
def embed_passages(request: PassagesRequest):
    if not request.passages:
        return {"model": MODEL_NAME, "vectors": []}
    prefixed = [f"passage: {text}" for text in request.passages]
    vectors = model.encode(prefixed, batch_size=BATCH_SIZE, normalize_embeddings=True)
    return {"model": MODEL_NAME, "vectors": [vector.tolist() for vector in vectors]}


@app.post("/ocr")
async def ocr(file: UploadFile = File(...)):
    """Reads a scan. Called only when normal extraction found nothing worth indexing.

    Takes the bytes rather than a path on purpose: this container is shared by every tenant, and
    the moment it can open one customer's files it has to be trusted not to open another's. Bytes
    over the internal network keep it unable to reach any of them.
    """
    payload = await file.read()
    filename = (file.filename or "").lower()
    try:
        if filename.endswith(".pdf") or payload[:5] == b"%PDF-":
            pages = convert_from_bytes(payload, dpi=OCR_DPI, fmt="png")
            # Reported so the caller can tell "this scan is longer than we read" from "this scan
            # says nothing" — the second is a dead end, the first is a number to raise.
            read = pages[:OCR_MAX_PAGES]
            text = "\n\n".join(
                pytesseract.image_to_string(page, lang=OCR_LANGUAGES) for page in read)
            return {"text": text.strip(), "pages": len(pages), "pages_read": len(read)}
        image = Image.open(io.BytesIO(payload))
        text = pytesseract.image_to_string(image, lang=OCR_LANGUAGES)
        return {"text": text.strip(), "pages": 1, "pages_read": 1}
    except Exception as error:
        # A corrupt or password-protected file is an ordinary outcome for an archive, not a fault
        # in this service: reported so the caller can mark the document and move on.
        return {"text": "", "pages": 0, "pages_read": 0, "error": str(error)[:200]}


@app.get("/bulletin/{kind}")
def read_bulletin(kind: str):
    """Fetches and parses one of the day's four Kamu İhale Bülteni PDFs.

    Served from here rather than the backend because both halves of the job already live in this
    container — poppler reads the PDF, and the bulletin is the same public document for every
    tenant, so it is fetched once and shared instead of once per customer.

    The answer is held for a few hours. Every tenant's backend asks for the same four bulletins
    within the same minute each morning, and the bulletin does not change during the day: without
    this, ten customers means forty downloads of the same public PDFs off somebody else's servers,
    which is both slower for us and rude to them.
    """
    cached = _BULLETIN_CACHE.get(kind)
    if cached and time.monotonic() - cached[0] < BULLETIN_CACHE_SECONDS:
        return {**cached[1], "cached": True}

    try:
        files = bulletin.fetch_bulletin(kind)
    except Exception as error:
        # Reported rather than answered with an empty list: "their page changed" and "there were no
        # tenders today" must not look the same to the caller.
        return {"ok": False, "error": str(error)[:300], "notices": []}

    # The archive holds two PDFs: the day's announcements and the day's results. Both are read
    # here, because they arrive in the same download and splitting them across two calls would
    # mean fetching the same archive twice.
    name = next((n for n in files if n.upper().endswith(".PDF") and "SONUC" not in n.upper()), None)
    if name is None:
        return {"ok": False, "error": "arşivde ilan bülteni bulunamadı", "notices": []}

    text = bulletin.pdf_to_text(files[name])
    notices = bulletin.parse_announcements(text)

    results, result_source = [], None
    result_name = next((n for n in files if "SONUC" in n.upper()), None)
    if result_name:
        # Its own try: a layout change in the results must not cost the day's announcements, which
        # are the part somebody is waiting on at nine in the morning.
        try:
            results = bulletin.parse_results(bulletin.pdf_to_text(files[result_name]))
            result_source = result_name
        except Exception:
            results = []

    payload = {
        "ok": True,
        "source": name,
        "bulletin_type": kind,
        "count": len(notices),
        "notices": notices,
        "result_source": result_source,
        "result_count": len(results),
        "results": results,
    }
    # Only successful reads are cached. A failure held for four hours would keep answering with
    # yesterday's problem long after their site came back.
    _BULLETIN_CACHE[kind] = (time.monotonic(), payload)
    return payload


@app.post("/embed/query")
def embed_query(request: QueryRequest):
    vector = model.encode(f"query: {request.query}", normalize_embeddings=True)
    return {"model": MODEL_NAME, "vector": vector.tolist()}
