# Copyright (c) 2026 AI anime

from pathlib import Path

from PyInstaller.utils.hooks import (
    collect_data_files,
    collect_submodules,
    copy_metadata,
)

repo_root = Path(SPECPATH).parents[1]
source_root = repo_root / "src"

datas = collect_data_files("ai_anime", include_py_files=False)
datas += collect_data_files(
    "litellm",
    includes=[
        "anthropic_beta_headers_config.json",
        "blog_posts.json",
        "cost.json",
        "model_prices_and_context_window_backup.json",
        "policy_templates_backup.json",
        "provider_endpoints_support_backup.json",
    ],
)
datas += collect_data_files("litellm.litellm_core_utils.tokenizers")
datas += copy_metadata("genai-prices")
datas += copy_metadata("pydantic-ai-slim")
hiddenimports = collect_submodules("ai_anime")
hiddenimports += collect_submodules("litellm.litellm_core_utils.tokenizers")

analysis = Analysis(
    [str(Path(SPECPATH) / "entrypoint.py")],
    pathex=[str(source_root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["torch", "torchvision", "tensorflow"],
    noarchive=False,
)
pyz = PYZ(analysis.pure)
executable = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="ai-anime-backend",
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
    name="ai-anime-backend",
)
