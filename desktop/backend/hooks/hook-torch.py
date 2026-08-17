"""PyInstaller hook for the AI anime inference-only PyTorch runtime.

The upstream contrib hook deliberately collects every PyTorch submodule,
including distributed training, compiler backends and the internal test suite.
That graph exceeds PyInstaller's recursion limit and is unrelated to the
SHARP/DA-2 inference path shipped by the desktop client.
"""

from PyInstaller import compat
from PyInstaller.utils.hooks import (
    PY_DYLIB_PATTERNS,
    collect_data_files,
    collect_dynamic_libs,
    collect_submodules,
)

module_collection_mode = "pyz+py"
warn_on_missing_hiddenimports = False

_NON_RUNTIME_PREFIXES = (
    "torch.testing",
    "torch.distributed",
    "torch._inductor",
    "torch._dynamo",
    "torch.export",
    "torch.onnx",
    "torch.profiler",
    "torch.ao",
    "torch.quantization",
    "torch.nn.quantized",
    "torch.nn.quantizable",
    "torch.nn.qat",
    "torch.nn.intrinsic",
    "torch.utils.benchmark",
    "torch.utils.tensorboard",
    "torch.utils.cpp_extension",
    "torch.utils.bottleneck",
    "torch.utils.model_dump",
    "torch.utils.viz",
    "torch.utils.collect_env",
    "torch.utils.hipify",
    "torch.contrib",
    "torch.nativert",
    "torch._numpy",
    "torch.fx.passes.tests",
    "torch.backends._coreml",
    "torch.backends._nnapi",
    "torch.backends.xeon",
)


def _is_inference_module(name: str) -> bool:
    return not any(
        name == prefix or name.startswith(f"{prefix}.")
        for prefix in _NON_RUNTIME_PREFIXES
    )


datas = collect_data_files(
    "torch",
    excludes=[
        "**/*.h",
        "**/*.hpp",
        "**/*.cuh",
        "**/*.lib",
        "**/*.cpp",
        "**/*.pyi",
        "**/*.cmake",
        "**/testing/**",
    ],
)
hiddenimports = collect_submodules("torch", filter=_is_inference_module)
binaries = collect_dynamic_libs(
    "torch",
    search_patterns=PY_DYLIB_PATTERNS + ["*.so.*"],
)

if compat.is_win:
    # PyPI Windows wheels keep the inference DLL set below torch/lib; the
    # dynamic library collector above preserves that directory layout.
    hiddenimports.append("torch._C")
