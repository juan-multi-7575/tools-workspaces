"""Public errors are stable codes and safe messages; diagnostics stay in logs."""
import logging
import re
from typing import Any

logger = logging.getLogger('app.errors')


def public_error(code: str, message: str) -> dict[str, str]:
    # Tool drivers may return stderr containing filesystem paths. Do not apply
    # this to artifacts: their paths are intentional API inputs and outputs.
    message = re.sub(r'(?<![\w:/])(?:[A-Za-z]:[\\/]|/)[^\s\"\'<>]+', '[path]', message)
    return {'code': code, 'message': message}


def unexpected_error(exc: Exception) -> dict[str, str]:
    logger.error('Unexpected backend failure', exc_info=(type(exc), exc, exc.__traceback__))
    return public_error('INTERNAL_ERROR', 'An unexpected server error occurred. Check the server logs for details.')


def stream_public_data(data: Any) -> Any:
    if isinstance(data, list):
        return [stream_public_data(value) for value in data]
    if isinstance(data, dict):
        return {key: public_error('TOOL_EXECUTION_FAILED', value) if key == 'error' and isinstance(value, str) and value
                else stream_public_data(value) for key, value in data.items()}
    return data
