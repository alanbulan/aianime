"""Creative Canvas local text-source adapter."""

from pathlib import Path


class LocalCreativeCanvasTextSourceReader:
    def read(self, source_path: Path) -> str:
        decode_error: UnicodeDecodeError | None = None
        for encoding in ("utf-8", "utf-8-sig", "gb18030"):
            try:
                return source_path.read_text(encoding=encoding)
            except UnicodeDecodeError as exc:
                decode_error = exc
        if decode_error is None:
            raise RuntimeError("text source decoding failed without an error")
        raise decode_error
