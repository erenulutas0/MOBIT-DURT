"""Self-hosted embedding service for the company-document assistant.

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

import os
from typing import List

from fastapi import FastAPI
from pydantic import BaseModel, Field
from sentence_transformers import SentenceTransformer

MODEL_NAME = os.getenv("EMBEDDING_MODEL", "intfloat/multilingual-e5-base")
# Big enough to amortise per-call overhead, small enough not to spike memory on a shared box.
BATCH_SIZE = int(os.getenv("EMBEDDING_BATCH_SIZE", "16"))

app = FastAPI(title="DocsBot Embeddings")
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


@app.post("/embed/query")
def embed_query(request: QueryRequest):
    vector = model.encode(f"query: {request.query}", normalize_embeddings=True)
    return {"model": MODEL_NAME, "vector": vector.tolist()}
