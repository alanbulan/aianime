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
    "cognee",
    include_py_files=False,
    excludes=[
        ".cognee_system/**",
        ".cognee_cache/**",
        ".data_storage/**",
        "tests/**",
        "modules/notebooks/**",
        "eval_framework/**",
    ],
)
datas += collect_data_files(
    "cognee",
    includes=["alembic/**/*.py"],
    include_py_files=True,
)
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
datas += collect_data_files("litellm.containers")
datas += collect_data_files("faster_whisper")
datas += copy_metadata("genai-prices")
datas += copy_metadata("pydantic-ai-slim")
hiddenimports = collect_submodules("ai_anime")
hiddenimports += collect_submodules("litellm.litellm_core_utils.tokenizers")
hiddenimports += collect_submodules("faster_whisper")
hiddenimports += collect_submodules("tiktoken_ext")
hiddenimports += collect_submodules("ladybug")

analysis = Analysis(
    [str(Path(SPECPATH) / "entrypoint.py")],
    pathex=[str(source_root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tensorflow",
        "torch",
        "torchvision",
        "sharp",
        "da2",
        # Stale optional imports requested by third-party PyInstaller hooks.
        # The application uses PyMySQL/psycopg 3, pycparser 3 no longer uses
        # generated parser tables, and SciPy 1.17 no longer ships _cdflib.
        "MySQLdb",
        "pysqlite2",
        "psycopg2",
        "pycparser.lextab",
        "pycparser.yacctab",
        "scipy.special._cdflib",
    ],
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
