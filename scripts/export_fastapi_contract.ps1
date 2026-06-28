$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$python = Join-Path $projectRoot ".venv\Scripts\python.exe"
$output = Join-Path $projectRoot "contracts\fastapi-openapi-v0.1.0.json"

if (-not (Test-Path $python)) {
    throw "Python virtual environment was not found at $python"
}

$env:PYTHONPATH = Join-Path $projectRoot "backend"
& $python -c @"
from app.main import app
import json
from pathlib import Path

Path(r"$output").write_text(
    json.dumps(app.openapi(), indent=2, ensure_ascii=False) + "\n",
    encoding="utf-8",
)
"@

Get-FileHash $output -Algorithm SHA256
