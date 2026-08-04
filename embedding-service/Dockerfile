# Self-hosted embeddings for the document assistant. Sits on the internal Docker network next to
# docsbot-piper; nothing about it is reachable from the internet.
FROM python:3.11-slim

WORKDIR /app

# CPU-only torch: the GPU build is several GB and this box has no GPU.
RUN pip install --no-cache-dir \
        torch==2.4.1 --index-url https://download.pytorch.org/whl/cpu \
    && pip install --no-cache-dir \
        sentence-transformers==3.1.1 \
        fastapi==0.115.0 \
        "uvicorn[standard]==0.30.6"

# The base model rather than small: measured over twenty questions against real tender clauses, it
# put the right document first 19 times where small managed 17, and the two it fixed were ordinary
# questions a user would actually ask ("param ne zaman hesabıma yatar"). It costs ~1GB of image and
# more CPU per document, both of which this box has, and nothing at all in money — which is the
# whole point of self-hosting the embeddings.
ENV EMBEDDING_MODEL=intfloat/multilingual-e5-base
# Bake the weights into the image so a container restart doesn't re-download them, and so the
# service comes up without needing network access at runtime.
RUN python -c "from sentence_transformers import SentenceTransformer; \
    SentenceTransformer('intfloat/multilingual-e5-base')"

COPY app.py /app/app.py

EXPOSE 5001
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "5001", "--workers", "1"]
