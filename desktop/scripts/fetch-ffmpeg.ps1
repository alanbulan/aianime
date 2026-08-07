$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$archiveName = "ffmpeg-n8.1-latest-win64-lgpl-8.1.zip"
$releaseTag = "latest"
$downloadUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/$releaseTag/$archiveName"
$checksumsUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/$releaseTag/checksums.sha256"
$archiveRoot = [System.IO.Path]::GetFileNameWithoutExtension($archiveName)

$desktopRoot = Split-Path -Parent $PSScriptRoot
$cacheDir = Join-Path $desktopRoot ".ffmpeg-cache"
$archivePath = Join-Path $cacheDir $archiveName
$checksumsPath = Join-Path $cacheDir "checksums.sha256"
$runtimeDir = Join-Path $desktopRoot "runtime\ffmpeg"

New-Item -ItemType Directory -Force -Path $cacheDir | Out-Null
New-Item -ItemType Directory -Force -Path $runtimeDir | Out-Null
Invoke-WebRequest -Headers @{ "User-Agent" = "AI-anime-Desktop-Build" } -Uri $checksumsUrl -OutFile $checksumsPath
$checksumPattern = "(?m)^([0-9a-f]{64})\s+" + [regex]::Escape($archiveName) + "$"
$checksumMatch = [regex]::Match((Get-Content -LiteralPath $checksumsPath -Raw), $checksumPattern)
if (-not $checksumMatch.Success) {
    throw "FFmpeg checksum entry not found: $archiveName"
}
$expectedSha256 = $checksumMatch.Groups[1].Value

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
$encoders = (& $ffmpegPath -hide_banner -encoders 2>&1 | Out-String)
if ($encoders -notmatch "libopenh264") {
    throw "Bundled FFmpeg is missing libopenh264"
}
$filters = (& $ffmpegPath -hide_banner -filters 2>&1 | Out-String)
if ($filters -notmatch "drawtext") {
    throw "Bundled FFmpeg is missing drawtext"
}
& $ffprobePath -hide_banner -version | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Bundled ffprobe.exe did not start"
}

$buildConfiguration | Set-Content -LiteralPath (Join-Path $runtimeDir "BUILD-CONFIGURATION.txt") -Encoding utf8
@{
    source = "BtbN/FFmpeg-Builds"
    releaseTag = $releaseTag
    target = "windows"
    arch = "x64"
    archive = $archiveName
    archiveSha256 = $expectedSha256
    sourceRelease = "https://github.com/BtbN/FFmpeg-Builds/releases/tag/$releaseTag"
} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeDir "SOURCE.json") -Encoding utf8

Write-Host "FFmpeg runtime ready: $runtimeDir"
