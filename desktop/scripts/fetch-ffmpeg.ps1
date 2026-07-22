$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$archiveName = "ffmpeg-n8.1.2-29-g703dcc25b9-win64-lgpl-8.1.zip"
$releaseTag = "autobuild-2026-07-21-13-38"
$expectedSha256 = "7292007cf83eb537d6498750af356d3aa026b62c21000196bc7851f5531ab649"
$downloadUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/$releaseTag/$archiveName"
$archiveRoot = "ffmpeg-n8.1.2-29-g703dcc25b9-win64-lgpl-8.1"

$desktopRoot = Split-Path -Parent $PSScriptRoot
$cacheDir = Join-Path $desktopRoot ".ffmpeg-cache"
$archivePath = Join-Path $cacheDir $archiveName
$runtimeDir = Join-Path $desktopRoot "runtime\ffmpeg"

New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
foreach ($staleMetadata in @("SOURCE.json", "BUILD-CONFIGURATION.txt")) {
    $stalePath = Join-Path $runtimeDir $staleMetadata
    if (Test-Path -LiteralPath $stalePath -PathType Leaf) {
        Remove-Item -LiteralPath $stalePath -Force
    }
}

function Test-ArchiveHash {
    if (-not (Test-Path -LiteralPath $archivePath -PathType Leaf)) {
        return $false
    }
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    try {
        $stream = [System.IO.File]::OpenRead($archivePath)
        try {
            $actual = [BitConverter]::ToString($sha256.ComputeHash($stream)).Replace("-", "").ToLowerInvariant()
        }
        finally {
            $stream.Dispose()
        }
    }
    finally {
        $sha256.Dispose()
    }
    return $actual -eq $expectedSha256
}

if (-not (Test-ArchiveHash)) {
    if (Test-Path -LiteralPath $archivePath) {
        Remove-Item -LiteralPath $archivePath -Force
    }
    Invoke-WebRequest -Headers @{ "User-Agent" = "AI-anime-Desktop-Build" } -Uri $downloadUrl -OutFile $archivePath
}

if (-not (Test-ArchiveHash)) {
    throw "FFmpeg archive checksum verification failed: $archivePath"
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
    $entries = @{
        "$archiveRoot/bin/ffmpeg.exe" = "ffmpeg.exe"
        "$archiveRoot/bin/ffprobe.exe" = "ffprobe.exe"
    }
    foreach ($sourceName in $entries.Keys) {
        $entry = $archive.GetEntry($sourceName)
        if ($null -eq $entry) {
            throw "Required FFmpeg archive entry not found: $sourceName"
        }
        $destination = Join-Path $runtimeDir $entries[$sourceName]
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $true)
    }
}
finally {
    $archive.Dispose()
}

$ffmpegPath = Join-Path $runtimeDir "ffmpeg.exe"
$ffprobePath = Join-Path $runtimeDir "ffprobe.exe"
$buildConfiguration = (& $ffmpegPath -hide_banner -buildconf 2>&1 | Out-String)
if ($LASTEXITCODE -ne 0) {
    throw "Bundled ffmpeg.exe did not start"
}
if ($buildConfiguration -match "--enable-(gpl|nonfree)") {
    throw "Bundled FFmpeg build is not LGPL-only"
}
& $ffprobePath -hide_banner -version | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Bundled ffprobe.exe did not start"
}

Write-Host "FFmpeg runtime ready: $runtimeDir"
