from typing import Protocol

from core.app.music.port import MusicPieceRepositoryPort
from core.domain.fingering import FingeringAnnotation, FingeringCandidate, FingeringTrial
from core.domain.piece_stages import PieceStagePlan

from .policy import FingeringGenerationRequest, FingeringPatch


class FingeringRepositoryPort(Protocol):
    def list_for_plan(
        self,
        plan_id: str,
        score_fingerprint: str,
    ) -> list[FingeringAnnotation]: ...

    def replace_for_notes(
        self,
        plan_id: str,
        note_ids: set[str],
        annotations: list[FingeringAnnotation],
    ) -> None: ...


class FingeringAgentPort(Protocol):
    def generate(self, request: FingeringGenerationRequest) -> FingeringPatch: ...

    def generate_candidates(
        self,
        request: FingeringGenerationRequest,
        limit: int = 3,
    ) -> tuple[tuple[str, FingeringPatch], ...]: ...


class FingeringTrialRepositoryPort(Protocol):
    def save_candidates(self, candidates: tuple[FingeringCandidate, ...]) -> None: ...

    def list_candidates(
        self,
        piece_id: str,
        stage_id: str | None = None,
    ) -> list[FingeringCandidate]: ...

    def get_candidate(self, candidate_id: str) -> FingeringCandidate | None: ...

    def save_trial(self, trial: FingeringTrial) -> None: ...

    def get_trial(self, trial_id: str) -> FingeringTrial | None: ...

    def list_trials(self, piece_id: str) -> list[FingeringTrial]: ...

    def start_pass(self, trial_id: str, pass_id: str, started_at: str) -> None: ...

    def complete_pass(
        self,
        trial_id: str,
        pass_id: str,
        practice_session_id: str,
        adherence: str,
        comfort_rating: int | None,
        completed_at: str,
    ) -> None: ...

    def cancel_trial(self, trial_id: str, completed_at: str) -> None: ...


class PieceStagePlanQueryPort(Protocol):
    def get_by_id(
        self,
        plan_id: str,
        arrangement_id: str,
        score_fingerprint: str,
    ) -> PieceStagePlan | None: ...


__all__ = [
    "FingeringAgentPort",
    "FingeringRepositoryPort",
    "FingeringTrialRepositoryPort",
    "MusicPieceRepositoryPort",
    "PieceStagePlanQueryPort",
]
