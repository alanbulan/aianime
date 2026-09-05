# Copyright (c) 2026 AI anime

param(
    [string]$ManifestUrl = "",
    [string]$InstallRoot = "",
    [string]$InstallLogPath = ""
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$utf8Encoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $utf8Encoding
$OutputEncoding = $utf8Encoding

function Assert-RuntimeDependencyManifest {
    param([Parameter(Mandatory = $true)][object]$Manifest)

    function Test-PositiveSafeInteger {
        param([object]$Value)
        if ($null -eq $Value -or $Value -is [bool]) {
            return $false
        }
        [long]$parsed = 0
        $valid = [long]::TryParse(
            [string]$Value,
            [Globalization.NumberStyles]::Integer,
            [Globalization.CultureInfo]::InvariantCulture,
            [ref]$parsed
        )
        return $valid -and $parsed -gt 0 -and $parsed -le 9007199254740991
    }

    function Test-AllowedDownloadUrl {
        param([object]$Value)
        if ($Value -isnot [string] -or -not $Value.Trim()) {
            return $false
        }
        [Uri]$parsed = $null
        if (-not [Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$parsed)) {
            return $false
        }
        if ($parsed.Scheme -eq "https") {
            return $true
        }
        return (
            $parsed.Scheme -eq "http" -and
            @("127.0.0.1", "localhost", "::1") -contains $parsed.DnsSafeHost
        )
    }

    $package = $Manifest.package
    $urls = @($package.urls)
    $validUrls = (
        $package.urls -is [System.Array] -and
        $urls.Count -gt 0 -and
        @($urls | Where-Object { -not (Test-AllowedDownloadUrl $_) }).Count -eq 0
    )
    if (
        $Manifest.schemaVersion -ne 1 -or
        $package.id -ne "world" -or
        $package.platform -ne "win32" -or
        $package.arch -ne "x64" -or
        $package.archive -ne "tar.gz" -or
        -not ([string]$package.version).Trim() -or
        ([string]$package.sha256) -notmatch "^[a-fA-F0-9]{64}$" -or
        -not (Test-PositiveSafeInteger $package.downloadSizeBytes) -or
        -not (Test-PositiveSafeInteger $package.installedSizeBytes) -or
        -not $validUrls
    ) {
        throw "运行环境清单字段不完整或与当前平台不匹配。"
    }
    return $package
}

if ([Environment]::Is64BitOperatingSystem -ne $true) {
    throw "导演世界 3D 运行环境仅支持 64 位 Windows。"
}

$runtimeBaseUrl = if ($env:AI_ANIME_RUNTIME_DOWNLOAD_BASE_URL) {
    $env:AI_ANIME_RUNTIME_DOWNLOAD_BASE_URL.TrimEnd("/")
} else {
    "https://aianime.mingcw.com/api/v1/client/runtime-dependencies"
}
if (-not $ManifestUrl) {
    $ManifestUrl = if ($env:AI_ANIME_RUNTIME_MANIFEST_URL) {
        $env:AI_ANIME_RUNTIME_MANIFEST_URL.Replace("{id}", "world").Replace("{platform}", "win32").Replace("{arch}", "x64")
    } else {
        "$runtimeBaseUrl/world/win32-x64/manifest.json"
    }
}

$appDataPath = [Environment]::GetFolderPath("ApplicationData")
$dependencyRoot = [IO.Path]::GetFullPath($(if ($InstallRoot) {
    $InstallRoot
} else {
    Join-Path $appDataPath "@ai-anime\desktop\dependencies\world"
}))
$logPath = [IO.Path]::GetFullPath($(if ($InstallLogPath) {
    $InstallLogPath
} else {
    Join-Path $appDataPath "@ai-anime\desktop\logs\runtime-dependency-install.log"
}))
$logDirectory = Split-Path -Parent $logPath
$tarExecutable = [IO.Path]::GetFullPath((Join-Path $env:SystemRoot "System32\tar.exe"))
if (-not (Test-Path -LiteralPath $tarExecutable -PathType Leaf)) {
    throw "Windows 系统 tar.exe 不存在: $tarExecutable"
}
$nonce = [Guid]::NewGuid().ToString("N")
$archivePath = Join-Path $dependencyRoot ".world-$nonce.tar.gz"
$stagingPath = Join-Path $dependencyRoot ".staging-$nonce"
$previousPath = Join-Path $dependencyRoot ".previous-$nonce"
$currentPath = Join-Path $dependencyRoot "current"
$movedCurrent = $false

function Remove-SafeRuntimePath {
    param([Parameter(Mandatory = $true)][string]$Path)
    $resolved = [IO.Path]::GetFullPath($Path)
    $prefix = $dependencyRoot.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if (-not $resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "拒绝删除运行环境目录之外的路径: $resolved"
    }
    if (Test-Path -LiteralPath $resolved) {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}

function Invoke-NativeCommandCapture {
    param(
        [Parameter(Mandatory = $true)][string]$Executable,
        [string[]]$Arguments = @()
    )

    $previousPreference = $ErrorActionPreference
    try {
        # Windows PowerShell 5.1 converts every native stderr line into a
        # NativeCommandError when ErrorActionPreference is Stop. Optional
        # runtime warnings must not override the process exit code.
        $ErrorActionPreference = "Continue"
        $output = (& $Executable @Arguments 2>&1 | Out-String)
        $exitCode = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $previousPreference
    }
    return [PSCustomObject]@{
        ExitCode = $exitCode
        Output = $output
    }
}

function Get-FileSha256 {
    param([Parameter(Mandatory = $true)][string]$Path)

    $stream = [IO.File]::OpenRead($Path)
    try {
        $sha256 = [Security.Cryptography.SHA256]::Create()
        try {
            $digest = $sha256.ComputeHash($stream)
            return ([BitConverter]::ToString($digest)).Replace("-", "").ToLowerInvariant()
        } finally {
            $sha256.Dispose()
        }
    } finally {
        $stream.Dispose()
    }
}

$transcriptStarted = $false
try {
    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
    Start-Transcript -LiteralPath $logPath -Append | Out-Null
    $transcriptStarted = $true
    Write-Output "安装日志: $logPath"
} catch {
    Write-Output "无法创建安装日志，将继续安装: $($_.Exception.Message)"
}

New-Item -ItemType Directory -Path $dependencyRoot -Force | Out-Null
try {
    Write-Output "正在获取运行环境安装清单"
    $manifest = Invoke-RestMethod -Uri $ManifestUrl -Method Get -TimeoutSec 60 -MaximumRedirection 0 -Headers @{ "Cache-Control" = "no-cache" }
    $package = Assert-RuntimeDependencyManifest -Manifest $manifest

    $downloaded = $false
    $manifestRefreshed = $false
    $downloadUrls = [Collections.Generic.Queue[string]]::new()
    foreach ($url in @($package.urls)) { $downloadUrls.Enqueue([string]$url) }
    while ($downloadUrls.Count -gt 0) {
        $url = $downloadUrls.Dequeue()
        try {
            Write-Output "正在下载 3D 运行环境"
            Invoke-WebRequest -Uri ([string]$url) -OutFile $archivePath -UseBasicParsing -TimeoutSec 3600 -MaximumRedirection 0
            $downloaded = $true
            break
        } catch {
            $responseProperty = $_.Exception.PSObject.Properties["Response"]
            $statusCode = 0
            if ($responseProperty -and $responseProperty.Value) {
                $statusCode = [int]$responseProperty.Value.StatusCode
                if ($responseProperty.Value -is [IDisposable]) { $responseProperty.Value.Dispose() }
            }
            if (Test-Path -LiteralPath $archivePath) {
                Remove-Item -LiteralPath $archivePath -Force
            }
            if ($statusCode -eq 403 -and -not $manifestRefreshed) {
                $manifestRefreshed = $true
                Write-Output "下载地址已失效，正在重新获取运行环境清单。"
                $manifest = Invoke-RestMethod -Uri $ManifestUrl -Method Get -TimeoutSec 60 -MaximumRedirection 0 -Headers @{ "Cache-Control" = "no-cache" }
                $package = Assert-RuntimeDependencyManifest -Manifest $manifest
                $downloadUrls.Clear()
                foreach ($freshUrl in @($package.urls)) { $downloadUrls.Enqueue([string]$freshUrl) }
                continue
            }
            Write-Output "下载失败，尝试下一个地址。"
        }
    }
    if (-not $downloaded) {
        throw "所有运行环境下载地址均失败。"
    }

    if ((Get-Item -LiteralPath $archivePath).Length -ne [long]$package.downloadSizeBytes) {
        throw "运行环境安装包大小校验失败。"
    }
    Write-Output "正在校验 SHA-256..."
    $actualHash = Get-FileSha256 -Path $archivePath
    if ($actualHash -ne ([string]$package.sha256).ToLowerInvariant()) {
        throw "运行环境安装包 SHA-256 校验失败。"
    }

    $entries = & $tarExecutable -tzf $archivePath
    if ($LASTEXITCODE -ne 0 -or -not $entries) {
        throw "无法读取运行环境压缩包。"
    }
    foreach ($entry in $entries) {
        $normalized = ([string]$entry).Replace("\", "/")
        $first = ($normalized -split "/")[0]
        if (
            $normalized.StartsWith("/") -or
            $normalized -match "^[a-zA-Z]:" -or
            ($normalized -split "/") -contains ".." -or
            @("world-runtime", "splat-transform") -notcontains $first
        ) {
            throw "运行环境压缩包包含非法路径: $entry"
        }
    }

    New-Item -ItemType Directory -Path $stagingPath -Force | Out-Null
    Write-Output "正在解压运行环境..."
    & $tarExecutable -xzf $archivePath -C $stagingPath
    if ($LASTEXITCODE -ne 0) {
        throw "运行环境解压失败。"
    }

    $worldRuntime = Join-Path $stagingPath "world-runtime\ai-anime-world-runtime.exe"
    $splatNode = Join-Path $stagingPath "splat-transform\node.exe"
    $splatCli = Join-Path $stagingPath "splat-transform\node_modules\@playcanvas\splat-transform\bin\cli.mjs"
    foreach ($required in @($worldRuntime, $splatNode, $splatCli)) {
        if (-not (Test-Path -LiteralPath $required -PathType Leaf)) {
            throw "运行环境缺少必要文件: $required"
        }
    }

    $env:HF_ENDPOINT = if ($env:HF_ENDPOINT) { $env:HF_ENDPOINT } else { "https://hf-mirror.com" }
    $env:HF_HUB_DISABLE_XET = if ($env:HF_HUB_DISABLE_XET) { $env:HF_HUB_DISABLE_XET } else { "1" }
    $env:PYTHONIOENCODING = "utf-8"
    $env:PYTHONUTF8 = "1"
    Write-Output "正在检查 3D 推理组件..."
    $worldCheck = Invoke-NativeCommandCapture `
        -Executable $worldRuntime `
        -Arguments @("--runtime-smoke-check")
    Write-Output $worldCheck.Output.Trim()
    if ($worldCheck.ExitCode -ne 0 -or -not $worldCheck.Output.Contains("AI_ANIME_WORLD_RUNTIME_SMOKE")) {
        throw "3D 推理运行环境完整性检查失败: $($worldCheck.Output)"
    }
    $splatCheck = Invoke-NativeCommandCapture `
        -Executable $splatNode `
        -Arguments @($splatCli, "--help")
    Write-Output $splatCheck.Output.Trim()
    if ($splatCheck.ExitCode -ne 0 -or -not $splatCheck.Output.Contains("Transform and Filter Gaussian Splats")) {
        throw "3DGS 转换运行环境完整性检查失败: $($splatCheck.Output)"
    }

    $receipt = [ordered]@{
        schemaVersion = 1
        id = "world"
        version = [string]$package.version
        platform = "win32"
        arch = "x64"
        sha256 = [string]$package.sha256
        downloadSizeBytes = [long]$package.downloadSizeBytes
        installedSizeBytes = [long]$package.installedSizeBytes
        installedAt = [DateTime]::UtcNow.ToString("o")
    }
    $receiptJson = ($receipt | ConvertTo-Json) + [Environment]::NewLine
    [IO.File]::WriteAllText(
        (Join-Path $stagingPath "install.json"),
        $receiptJson,
        [Text.UTF8Encoding]::new($false)
    )

    if (Test-Path -LiteralPath $currentPath) {
        Move-Item -LiteralPath $currentPath -Destination $previousPath
        $movedCurrent = $true
    }
    Move-Item -LiteralPath $stagingPath -Destination $currentPath
    if ($movedCurrent -and (Test-Path -LiteralPath $previousPath)) {
        Remove-SafeRuntimePath -Path $previousPath
        $movedCurrent = $false
    }
    Write-Output "导演世界 3D 运行环境安装完成。"
} catch {
    Write-Output "安装失败: $($_.Exception.Message)"
    if ($movedCurrent -and -not (Test-Path -LiteralPath $currentPath) -and (Test-Path -LiteralPath $previousPath)) {
        Move-Item -LiteralPath $previousPath -Destination $currentPath
        $movedCurrent = $false
    }
    throw
} finally {
    try {
        Remove-SafeRuntimePath -Path $archivePath
        Remove-SafeRuntimePath -Path $stagingPath
    } finally {
        if ($transcriptStarted) {
            try {
                Stop-Transcript | Out-Null
            } catch {
                Write-Output "无法结束安装日志记录: $($_.Exception.Message)"
            }
        }
    }
}
