from pathlib import Path


def test_scene_360_command_has_no_provider_override(monkeypatch, tmp_path):
    from ai_anime.modules.asset_world.infrastructure.director_world import scene_360_tasks

    captured: dict[str, object] = {}

    def fake_run(args, **kwargs):
        captured["args"] = list(args)
        generation_dir = Path(args[args.index("--output-dir") + 1])
        generation_dir.mkdir(parents=True, exist_ok=True)
        (generation_dir / "scene_panorama_2to1.png").write_bytes(b"image")
        return type("Result", (), {"returncode": 0, "stdout": "", "stderr": ""})()

    monkeypatch.setattr(scene_360_tasks, "run_project_model_subprocess", fake_run)
    monkeypatch.setattr(scene_360_tasks, "_reserve_scene_360_model_call", lambda *a, **k: "")
    monkeypatch.setattr(scene_360_tasks, "_confirm_scene_360_model_call", lambda *a, **k: None)

    result = scene_360_tasks.run_scene_360(
        tmp_path,
        "scene",
        source="text",
        model="catalog-scene-model",
        artifact_dir=tmp_path / "artifact",
        update_manifest=False,
    )

    assert result["provider"] == "commercial"
    assert "--provider" not in captured["args"]
    assert captured["args"][captured["args"].index("--model") + 1] == (
        "catalog-scene-model"
    )


def test_scene_360_command_uses_packaged_worker_dispatch(monkeypatch, tmp_path):
    import sys

    from ai_anime.modules.asset_world.infrastructure.director_world import scene_360_tasks

    captured: dict[str, object] = {}

    def fake_run(args, **kwargs):
        captured["args"] = list(args)
        generation_dir = Path(args[args.index("--output-dir") + 1])
        generation_dir.mkdir(parents=True, exist_ok=True)
        (generation_dir / "scene_panorama_2to1.png").write_bytes(b"image")
        return type("Result", (), {"returncode": 0, "stdout": "", "stderr": ""})()

    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", "ai-anime-backend.exe")
    monkeypatch.setattr(scene_360_tasks, "run_project_model_subprocess", fake_run)
    monkeypatch.setattr(scene_360_tasks, "_reserve_scene_360_model_call", lambda *a, **k: "")
    monkeypatch.setattr(scene_360_tasks, "_confirm_scene_360_model_call", lambda *a, **k: None)

    scene_360_tasks.run_scene_360(
        tmp_path,
        "scene",
        source="text",
        model="catalog-scene-model",
        artifact_dir=tmp_path / "artifact",
        update_manifest=False,
    )

    assert captured["args"][:3] == [
        "ai-anime-backend.exe",
        "--internal-worker",
        "scene-360-builder",
    ]
