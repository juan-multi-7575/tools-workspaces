import secrets


TOKEN: str | None = None


def regenerate_token() -> str:
    global TOKEN
    TOKEN = secrets.token_hex(8)
    return TOKEN


def get_token() -> str | None:
    return TOKEN
