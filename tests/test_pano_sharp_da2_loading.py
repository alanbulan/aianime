from __future__ import annotations

import importlib.util
import sys
from types import ModuleType

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


def test_managed_world_models_fail_before_hidden_download(tmp_path, monkeypatch):
    from ai_anime.modules.asset_world.infrastructure.director_world import pano_splat_tasks

    sharp_path = tmp_path / "world-models" / "sharp.pt"
    da2_root = tmp_path / "world-models" / "da2"
    monkeypatch.setenv("AI_ANIME_SHARP_MODEL_PATH", str(sharp_path))
    monkeypatch.setenv("AI_ANIME_DA2_MODEL_PATH", str(da2_root))

    assert pano_splat_tasks._sharp_checkpoint_path() == sharp_path
    assert "等待安装 SHARP 模型" in pano_splat_tasks._sharp_start_message("master", "cpu")
    with pytest.raises(RuntimeError, match="安装导演世界大型模型"):
        pano_splat_tasks._require_managed_world_models(
            require_sharp=True,
            require_da2=True,
        )

    sharp_path.parent.mkdir(parents=True)
    sharp_path.write_bytes(b"sharp")
    da2_root.mkdir(parents=True)
    (da2_root / "model.safetensors").write_bytes(b"da2")
    pano_splat_tasks._require_managed_world_models(
        require_sharp=True,
        require_da2=True,
    )


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


def test_da2_loader_reads_managed_local_directory(tmp_path, monkeypatch):
    torch = pytest.importorskip("torch")
    pano_sharp = _load_pano_sharp_module()
    model_root = tmp_path / "da2"
    model_root.mkdir()
    (model_root / "model.safetensors").write_bytes(b"fixture")
    calls = []

    class FakeSphereViT:
        @classmethod
        def from_pretrained(cls, source, **kwargs):
            calls.append((source, kwargs))
            return cls()

        def eval(self):
            return self

        def to(self, device):
            return self

    monkeypatch.setenv("AI_ANIME_DA2_MODEL_PATH", str(model_root))
    monkeypatch.setattr(pano_sharp, "load_da2_spherevit_class", lambda: FakeSphereViT)

    pano_sharp.build_da2_model(torch.device("cpu"))

    assert calls == [
        (
            str(model_root),
            {"config": pano_sharp.DA2_CONFIG, "local_files_only": True},
        )
    ]


def test_sharp_loader_reads_managed_file_without_network(tmp_path, monkeypatch):
    torch = pytest.importorskip("torch")
    pano_sharp = _load_pano_sharp_module()
    checkpoint = tmp_path / "sharp.pt"
    checkpoint.write_bytes(b"fixture")
    loaded = {}

    class FakePredictor:
        def load_state_dict(self, value):
            loaded["state"] = value

        def eval(self):
            return self

        def to(self, device):
            loaded["device"] = device
            return self

    sharp_module = ModuleType("sharp")
    sharp_models = ModuleType("sharp.models")
    sharp_models.PredictorParams = lambda: object()
    sharp_models.create_predictor = lambda _params: FakePredictor()
    monkeypatch.setitem(sys.modules, "sharp", sharp_module)
    monkeypatch.setitem(sys.modules, "sharp.models", sharp_models)
    monkeypatch.setattr(
        pano_sharp.torch,
        "load",
        lambda path, **kwargs: {
            "path": str(path),
            "kwargs": kwargs,
        },
    )
    monkeypatch.setattr(
        pano_sharp.torch.hub,
        "load_state_dict_from_url",
        lambda *_args, **_kwargs: pytest.fail("managed SHARP must not use the network"),
    )

    result = pano_sharp.build_sharp_model(str(checkpoint), torch.device("cpu"))

    assert isinstance(result, FakePredictor)
    assert loaded["state"]["path"] == str(checkpoint)
    assert loaded["state"]["kwargs"]["weights_only"] is True
