"""Character identity business rules."""


def identity_id_for(character_name: str, identity_name: str) -> str:
    return f"{character_name}_{identity_name}"
