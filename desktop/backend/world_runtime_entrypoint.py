# Copyright (c) 2026 AI anime

import json
import sys


def _configure_standard_streams() -> None:
    """Keep the frozen Windows worker aligned with the backend UTF-8 pipe."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if callable(reconfigure):
            reconfigure(encoding="utf-8", errors="backslashreplace")


def _run_runtime_smoke_check() -> int:
    """Verify SHARP, DA-2 and the PyTorch inference runtime without model I/O."""
    import huggingface_hub.hub_mixin as hub_mixin
    import safetensors
    import sharp.models
    import torch
    import torchvision
    from plyfile import PlyData
    from safetensors.torch import load_model as load_safetensors_model

    from ai_anime.modules.asset_world.infrastructure.director_world.pano_sharp import (
        find_installed_da2_root,
        load_da2_spherevit_class,
    )

    da2_root = find_installed_da2_root()
    required_da2_files = (
        da2_root / "model" / "spherevit.py",
        da2_root / "model" / "dinov2" / "dinovit.py",
    )
    missing = [str(path) for path in required_da2_files if not path.is_file()]
    if missing:
        raise RuntimeError(f"Missing DA-2 runtime resources: {missing}")
    spherevit = load_da2_spherevit_class()
    if spherevit.__name__ != "SphereViT":
        raise RuntimeError("DA-2 SphereViT runtime could not be loaded")
    if not hasattr(hub_mixin, "safetensors") or not callable(load_safetensors_model):
        raise RuntimeError("Hugging Face safetensors integration is unavailable")

    payload = {
        "ok": True,
        "unicode": "导演世界 中文 ⚠",
        "sharp": bool(sharp.models),
        "safetensors": str(safetensors.__version__),
        "torch": str(torch.__version__),
        "torchvision": str(torchvision.__version__),
        "cuda_compiled": str(torch.version.cuda or ""),
        "cuda_available": bool(torch.cuda.is_available()),
        "cuda_device": (
            str(torch.cuda.get_device_name(0)) if torch.cuda.is_available() else ""
        ),
        "plyfile": bool(PlyData),
        "da2": True,
    }
    print(f"AI_ANIME_WORLD_RUNTIME_SMOKE {json.dumps(payload, ensure_ascii=False)}")
    return 0


if __name__ == "__main__":
    _configure_standard_streams()
    if "--runtime-smoke-check" in sys.argv[1:]:
        raise SystemExit(_run_runtime_smoke_check())

    from ai_anime.modules.asset_world.infrastructure.director_world.pano_sharp import main

    main()
