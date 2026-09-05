from pathlib import Path

import pytest

from core.adapters.persistence.sqlite_llm_settings_repository import SqliteLlmSettingsRepository
from core.app.app_error import AppError
from core.app.llm_settings import (
    LlmConnectionResult,
    LlmSettingsCommandHandler,
    LlmSettingsQueryHandler,
)
from core.domain.llm_settings import DEEPSEEK_BASE_URL, DEEPSEEK_CHAT_MODEL, LlmSettings


class FakeLlmClient:
    def __init__(self) -> None:
        self.request: tuple[LlmSettings, str] | None = None

    def test_connection(
        self,
        settings: LlmSettings,
        api_key: str,
    ) -> LlmConnectionResult:
        self.request = settings, api_key
        return LlmConnectionResult(model=settings.model, latency_ms=42)


class FakeSecretRepository:
    def __init__(self) -> None:
        self.api_key: str | None = None

    def has_api_key(self) -> bool:
        return self.api_key is not None

    def save_api_key(self, api_key: str) -> None:
        self.api_key = api_key

    def get_api_key(self) -> str | None:
        return self.api_key

    def delete_api_key(self) -> None:
        self.api_key = None


def build_handlers(
    tmp_path: Path,
) -> tuple[LlmSettingsCommandHandler, LlmSettingsQueryHandler, FakeLlmClient]:
    client = FakeLlmClient()
    settings = SqliteLlmSettingsRepository(tmp_path / "state.db")
    secrets = FakeSecretRepository()
    command = LlmSettingsCommandHandler(
        settings_repository=settings,
        secret_repository=secrets,
        client=client,
    )
    query = LlmSettingsQueryHandler(
        settings_repository=settings,
        secret_repository=secrets,
    )
    return command, query, client


def test_uses_deepseek_as_default_configuration(tmp_path: Path) -> None:
    _, query, _ = build_handlers(tmp_path)

    settings = query.get()

    assert settings.base_url == DEEPSEEK_BASE_URL
    assert settings.model == DEEPSEEK_CHAT_MODEL


def test_persists_only_non_secret_model_configuration(tmp_path: Path) -> None:
    command, query, _ = build_handlers(tmp_path)

    saved = command.save("https://gateway.example.com/v1/", "custom-chat")
    restored = query.get()

    assert restored == saved
    assert restored.base_url == "https://gateway.example.com/v1"
    assert restored.model == "custom-chat"


def test_connection_uses_transient_api_key(tmp_path: Path) -> None:
    command, _, client = build_handlers(tmp_path)

    result = command.test_connection(
        base_url=DEEPSEEK_BASE_URL,
        model=DEEPSEEK_CHAT_MODEL,
        api_key="secret-key",
    )

    assert result.latency_ms == 42
    assert client.request is not None
    assert client.request[1] == "secret-key"


def test_saved_api_key_is_used_when_test_input_is_empty(tmp_path: Path) -> None:
    command, _, client = build_handlers(tmp_path)
    command.save(DEEPSEEK_BASE_URL, DEEPSEEK_CHAT_MODEL, "stored-secret")

    command.test_connection(DEEPSEEK_BASE_URL, DEEPSEEK_CHAT_MODEL, "")

    assert client.request is not None
    assert client.request[1] == "stored-secret"


def test_connection_requires_api_key(tmp_path: Path) -> None:
    command, _, _ = build_handlers(tmp_path)

    with pytest.raises(AppError, match="API Key"):
        command.test_connection(
            base_url=DEEPSEEK_BASE_URL,
            model=DEEPSEEK_CHAT_MODEL,
            api_key="",
        )
