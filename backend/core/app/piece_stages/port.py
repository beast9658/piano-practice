from typing import Protocol

from core.app.music.port import MusicPieceRepositoryPort
from core.domain.llm_settings import LlmSettings
from core.domain.music import PianoScore
from core.domain.piece_stages import PieceStage, PieceStagePlan


class PieceStageRepositoryPort(Protocol):
    def list(
        self,
        arrangement_id: str,
        score_fingerprint: str,
    ) -> list[PieceStagePlan]: ...

    def get_active(
        self,
        arrangement_id: str,
        score_fingerprint: str,
    ) -> PieceStagePlan | None: ...

    def get_by_id(
        self,
        plan_id: str,
        arrangement_id: str,
        score_fingerprint: str,
    ) -> PieceStagePlan | None: ...

    def save_new(self, plan: PieceStagePlan) -> None: ...

    def replace(self, plan: PieceStagePlan) -> None: ...

    def rename(self, plan_id: str, arrangement_id: str, name: str) -> None: ...

    def delete(self, plan_id: str, arrangement_id: str) -> bool: ...

    def activate(self, plan_id: str, arrangement_id: str) -> None: ...


class PieceStageAnalyzerPort(Protocol):
    def analyze(
        self,
        title: str,
        score: PianoScore,
        settings: LlmSettings,
        api_key: str,
        instruction: str,
    ) -> tuple[PieceStage, ...]: ...


class LlmSettingsQueryPort(Protocol):
    def get(self) -> LlmSettings: ...

    def get_api_key(self) -> str | None: ...


__all__ = [
    "LlmSettingsQueryPort",
    "MusicPieceRepositoryPort",
    "PieceStageAnalyzerPort",
    "PieceStageRepositoryPort",
]
