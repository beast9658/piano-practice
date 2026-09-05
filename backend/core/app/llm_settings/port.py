from __future__ import annotations

from typing import TYPE_CHECKING, Protocol

from core.domain.llm_settings import LlmSettings

if TYPE_CHECKING:
    from .command import LlmConnectionResult


class LlmSettingsRepositoryPort(Protocol):
    def get(self) -> LlmSettings | None: ...

    def save(self, settings: LlmSettings) -> None: ...


class LlmClientPort(Protocol):
    def test_connection(
        self,
        settings: LlmSettings,
        api_key: str,
    ) -> LlmConnectionResult: ...


class LlmSecretRepositoryPort(Protocol):
    def has_api_key(self) -> bool: ...

    def save_api_key(self, api_key: str) -> None: ...

    def get_api_key(self) -> str | None: ...

    def delete_api_key(self) -> None: ...
