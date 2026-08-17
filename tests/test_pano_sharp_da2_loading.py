from __future__ import annotations

import importlib.util
import sys

import pytest


def test_pano_sharp_module_imports_without_world_extra(monkeypatch):
    from ai_anime.modules.asset_world.infrastructure.director_world import pano_sharp

    real_find_spec = importlib.util.find_spec

    def fake_find_spec(name: str, *args, **kwargs):
        if name in {"sharp", "da2"}:
            return None
        return real_find_spec(name, *args, **kwargs)

    monkeypatch.setattr(importlib.util, "find_spec", fake_find_spec)

    assert pano_sharp.sharp_available() is False
    assert pano_sharp.da2_available() is False


def test_pano_sharp_unavailable_is_handled_task_failure():
    from ai_anime.modules.asset_world.infrastructure.director_world.pano_sharp import (
        Sharp3DUnavailable,
    )
    from ai_anime.modules.task_execution.application.project_task_execution import (
        project_task_failure_for_exception,
    )

    message, payload, handled = project_task_failure_for_exception(Sharp3DUnavailable())

    assert handled is True
    assert payload == {"error_code": "SHARP_3D_UNAVAILABLE"}
    assert "world" in message


def test_run_pano_sharp_missing_sharp_fails_before_subprocess(tmp_path, monkeypatch):
    from PIL import Image

    from ai_anime.modules.asset_world.infrastructure.director_world import (
        pano_sharp,
        pano_splat_tasks,
    )

    pano_path = tmp_path / "pano_360.png"
    Image.new("RGB", (8, 4), "white").save(pano_path)

    monkeypatch.setattr(pano_sharp, "sharp_available", lambda: False)
    monkeypatch.setattr(
        pano_splat_tasks,
        "run_project_subprocess",
        lambda *_args, **_kwargs: pytest.fail("SHARP subprocess should not be spawned"),
    )

    with pytest.raises(pano_sharp.Sharp3DUnavailable) as exc:
        pano_splat_tasks.run_pano_sharp(
            tmp_path,
            "scene_a",
            pano_path=pano_path,
            artifact_dir=tmp_path / "stage",
            update_manifest=False,
        )

    assert exc.value.error_code == "SHARP_3D_UNAVAILABLE"


def test_run_single_face_sharp_missing_sharp_fails_before_subprocess(tmp_path, monkeypatch):
    from PIL import Image

    from ai_anime.modules.asset_world.infrastructure.director_world import (
        pano_sharp,
        pano_splat_tasks,
    )

    image_path = tmp_path / "master.png"
    Image.new("RGB", (4, 4), "white").save(image_path)

    monkeypatch.setattr(pano_sharp, "sharp_available", lambda: False)
    monkeypatch.setattr(
        pano_splat_tasks,
        "run_project_subprocess",
        lambda *_args, **_kwargs: pytest.fail("SHARP subprocess should not be spawned"),
    )

    with pytest.raises(pano_sharp.Sharp3DUnavailable) as exc:
        pano_splat_tasks.run_single_face_sharp(
            tmp_path,
            "scene_a",
            image_path=image_path,
            artifact_dir=tmp_path / "stage",
            update_manifest=False,
        )

    assert exc.value.error_code == "SHARP_3D_UNAVAILABLE"


def test_pano_sharp_worker_command_uses_packaged_world_runtime(tmp_path, monkeypatch):
    from ai_anime.modules.asset_world.infrastructure.director_world import pano_splat_tasks

    runtime = tmp_path / "ai-anime-world-runtime.exe"
    runtime.write_bytes(b"runtime")
    monkeypatch.setenv("AI_ANIME_WORLD_RUNTIME_BIN", str(runtime))
    monkeypatch.setattr(sys, "frozen", True, raising=False)

    assert pano_splat_tasks._pano_sharp_command() == [str(runtime)]


def test_pano_sharp_worker_command_rejects_incomplete_frozen_package(monkeypatch):
    from ai_anime.modules.asset_world.infrastructure.director_world import pano_splat_tasks

    monkeypatch.delenv("AI_ANIME_WORLD_RUNTIME_BIN", raising=False)
    monkeypatch.setattr(sys, "frozen", True, raising=False)

    with pytest.raises(RuntimeError, match="设置 → 环境依赖"):
        pano_splat_tasks._pano_sharp_command()


def test_pano_sharp_worker_command_uses_python_module_when_not_frozen(monkeypatch):
    from ai_anime.modules.asset_world.infrastructure.director_world import pano_splat_tasks

    monkeypatch.delattr(sys, "frozen", raising=False)
    monkeypatch.delenv("AI_ANIME_WORLD_RUNTIME_BIN", raising=False)

    assert pano_splat_tasks._pano_sharp_command() == [
        sys.executable,
        "-m",
        "ai_anime.modules.asset_world.infrastructure.director_world.pano_sharp",
    ]


def test_sharp_progress_distinguishes_first_download_from_cached_model(tmp_path, monkeypatch):
    from ai_anime.modules.asset_world.infrastructure.director_world import pano_splat_tasks

    monkeypatch.setenv("TORCH_HOME", str(tmp_path))
    first_message = pano_splat_tasks._sharp_start_message("master", "auto")

    assert "首次下载 SHARP 模型（约 2.81 GB" in first_message
    assert "GPU 优先" in first_message

    checkpoint = pano_splat_tasks._sharp_checkpoint_path()
    checkpoint.parent.mkdir(parents=True)
    checkpoint.write_bytes(b"cached")

    cached_message = pano_splat_tasks._sharp_start_message("master", "auto")
    assert "加载已缓存的 SHARP 模型" in cached_message
    assert "首次下载" not in cached_message


def test_sharp_device_is_read_from_worker_output():
    from ai_anime.modules.asset_world.infrastructure.director_world import pano_splat_tasks

    output = "Running SHARP on 1 cubemap face(s), face_size=768, internal_size=1536, device=cuda\n"
    assert pano_splat_tasks._sharp_device_from_output(output) == "cuda"


def test_sharp_checkpoint_prefers_domestic_mirror_with_upstream_fallback():
    from ai_anime.modules.asset_world.infrastructure.director_world import pano_sharp

    if pano_sharp.SHARP_DOMESTIC_MODEL_URL:
        assert pano_sharp._sharp_model_download_urls(
            pano_sharp.SHARP_DOMESTIC_MODEL_URL
        ) == (
            pano_sharp.SHARP_DOMESTIC_MODEL_URL,
            pano_sharp.SHARP_UPSTREAM_MODEL_URL,
        )
    else:
        assert pano_sharp.DEFAULT_MODEL_URL == pano_sharp.SHARP_UPSTREAM_MODEL_URL
    custom = "https://mirror.example.cn/sharp.pt"
    assert pano_sharp._sharp_model_download_urls(custom) == (custom,)



def _load_pano_sharp_module():
    from ai_anime.modules.asset_world.infrastructure.director_world import pano_sharp

    return pano_sharp


def test_da2_loader_uses_huggingface_when_local_only_env_unset(monkeypatch):
    torch = pytest.importorskip("torch")
    pano_sharp = _load_pano_sharp_module()
    calls = []

    class FakeSphereViT:
        @classmethod
        def from_pretrained(cls, hub_id, **kwargs):
            calls.append((hub_id, kwargs))
            return cls()

        def eval(self):
            return self

        def to(self, device):
            return self

    monkeypatch.delenv("DA2_LOCAL_FILES_ONLY", raising=False)
    monkeypatch.setattr(pano_sharp, "load_da2_spherevit_class", lambda: FakeSphereViT)

    pano_sharp.build_da2_model(torch.device("cpu"))

    assert calls[0][1]["local_files_only"] is False


def test_da2_loader_keeps_explicit_local_only_env(monkeypatch):
    torch = pytest.importorskip("torch")
    pano_sharp = _load_pano_sharp_module()
    calls = []

    class FakeSphereViT:
        @classmethod
        def from_pretrained(cls, hub_id, **kwargs):
            calls.append((hub_id, kwargs))
            return cls()

        def eval(self):
            return self

        def to(self, device):
            return self

    monkeypatch.setenv("DA2_LOCAL_FILES_ONLY", "1")
    monkeypatch.setattr(pano_sharp, "load_da2_spherevit_class", lambda: FakeSphereViT)

    pano_sharp.build_da2_model(torch.device("cpu"))

    assert calls[0][1]["local_files_only"] is True
