"""Character identity business rules."""


def identity_id_for(character_name: str, identity_name: str) -> str:
    return f"{character_name}_{identity_name}"


def identity_name_from_id(identity_id: str) -> str:
    value = str(identity_id or "")
    return value.split("_", 1)[1] if "_" in value else value
