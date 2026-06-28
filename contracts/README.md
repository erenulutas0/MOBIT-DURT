# API Contract Baseline

`fastapi-openapi-v0.1.0.json` is the frozen contract of the legacy FastAPI backend before Java endpoint migration begins.

Baseline:

- Title: `Tender Knowledge Hub`
- Version: `0.1.0`
- Paths: `33`
- Operations: `37`
- SHA-256: `62AEC756B1D5F576ADA09056CC33C6FF7B268B55DF688F1FC3BEB451D76BFD47`

The snapshot is protected by `backend/tests/test_openapi_contract.py`.

An intentional API change requires:

1. Updating the API implementation.
2. Updating frontend types and calls.
3. Exporting the new OpenAPI snapshot.
4. Reviewing the contract diff.
5. Updating Java parity tests for the migrated endpoint.
