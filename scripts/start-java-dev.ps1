$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$backendDir = Join-Path $repoRoot "java-backend"
$jar = Join-Path $backendDir "target\docsbot-ops-backend-0.1.0-SNAPSHOT.jar"
$logsDir = Join-Path $repoRoot "data\logs"

. (Join-Path $PSScriptRoot "use-java-21.ps1")
$javaExe = Join-Path $env:JAVA_HOME "bin\java.exe"

& (Join-Path $PSScriptRoot "start-postgres-dev.ps1")

Get-CimInstance Win32_Process |
    Where-Object {
        $_.Name -eq "java.exe" -and
        $_.CommandLine -like "*$backendDir*docsbot-ops-backend*"
    } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force
    }
Start-Sleep -Seconds 2

Push-Location $backendDir
try {
    & ".\mvnw.cmd" "-DskipTests" "package"
    if ($LASTEXITCODE -ne 0) {
        throw "Java backend build failed."
    }
}
finally {
    Pop-Location
}

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
$stdout = Join-Path $logsDir "java-backend.out.log"
$stderr = Join-Path $logsDir "java-backend.err.log"

$process = Start-Process `
    -FilePath $javaExe `
    -ArgumentList @("-jar", $jar, "--spring.profiles.active=postgres") `
    -WorkingDirectory $backendDir `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -PassThru

for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 1
    try {
        $health = Invoke-RestMethod -Uri "http://127.0.0.1:8080/health" -TimeoutSec 2
        if ($health.status -eq "ok") {
            Write-Host "Java backend is ready on http://127.0.0.1:8080 (PID $($process.Id))."
            exit 0
        }
    }
    catch {
    }
}

Get-Content $stdout -Tail 80 -ErrorAction SilentlyContinue
Get-Content $stderr -Tail 80 -ErrorAction SilentlyContinue
throw "Java backend did not become healthy."
