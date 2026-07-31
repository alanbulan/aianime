from __future__ import annotations

import hashlib
import json
from collections.abc import Mapping
from typing import Any


HTTP_METHODS = frozenset(
    {"delete", "get", "head", "options", "patch", "post", "put", "trace"}
)
CONTRACT_KEYS = frozenset(
    {
        "callbacks",
        "deprecated",
        "parameters",
        "requestBody",
        "responses",
        "security",
    }
)
NON_CONTRACT_KEYS = frozenset(
    {
        "description",
        "example",
        "examples",
        "externalDocs",
        "operationId",
        "summary",
        "tags",
        "title",
    }
)


def _resolve_pointer(document: Mapping[str, Any], pointer: str) -> Any:
    if not pointer.startswith("#/"):
        raise ValueError(f"Only local OpenAPI references are supported: {pointer}")

    value: Any = document
    for raw_part in pointer[2:].split("/"):
        part = raw_part.replace("~1", "/").replace("~0", "~")
        value = value[part]
    return value


def _normalize(
    value: Any,
    *,
    document: Mapping[str, Any],
    reference_stack: tuple[str, ...] = (),
) -> Any:
    if isinstance(value, list):
        return [
            _normalize(
                item,
                document=document,
                reference_stack=reference_stack,
            )
            for item in value
        ]

    if not isinstance(value, Mapping):
        return value

    reference = value.get("$ref")
    if isinstance(reference, str):
        if reference in reference_stack:
            return {"$recursive": True}
        target = _resolve_pointer(document, reference)
        siblings = {key: item for key, item in value.items() if key != "$ref"}
        if siblings:
            target = {**target, **siblings}
        return _normalize(
            target,
            document=document,
            reference_stack=(*reference_stack, reference),
        )

    return {
        key: _normalize(
            item,
            document=document,
            reference_stack=reference_stack,
        )
        for key, item in sorted(value.items())
        if key not in NON_CONTRACT_KEYS
    }


def operation_contracts(specification: Mapping[str, Any]) -> dict[str, Any]:
    contracts: dict[str, Any] = {}
    for path, path_item in sorted(specification.get("paths", {}).items()):
        path_parameters = path_item.get("parameters", [])
        for method, operation in sorted(path_item.items()):
            if method not in HTTP_METHODS:
                continue

            contract = {
                key: value
                for key, value in operation.items()
                if key in CONTRACT_KEYS
            }
            if path_parameters:
                contract["parameters"] = [
                    *path_parameters,
                    *contract.get("parameters", []),
                ]
            normalized = _normalize(contract, document=specification)
            parameters = normalized.get("parameters")
            if isinstance(parameters, list):
                normalized["parameters"] = sorted(
                    parameters,
                    key=lambda item: (
                        str(item.get("in", "")),
                        str(item.get("name", "")),
                        json.dumps(item, sort_keys=True, separators=(",", ":")),
                    ),
                )
            contracts[f"{method.upper()} {path}"] = normalized
    return contracts


def operation_fingerprints(specification: Mapping[str, Any]) -> dict[str, str]:
    return {
        operation: hashlib.sha256(
            json.dumps(
                contract,
                ensure_ascii=True,
                separators=(",", ":"),
                sort_keys=True,
            ).encode("utf-8")
        ).hexdigest()
        for operation, contract in operation_contracts(specification).items()
    }


def contract_snapshot(specification: Mapping[str, Any]) -> dict[str, int | str]:
    fingerprints = operation_fingerprints(specification)
    payload = json.dumps(
        fingerprints,
        ensure_ascii=True,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return {
        "operation_count": len(fingerprints),
        "sha256": hashlib.sha256(payload).hexdigest(),
    }


if __name__ == "__main__":
    from ai_anime.api.app import create_app

    print(
        json.dumps(
            operation_fingerprints(create_app().openapi()),
            ensure_ascii=True,
            indent=2,
            sort_keys=True,
        )
    )
