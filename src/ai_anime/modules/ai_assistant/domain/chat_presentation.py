"""Chat text and JSON Render presentation rules."""

from __future__ import annotations

import copy
import json
import re
from collections.abc import Callable
from typing import Any

JsonRenderErrorHandler = Callable[[ValueError, str], None]

_UI_SPEC_BLOCK_RE = re.compile(
    r"<ui-spec\b[^>]*>(.*?)</ui-spec>", re.IGNORECASE | re.DOTALL
)
_UI_SPEC_FENCE_RE = re.compile(
    r"```(?:json-render|ui-spec|json)?\s*(<ui-spec\b[\s\S]*?</ui-spec>)\s*```",
    re.IGNORECASE,
)
_LOCAL_FILESYSTEM_PATH_RE = re.compile(
    r"(?<![\w./-])(?:~|/Users/[^\s`'\"<>)]+)(?:/[^\s`'\"<>)]+)+"
)
_INVALID_UI_SPEC_MESSAGE = (
    "（json-render 格式校验失败：模型返回的 ui-spec 不是合法 canonical JSON，"
    "已阻止展示。请重新生成。）"
)
_MERGEABLE_MEDIA_SPEC_TYPES = {
    "character_showcase",
    "sketch_gallery",
    "keyframe_video",
    "audio_list",
}


def _report_error(
    handler: JsonRenderErrorHandler | None,
    error: ValueError,
    body: str,
) -> None:
    if handler is not None:
        handler(error, body)


def json_loads_with_trailing_repair(raw: str) -> Any:
    text = str(raw or "").strip()
    if not text:
        raise ValueError("empty ui-spec")
    first_object = text.find("{")
    first_array = text.find("[")
    starts = [index for index in (first_object, first_array) if index >= 0]
    if not starts:
        raise ValueError("ui-spec does not contain JSON")
    start = min(starts)
    text = text[start:].strip()

    candidates = [text]
    stack: list[str] = []
    in_string = False
    escaped = False
    for char in text:
        if escaped:
            escaped = False
            continue
        if char == "\\":
            escaped = True
            continue
        if char == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if char == "{":
            stack.append("}")
        elif char == "[":
            stack.append("]")
        elif char in {"}", "]"} and stack and stack[-1] == char:
            stack.pop()
    if 0 < len(stack) <= 4:
        candidates.append(text + "".join(reversed(stack)))

    last_object = text.rfind("}")
    last_array = text.rfind("]")
    end = max(last_object, last_array)
    if end >= 0:
        candidates.append(text[: end + 1])

    errors: list[str] = []
    for candidate in dict.fromkeys(candidates):
        try:
            return json.loads(candidate)
        except json.JSONDecodeError as exc:
            errors.append(str(exc))
    raise ValueError("; ".join(errors) or "invalid ui-spec JSON")


def canonicalize_ui_spec(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError("ui-spec root must be an object")
    spec = dict(value)
    spec_type = spec.get("type")
    root = spec.get("root")
    elements = spec.get("elements")
    if not isinstance(spec_type, str) or not spec_type.strip():
        raise ValueError("ui-spec.type is required")
    if not isinstance(root, str) or not root.strip():
        raise ValueError("ui-spec.root is required")
    if not isinstance(elements, dict) or not elements:
        raise ValueError("ui-spec.elements is required")
    if root not in elements:
        raise ValueError("ui-spec.root must point to an element")

    canonical_elements: dict[str, Any] = {}
    for key, element in elements.items():
        if not isinstance(key, str) or not key:
            raise ValueError("ui-spec element keys must be strings")
        if not isinstance(element, dict):
            raise ValueError(f"ui-spec element {key} must be an object")
        element_type = element.get("type")
        if not isinstance(element_type, str) or not element_type.strip():
            raise ValueError(f"ui-spec element {key}.type is required")
        props = element.get("props")
        children = element.get("children")
        if props is None:
            props = {}
        if children is None:
            children = []
        if not isinstance(props, dict):
            raise ValueError(f"ui-spec element {key}.props must be an object")
        if not isinstance(children, list) or not all(
            isinstance(child, str) for child in children
        ):
            raise ValueError(f"ui-spec element {key}.children must be a string array")
        normalized_props = dict(props)
        legacy_text = normalized_props.get("children")
        if isinstance(legacy_text, str):
            if (
                element_type in {"Text", "Heading"}
                and "content" not in normalized_props
            ):
                normalized_props["content"] = legacy_text
                normalized_props.pop("children", None)
            elif element_type == "Badge" and "label" not in normalized_props:
                normalized_props["label"] = legacy_text
                normalized_props.pop("children", None)

        if element_type == "Stack" and "direction" not in normalized_props:
            if normalized_props.get("row") is True:
                normalized_props["direction"] = "row"
            elif normalized_props.get("row") is False:
                normalized_props["direction"] = "column"

        canonical_elements[key] = {
            **element,
            "type": element_type,
            "props": normalized_props,
            "children": children,
        }

    reachable: set[str] = set()
    pending = [root]
    while pending:
        key = pending.pop()
        if key in reachable:
            continue
        element = canonical_elements.get(key)
        if element is None:
            raise ValueError(f"ui-spec references missing child {key}")
        reachable.add(key)
        pending.extend(element["children"])

    spec["type"] = spec_type
    spec["root"] = root
    spec["elements"] = canonical_elements
    return spec


def ui_spec_json(spec: dict[str, Any]) -> tuple[str, str]:
    canonical = canonicalize_ui_spec(spec)
    spec_type = (
        canonical.get("type") if isinstance(canonical.get("type"), str) else "ui_spec"
    )
    return spec_type, json.dumps(canonical, ensure_ascii=False, indent=2)


def wrap_ui_spec_json(spec_type: str, json_text: str) -> str:
    return f'<ui-spec type="{spec_type}">\n{json_text}\n</ui-spec>'


def _wrap_ui_spec_bundle(specs: list[dict[str, Any]]) -> str:
    canonical_specs = [canonicalize_ui_spec(spec) for spec in specs]
    if len(canonical_specs) == 1:
        spec_type = canonical_specs[0].get("type")
        return wrap_ui_spec_json(
            spec_type if isinstance(spec_type, str) and spec_type else "ui_spec",
            json.dumps(canonical_specs[0], ensure_ascii=False, indent=2),
        )
    return wrap_ui_spec_json(
        "media_bundle",
        json.dumps(canonical_specs, ensure_ascii=False, indent=2),
    )


def _ui_spec_block(spec: dict[str, Any]) -> str:
    spec_type, json_text = ui_spec_json(spec)
    return wrap_ui_spec_json(spec_type, json_text)


def _normalize_single_ui_spec_block(
    body: str,
    report_error: JsonRenderErrorHandler | None,
) -> str:
    nested_start = body.lower().rfind("<ui-spec")
    if nested_start >= 0:
        close_index = body.lower().find("</ui-spec>", nested_start)
        if close_index >= 0:
            nested_block = body[nested_start : close_index + len("</ui-spec>")]
            return normalize_json_render_reply(
                nested_block,
                report_error=report_error,
            )

    try:
        value = json_loads_with_trailing_repair(body)
        if isinstance(value, list):
            specs = [canonicalize_ui_spec(item) for item in value]
            return _wrap_ui_spec_bundle(specs)
        spec = canonicalize_ui_spec(value)
    except ValueError as exc:
        _report_error(report_error, exc, body)
        return _INVALID_UI_SPEC_MESSAGE

    spec_type = spec.get("type") if isinstance(spec.get("type"), str) else "ui_spec"
    json_text = json.dumps(spec, ensure_ascii=False, indent=2)
    return wrap_ui_spec_json(spec_type, json_text)


def normalize_json_render_reply(
    content: str,
    *,
    report_error: JsonRenderErrorHandler | None = None,
) -> str:
    text = str(content or "")
    text = _wrap_embedded_ui_spec_json(text)
    if "<ui-spec" not in text.lower():
        return text
    text = _UI_SPEC_FENCE_RE.sub(lambda match: match.group(1).strip(), text)
    return _UI_SPEC_BLOCK_RE.sub(
        lambda match: _normalize_single_ui_spec_block(
            match.group(1),
            report_error,
        ),
        text,
    )


def _wrap_embedded_ui_spec_json(content: str) -> str:
    text = str(content or "")
    if "<ui-spec" in text.lower():
        return text
    if '"elements"' not in text or '"root"' not in text:
        return text

    decoder = json.JSONDecoder()
    index = 0
    parts: list[str] = []
    changed = False
    while index < len(text):
        start = text.find("{", index)
        if start < 0:
            parts.append(text[index:])
            break
        parts.append(text[index:start])
        try:
            value, end = decoder.raw_decode(text[start:])
        except json.JSONDecodeError:
            parts.append(text[start : start + 1])
            index = start + 1
            continue
        if isinstance(value, dict):
            try:
                spec = canonicalize_ui_spec(value)
            except ValueError:
                spec = None
            if spec is not None:
                parts.append(_ui_spec_block(spec))
                index = start + end
                changed = True
                continue
        parts.append(text[start : start + end])
        index = start + end

    if not changed:
        return text
    return re.sub(r"\n{3,}", "\n\n", "".join(parts)).strip()


def redact_local_filesystem_paths(content: str) -> str:
    text = str(content or "")
    if not text:
        return ""
    return _LOCAL_FILESYSTEM_PATH_RE.sub("[本地路径]", text)


def _strip_media_rendering_leaks(content: str) -> str:
    lines: list[str] = []
    for line in str(content or "").splitlines():
        stripped = line.strip()
        lower = stripped.lower()
        if not stripped:
            lines.append(line)
            continue
        if "<ui-spec" in lower or "ui-spec" in lower or "ui_spec" in lower:
            continue
        if (
            "json-render" in lower
            or "automatically rendered" in lower
            or "backend" in lower
        ):
            continue
        if "ai_anime_" in lower:
            continue
        if "按规范渲染" in stripped or "UI画廊" in stripped:
            continue
        lines.append(line)
    text = redact_local_filesystem_paths("\n".join(lines).strip())
    return re.sub(r"\n{3,}", "\n\n", text)


def _strip_embedded_ui_spec_json_text(content: str) -> str:
    text = str(content or "")
    pattern = re.compile(
        r'\{\s*"type"\s*:\s*"(?:character_showcase|sketch_gallery|keyframe_video|audio_list|media_bundle)"'
    )
    index = 0
    parts: list[str] = []
    decoder = json.JSONDecoder()
    changed = False

    while True:
        match = pattern.search(text, index)
        if not match:
            parts.append(text[index:])
            break
        start = match.start()
        parts.append(text[index:start])
        try:
            value, end = decoder.raw_decode(text[start:])
        except json.JSONDecodeError:
            next_paragraph = text.find("\n\n", start)
            index = len(text) if next_paragraph < 0 else next_paragraph
            changed = True
            continue
        if isinstance(value, dict):
            try:
                canonicalize_ui_spec(value)
                index = start + end
                changed = True
                continue
            except ValueError:
                pass
        parts.append(text[start : start + end])
        index = start + end

    if not changed:
        return text.strip()
    return re.sub(r"\n{3,}", "\n\n", "".join(parts)).strip()


def split_ui_specs_from_text(
    content: str,
    *,
    report_error: JsonRenderErrorHandler | None = None,
) -> tuple[str, list[dict[str, Any]]]:
    text = str(content or "")
    if "<ui-spec" not in text.lower():
        return text, []

    text = _UI_SPEC_FENCE_RE.sub(lambda match: match.group(1).strip(), text)
    specs: list[dict[str, Any]] = []

    def replace_block(match: re.Match[str]) -> str:
        body = match.group(1)
        try:
            value = json_loads_with_trailing_repair(body)
            if isinstance(value, list):
                specs.extend(canonicalize_ui_spec(item) for item in value)
            else:
                specs.append(canonicalize_ui_spec(value))
        except ValueError as exc:
            _report_error(report_error, exc, body)
            return _INVALID_UI_SPEC_MESSAGE
        return ""

    display_text = _UI_SPEC_BLOCK_RE.sub(replace_block, text)
    display_text = re.sub(r"\n{3,}", "\n\n", display_text).strip()
    return display_text, specs


def extract_tool_ui_specs(
    value: Any,
    *,
    report_error: JsonRenderErrorHandler | None = None,
) -> list[dict[str, Any]]:
    specs: list[dict[str, Any]] = []

    def append_spec(node: Any) -> None:
        try:
            specs.append(canonicalize_ui_spec(node))
        except ValueError as exc:
            _report_error(
                report_error,
                exc,
                json.dumps(node, ensure_ascii=False, default=str),
            )

    def visit(node: Any) -> None:
        if isinstance(node, dict):
            ui_spec = node.get("ui_spec")
            if isinstance(ui_spec, dict):
                append_spec(ui_spec)
            elif {"type", "root", "elements"}.issubset(node):
                append_spec(node)
            for child in node.values():
                visit(child)
        elif isinstance(node, list):
            for child in node:
                visit(child)
        elif isinstance(node, str):
            text = node.strip()
            if not text or len(text) > 1_000_000:
                return
            if "<ui-spec" in text.casefold():
                _, embedded_specs = split_ui_specs_from_text(
                    text,
                    report_error=report_error,
                )
                specs.extend(embedded_specs)
                return
            if "ui_spec" not in text and not {"type", "root", "elements"}.issubset(
                set(re.findall(r'"([^"]+)"\s*:', text))
            ):
                return
            try:
                decoded = json.loads(text)
            except json.JSONDecodeError:
                return
            visit(decoded)

    visit(value)
    return dedupe_tool_ui_specs(specs)


def _can_merge_ui_specs(left: dict[str, Any], right: dict[str, Any]) -> bool:
    spec_type = left.get("type")
    if spec_type != right.get("type") or spec_type not in _MERGEABLE_MEDIA_SPEC_TYPES:
        return False
    left_elements = left.get("elements")
    right_elements = right.get("elements")
    left_root_id = left.get("root")
    right_root_id = right.get("root")
    if not (
        isinstance(left_elements, dict)
        and isinstance(right_elements, dict)
        and isinstance(left_root_id, str)
        and isinstance(right_root_id, str)
    ):
        return False
    left_root = left_elements.get(left_root_id)
    right_root = right_elements.get(right_root_id)
    if not isinstance(left_root, dict) or not isinstance(right_root, dict):
        return False
    return left_root.get("type") == right_root.get("type") == "Stack"


def _merge_ui_specs(left: dict[str, Any], right: dict[str, Any]) -> dict[str, Any]:
    left = canonicalize_ui_spec(left)
    right = canonicalize_ui_spec(right)
    left_elements = dict(left["elements"])
    right_elements = right["elements"]
    left_root_id = left["root"]
    right_root_id = right["root"]
    left_root = dict(left_elements[left_root_id])
    right_root = right_elements[right_root_id]
    left_children = list(left_root.get("children") or [])
    right_children = list(right_root.get("children") or [])

    def unique_key(key: str) -> str:
        if key not in left_elements:
            return key
        index = 2
        while f"{key}_{index}" in left_elements:
            index += 1
        return f"{key}_{index}"

    key_map: dict[str, str] = {}
    for key, element in right_elements.items():
        if key == right_root_id:
            continue
        next_key = unique_key(key)
        key_map[key] = next_key
        left_elements[next_key] = element

    left_root["children"] = [
        *left_children,
        *[
            key_map.get(child, child)
            for child in right_children
            if isinstance(child, str)
        ],
    ]
    left_elements[left_root_id] = left_root
    return {**left, "elements": left_elements}


def _merge_tool_ui_specs_by_type(
    specs: list[dict[str, Any]],
    report_error: JsonRenderErrorHandler | None,
) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    merge_indexes: dict[str, int] = {}
    for spec in specs:
        spec_type = spec.get("type")
        merge_index = (
            merge_indexes.get(spec_type) if isinstance(spec_type, str) else None
        )
        if merge_index is not None and _can_merge_ui_specs(merged[merge_index], spec):
            try:
                merged[merge_index] = _merge_ui_specs(merged[merge_index], spec)
                continue
            except ValueError as exc:
                _report_error(
                    report_error,
                    exc,
                    json.dumps(spec, ensure_ascii=False),
                )
        merged.append(spec)
        if isinstance(spec_type, str) and spec_type in _MERGEABLE_MEDIA_SPEC_TYPES:
            merge_indexes.setdefault(spec_type, len(merged) - 1)
    return merged


def append_tool_ui_specs(
    content: str,
    specs: list[dict[str, Any]],
    *,
    report_error: JsonRenderErrorHandler | None = None,
) -> str:
    raw_text = str(content or "").strip()
    if specs and _UI_SPEC_BLOCK_RE.search(raw_text):
        return raw_text
    text = _strip_media_rendering_leaks(raw_text)
    if not specs:
        return text
    text = _strip_embedded_ui_spec_json_text(text)
    specs = _merge_tool_ui_specs_by_type(specs, report_error)
    blocks: list[str] = []
    for spec in specs:
        try:
            blocks.append(_ui_spec_block(spec))
        except ValueError as exc:
            _report_error(
                report_error,
                exc,
                json.dumps(spec, ensure_ascii=False),
            )
    if not blocks:
        return text
    prefix = text or "已为你展示相关媒体。"
    return f"{prefix}\n\n" + "\n\n".join(blocks)


def dedupe_tool_ui_specs(specs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen: set[str] = set()
    for spec in specs:
        key = json.dumps(spec, ensure_ascii=False, sort_keys=True)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(spec)
    return deduped


def _prompt_wants_sketch_only(prompt: str) -> bool:
    text = str(prompt or "")
    if "草图" not in text and "sketch" not in text.casefold():
        return False
    frame_terms = (
        "首帧",
        "第一帧",
        "关键帧",
        "first frame",
        "first-frame",
        "keyframe",
        "frame",
    )
    return not any(term in text.casefold() for term in frame_terms)


def _is_frame_image_element(element: Any) -> bool:
    if not isinstance(element, dict):
        return False
    props = element.get("props")
    if not isinstance(props, dict):
        return False
    fields = [
        props.get("src"),
        props.get("poster"),
        props.get("title"),
        props.get("alt"),
        props.get("description"),
        props.get("overlayTitle"),
        props.get("overlayDescription"),
    ]
    text = "\n".join(str(value or "") for value in fields).casefold()
    return (
        "首帧" in text
        or "/frames/" in text
        or "first frame" in text
        or "first-frame" in text
    )


def filter_tool_ui_specs_for_prompt(
    prompt: str,
    specs: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not specs or not _prompt_wants_sketch_only(prompt):
        return specs

    filtered_specs: list[dict[str, Any]] = []
    for spec in specs:
        if not isinstance(spec, dict) or spec.get("type") != "sketch_gallery":
            filtered_specs.append(spec)
            continue
        elements = spec.get("elements")
        root_key = spec.get("root")
        if not isinstance(elements, dict) or not isinstance(root_key, str):
            filtered_specs.append(spec)
            continue
        root = elements.get(root_key)
        if not isinstance(root, dict):
            filtered_specs.append(spec)
            continue
        children = root.get("children")
        if not isinstance(children, list):
            filtered_specs.append(spec)
            continue

        kept_children: list[str] = []
        kept_elements: dict[str, Any] = {}
        for key, element in elements.items():
            if key == root_key:
                continue
            if key in children and _is_frame_image_element(element):
                continue
            kept_elements[key] = element
            if key in children:
                kept_children.append(key)

        if not kept_children:
            continue
        new_root = copy.deepcopy(root)
        new_root["children"] = kept_children
        filtered_specs.append(
            {
                **spec,
                "elements": {
                    root_key: new_root,
                    **{key: kept_elements[key] for key in kept_elements},
                },
            }
        )
    return filtered_specs


__all__ = [
    "JsonRenderErrorHandler",
    "append_tool_ui_specs",
    "canonicalize_ui_spec",
    "dedupe_tool_ui_specs",
    "extract_tool_ui_specs",
    "filter_tool_ui_specs_for_prompt",
    "json_loads_with_trailing_repair",
    "normalize_json_render_reply",
    "redact_local_filesystem_paths",
    "split_ui_specs_from_text",
    "ui_spec_json",
    "wrap_ui_spec_json",
]
