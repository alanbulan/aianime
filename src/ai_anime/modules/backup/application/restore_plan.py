"""Pure restore configuration and command planning."""

from __future__ import annotations

from pathlib import Path

CELL_SQLITE_RELS = (
    "data.db",
    "chat.db",
)


def derive_region(endpoint: str) -> str:
    """Derive a cn-* region from an Aliyun OSS endpoint."""

    host = endpoint.split("/")[-1]
    first = host.split(".")[0]
    if first.startswith("oss-"):
        first = first[len("oss-") :]
    if first.endswith("-internal"):
        first = first[: -len("-internal")]
    return first


def build_restore_config(
    *,
    bucket: str,
    endpoint: str,
    region: str,
    prefix: str,
    user: str,
    project: str,
    rels: tuple[str, ...],
) -> str:
    blocks = []
    for rel in rels:
        blocks.append(
            f"""  - path: /restore/{rel}
    replica:
      type: oss
      bucket: {bucket}
      path: {prefix}/state/{user}/{project}/{rel}
      endpoint: {endpoint}
      region: {region}
      access-key-id: ${{OSS_ACCESS_KEY_ID}}
      secret-access-key: ${{OSS_SECRET_ACCESS_KEY}}"""
        )
    return "dbs:\n" + "\n".join(blocks) + "\n"


def build_rclone_files_cmd(
    *,
    bucket: str,
    prefix: str,
    user: str,
    project: str,
    dest: Path,
    filter_file: Path,
) -> list[str]:
    return [
        "rclone",
        "copy",
        f"oss:{bucket}/{prefix}/state/{user}/{project}",
        str(dest),
        "--filter-from",
        str(filter_file),
        "--log-level",
        "INFO",
    ]
