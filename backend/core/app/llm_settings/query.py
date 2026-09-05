from core.domain.llm_settings import LlmSettings

from .port import LlmSecretRepositoryPort, LlmSettingsRepositoryPort


class LlmSettingsQueryHandler:
    def __init__(
        self,
        settings_repository: LlmSettingsRepositoryPort,
        secret_repository: LlmSecretRepositoryPort,
    ) -> None:
        self._settings_repository = settings_repository
        self._secret_repository = secret_repository

    def get(self) -> LlmSettings:
        return self._settings_repository.get() or LlmSettings.deepseek_default()

    def has_api_key(self) -> bool:
        return self._secret_repository.has_api_key()

    def get_api_key(self) -> str | None:
        return self._secret_repository.get_api_key()
