"""Download and verify the pinned multilingual Faster Whisper base model."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import urllib.request
from pathlib import Path

MODEL_REPOSITORY = "Systran/faster-whisper-base"
MODEL_REVISION = "ebe41f70d5b6dfa9166e2c581c45c9c0cfc57b66"
FILES = {
    "config.json": ("git-sha1", "867cf1a0fece1394e01d55e287ba2f09a577c046"),
    "model.bin": ("sha256", "d01c3014881c9c6f3133c182f3d2887eb6ca1c789a7538c5c007196857a0a6a9"),
    "tokenizer.json": ("git-sha1", "7818adb6de9fa3064d3ff81226fdd675be1f6344"),
    "vocabulary.txt": ("git-sha1", "c9074644d9d1205686f16d411564729461324b75"),
}


def checksum(path: Path, algorithm: str) -> str:
    if algorithm == "sha256":
        digest = hashlib.sha256()
        with path.open("rb") as source:
            for chunk in iter(lambda: source.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()
    if algorithm == "git-sha1":
        data = path.read_bytes()
        return hashlib.sha1(f"blob {len(data)}\0".encode() + data).hexdigest()
    raise ValueError(f"Unsupported checksum algorithm: {algorithm}")


def verified(path: Path, algorithm: str, expected: str) -> bool:
    return path.is_file() and checksum(path, algorithm) == expected


def download(url: str, destination: Path) -> None:
    partial = destination.with_suffix(destination.suffix + ".part")
    request = urllib.request.Request(
        url,
        headers={"User-Agent": "AI-anime-Desktop-Build"},
    )
    with urllib.request.urlopen(request, timeout=120) as response, partial.open("wb") as output:
        shutil.copyfileobj(response, output, length=1024 * 1024)
    os.replace(partial, destination)


def main() -> None:
    desktop_root = Path(__file__).resolve().parents[1]
    cache_dir = desktop_root / ".whisper-cache" / MODEL_REVISION
    model_dir = desktop_root / "runtime" / "whisper" / "faster-whisper-base"
    cache_dir.mkdir(parents=True, exist_ok=True)
    model_dir.mkdir(parents=True, exist_ok=True)

    for name, (algorithm, expected) in FILES.items():
        cached = cache_dir / name
        if not verified(cached, algorithm, expected):
            cached.unlink(missing_ok=True)
            download(
                f"https://huggingface.co/{MODEL_REPOSITORY}/resolve/{MODEL_REVISION}/{name}",
                cached,
            )
        if not verified(cached, algorithm, expected):
            raise RuntimeError(f"Whisper model checksum verification failed: {name}")
        destination = model_dir / name
        if not verified(destination, algorithm, expected):
            shutil.copy2(cached, destination)

    source = {
        "source": MODEL_REPOSITORY,
        "revision": MODEL_REVISION,
        "model": "base",
        "language": "multilingual",
        "files": {
            name: {"algorithm": algorithm, "checksum": expected}
            for name, (algorithm, expected) in FILES.items()
        },
    }
    (model_dir.parent / "SOURCE.json").write_text(
        json.dumps(source, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Whisper model ready: {model_dir}")


if __name__ == "__main__":
    main()
