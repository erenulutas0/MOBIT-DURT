$ErrorActionPreference = "Stop"

function Test-JavaHome21 {
    param([string]$JavaHome)

    if ([string]::IsNullOrWhiteSpace($JavaHome)) {
        return $false
    }

    $javaExe = Join-Path $JavaHome "bin\java.exe"
    $releaseFile = Join-Path $JavaHome "release"
    if (-not (Test-Path $javaExe) -or -not (Test-Path $releaseFile)) {
        return $false
    }

    return (Get-Content $releaseFile | Select-String -Quiet '^JAVA_VERSION="21\.')
}

$candidates = @()
if ($env:JAVA_HOME) {
    $candidates += $env:JAVA_HOME
}

$knownRoots = @(
    "C:\Program Files\Eclipse Adoptium",
    "C:\Program Files\Java",
    "C:\Program Files\Microsoft"
)

foreach ($root in $knownRoots) {
    if (Test-Path $root) {
        $candidates += Get-ChildItem $root -Directory -Filter "jdk-21*" -ErrorAction SilentlyContinue |
            Sort-Object Name -Descending |
            Select-Object -ExpandProperty FullName
    }
}

$javaHome21 = $candidates | Where-Object { Test-JavaHome21 $_ } | Select-Object -First 1
if (-not $javaHome21) {
    throw "JDK 21 was not found. Install Eclipse Temurin 21 with: winget install --id EclipseAdoptium.Temurin.21.JDK --source winget"
}

$env:JAVA_HOME = $javaHome21
$javaBin = Join-Path $javaHome21 "bin"
$pathParts = $env:Path -split ';' | Where-Object {
    $_ -and ($_ -ne $javaBin) -and ($_ -notmatch '\\Java\\jdk-[0-9]+') -and ($_ -notmatch '\\Eclipse Adoptium\\jdk-[0-9]+')
}
$env:Path = (@($javaBin) + $pathParts) -join ';'

Write-Host "Using JDK 21 at $env:JAVA_HOME"
