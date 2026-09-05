"""Application error types and the public error envelope."""

from __future__ import annotations

from typing import Any


class AppError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class IntakeValidationError(AppError):
    def __init__(self, code: str, message: str, status_code: int = 422) -> None:
        super().__init__(code, message, status_code)
        self.name = "IntakeValidationError"


def error_body(code: str, message: str, request_id: str) -> dict[str, Any]:
    return {"error": {"code": code, "message": message, "request_id": request_id}}
