# Copyright (c) 2026 AI anime

from pathlib import Path
import sys

from PyInstaller.utils.hooks import collect_data_files, collect_submodules, copy_metadata

repo_root = Path(SPECPATH).parents[1]
source_root = repo_root / "src"

# The inference worker is intentionally isolated from the API backend. Its
# graph is finite but PyTorch still nests the module graph deeply.
sys.setrecursionlimit(max(sys.getrecursionlimit(), 20_000))

datas = collect_data_files("da2", include_py_files=True)
datas += collect_data_files("sharp", include_py_files=False)
datas += copy_metadata("safetensors")

hiddenimports = collect_submodules("sharp.models")
hiddenimports += collect_submodules("torchvision")
hiddenimports += collect_submodules("torch._dynamo.polyfills")
hiddenimports += collect_submodules("safetensors")
hiddenimports += [
    "sharp.utils.gaussians",
    "sharp.utils.linalg",
    "torch.nn.functional",
]

# This worker only serves SHARP prediction and DA-2 SphereViT inference.  The
# generic PyInstaller hooks otherwise collect optional analytics, dataframe,
# plotting and ONNX stacks that neither inference path imports.
unused_python_stacks = [
    "lxml",
    "matplotlib",
    "onnxruntime",
    "pandas",
    "pyarrow",
]

analysis = Analysis(
    [str(Path(SPECPATH) / "world_runtime_entrypoint.py")],
    pathex=[str(source_root)],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[str(Path(SPECPATH) / "hooks")],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        "tensorflow",
        "gsplat",
        "accelerate",
        "sharp.cli",
        "sharp.data",
        "sharp.evaluate",
        "sharp.trainers",
        *unused_python_stacks,
    ],
    noarchive=False,
)

# The Windows CUDA wheel contains optional profiler, multi-GPU solver, random
# generator, alternate NVRTC and cuDNN advanced-op components. SHARP's real
# 1536px CUDA inference path was verified with these binaries absent. The
# retained cuDNN engine/runtime libraries are loaded dynamically and must stay.
unused_cuda_binaries = {
    "cudnn_adv64_9.dll",
    "curand64_10.dll",
    "cusolvermg64_11.dll",
    "nvperf_host.dll",
    "nvrtc64_120_0.alt.dll",
}
analysis.binaries = [
    item
    for item in analysis.binaries
    if Path(item[0]).name.lower() not in unused_cuda_binaries
]
pyz = PYZ(analysis.pure)
executable = EXE(
    pyz,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="ai-anime-world-runtime",
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
    name="ai-anime-world-runtime",
)
