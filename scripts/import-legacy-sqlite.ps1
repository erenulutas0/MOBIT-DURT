param(
    [string]$Source = ""
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendDir = Join-Path $repoRoot "java-backend"
$sourcePath = if ([string]::IsNullOrWhiteSpace($Source)) {
    Join-Path $repoRoot "data\db.sqlite3"
}
else {
    (Resolve-Path $Source).Path
}

if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
    throw "Legacy SQLite database not found: $sourcePath"
}

Push-Location $backendDir
try {
    & ".\mvnw.cmd" `
        "-DskipTests" `
        "compile" `
        "exec:java" `
        "-Dexec.mainClass=com.docsbot.ops.migration.LegacySqliteImportMain" `
        "-Dexec.args=`"$sourcePath`""
    if ($LASTEXITCODE -ne 0) {
        throw "Legacy SQLite import failed."
    }
}
finally {
    Pop-Location
}
