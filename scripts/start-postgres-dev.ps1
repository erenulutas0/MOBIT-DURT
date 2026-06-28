$ErrorActionPreference = "Stop"

$pgBin = "C:\Program Files\PostgreSQL\17\bin"
$dataDir = Join-Path $env:LOCALAPPDATA "DocsBot\postgres17"
$logDir = Join-Path $env:LOCALAPPDATA "DocsBot"
$logFile = Join-Path $logDir "postgres17.log"
$port = 5433

if (-not (Test-Path (Join-Path $pgBin "pg_ctl.exe"))) {
    throw "PostgreSQL 17 tools were not found at $pgBin"
}

New-Item -ItemType Directory -Force -Path $logDir | Out-Null

if (-not (Test-Path (Join-Path $dataDir "PG_VERSION"))) {
    $passwordFile = Join-Path $env:TEMP ("docsbot-pg-" + [guid]::NewGuid().ToString("N") + ".txt")
    try {
        [System.IO.File]::WriteAllText($passwordFile, "docsbot-local")
        & (Join-Path $pgBin "initdb.exe") `
            -D $dataDir `
            -U docsbot `
            --encoding=UTF8 `
            --locale=C `
            --auth=scram-sha-256 `
            --pwfile=$passwordFile
        if ($LASTEXITCODE -ne 0) {
            throw "PostgreSQL development cluster could not be initialized."
        }
    }
    finally {
        Remove-Item -LiteralPath $passwordFile -Force -ErrorAction SilentlyContinue
    }
}

if (-not (Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)) {
    & (Join-Path $pgBin "pg_ctl.exe") `
        -D $dataDir `
        -l $logFile `
        -o "-p $port -h 127.0.0.1" `
        start
    if ($LASTEXITCODE -ne 0) {
        throw "PostgreSQL development server could not be started. See $logFile"
    }
}

$env:PGPASSWORD = "docsbot-local"
$databaseExists = (& (Join-Path $pgBin "psql.exe") `
    -h 127.0.0.1 `
    -p $port `
    -U docsbot `
    -d postgres `
    -tAc "SELECT 1 FROM pg_database WHERE datname='docsbot'").Trim()

if ($databaseExists -ne "1") {
    & (Join-Path $pgBin "createdb.exe") `
        -h 127.0.0.1 `
        -p $port `
        -U docsbot `
        docsbot
    if ($LASTEXITCODE -ne 0) {
        throw "The docsbot development database could not be created."
    }
}

Write-Host "PostgreSQL development database is ready on 127.0.0.1:$port."
