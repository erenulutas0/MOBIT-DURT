import json
from pathlib import Path

from app.main import app


PROJECT_ROOT = Path(__file__).resolve().parents[2]
CONTRACT_PATH = PROJECT_ROOT / "contracts" / "fastapi-openapi-v0.1.0.json"


def test_fastapi_openapi_matches_frozen_contract():
    expected = json.loads(CONTRACT_PATH.read_text(encoding="utf-8"))

    assert app.openapi() == expected
