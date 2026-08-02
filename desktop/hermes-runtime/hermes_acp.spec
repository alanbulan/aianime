from pathlib import Path

from PyInstaller.utils.hooks import collect_all, copy_metadata


packages = (
    "acp_adapter",
    "agent",
    "cron",
    "gateway",
    "hermes_cli",
    "plugins",
    "providers",
    "tools",
    "tui_gateway",
)
top_level_modules = (
    "batch_runner",
    "cli",
    "hermes_bootstrap",
    "hermes_constants",
    "hermes_logging",
    "hermes_state",
    "hermes_time",
    "mcp_serve",
    "model_tools",
    "run_agent",
    "toolset_distributions",
    "toolsets",
    "trajectory_compressor",
    "utils",
)

datas = []
binaries = []
hiddenimports = list(top_level_modules)
for package in packages:
    package_datas, package_binaries, package_hiddenimports = collect_all(package)
    datas += package_datas
    binaries += package_binaries
    hiddenimports += package_hiddenimports
datas += copy_metadata("hermes-agent")
datas += copy_metadata("agent-client-protocol")

analysis = Analysis(
    [str(Path(SPECPATH) / "hermes_acp.py")],
    pathex=[SPECPATH],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(analysis.pure)
executable = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="hermes-acp",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
)
collection = COLLECT(
    executable,
    analysis.binaries,
    analysis.datas,
    strip=False,
    upx=False,
    name="hermes-acp",
)
