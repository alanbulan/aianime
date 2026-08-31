"""Shared command and dispatch protocol for packaged internal workers."""

from __future__ import annotations

import importlib
import sys
from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True, slots=True)
class InternalWorkerSpec:
    name: str
    module: str


def internal_worker_command(worker: InternalWorkerSpec) -> list[str]:
    """Build a worker command for source and frozen runtimes."""

    if bool(getattr(sys, "frozen", False)):
        return [sys.executable, "--internal-worker", worker.name]
    return [sys.executable, "-m", worker.module]


def dispatch_internal_worker(
    workers: Sequence[InternalWorkerSpec],
    args: Sequence[str] | None = None,
) -> int | None:
    """Dispatch one allowlisted worker after parsing the shared argv protocol."""

    worker_args = list(sys.argv[1:] if args is None else args)
    if not worker_args or worker_args[0] != "--internal-worker":
        return None
    if len(worker_args) < 2:
        raise SystemExit("--internal-worker requires a worker name")

    registry: dict[str, InternalWorkerSpec] = {}
    for worker in workers:
        if worker.name in registry:
            raise RuntimeError(f"Duplicate internal worker name: {worker.name}")
        registry[worker.name] = worker

    worker_name = worker_args[1]
    worker = registry.get(worker_name)
    if worker is None:
        allowed = ", ".join(sorted(registry))
        raise SystemExit(
            f"Unknown internal worker '{worker_name}'. Allowed: {allowed}"
        )

    module = importlib.import_module(worker.module)
    main = getattr(module, "main", None)
    if not callable(main):
        raise RuntimeError(f"Internal worker has no callable main(): {worker.module}")
    original_argv = sys.argv
    try:
        sys.argv = [worker.module, *worker_args[2:]]
        result = main()
    finally:
        sys.argv = original_argv
    return int(result) if isinstance(result, int) else 0


__all__ = [
    "InternalWorkerSpec",
    "dispatch_internal_worker",
    "internal_worker_command",
]
