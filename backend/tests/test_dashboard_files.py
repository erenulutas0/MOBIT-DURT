from fastapi.testclient import TestClient

from app.config import Settings, get_settings
from app.main import app


def test_file_tree_exposes_download_and_preview_urls(tmp_path):
    data_dir = tmp_path / "data"
    vault_dir = tmp_path / "vault"
    stored_file = data_dir / "originals" / "2026" / "MOBIT" / "BEDAS" / "sample.txt"
    stored_file.parent.mkdir(parents=True)
    stored_file.write_text("hello tender", encoding="utf-8")

    settings = Settings(DATA_DIR=data_dir, VAULT_DIR=vault_dir)
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(app) as client:
            response = client.get("/dashboard/tree")
            assert response.status_code == 200
            payload = response.json()
            sample = _find_file(payload["data_originals"], "sample.txt")
            assert sample is not None
            assert sample["download_url"].startswith("/dashboard/tree-files/data/")
            assert sample["view_url"].startswith("/dashboard/tree-file-view/data/")

            view_response = client.get(sample["view_url"])
            assert view_response.status_code == 200
            assert view_response.text == "hello tender"

            download_response = client.get(sample["download_url"])
            assert download_response.status_code == 200
            assert download_response.text == "hello tender"
    finally:
        app.dependency_overrides.clear()


def test_tree_file_endpoint_rejects_path_traversal(tmp_path):
    data_dir = tmp_path / "data"
    vault_dir = tmp_path / "vault"
    (data_dir / "originals").mkdir(parents=True)
    outside = tmp_path / "secret.txt"
    outside.write_text("secret", encoding="utf-8")

    settings = Settings(DATA_DIR=data_dir, VAULT_DIR=vault_dir)
    app.dependency_overrides[get_settings] = lambda: settings
    try:
        with TestClient(app) as client:
            response = client.get("/dashboard/tree-files/data/%2E%2E/secret.txt")
            assert response.status_code == 404
    finally:
        app.dependency_overrides.clear()


def _find_file(node: dict[str, object], filename: str) -> dict[str, object] | None:
    if node.get("type") == "file" and node.get("name") == filename:
        return node
    for child in node.get("children", []):
        found = _find_file(child, filename)
        if found is not None:
            return found
    return None
