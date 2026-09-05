from core.domain.fingering import FingeringAnnotation, FingeringCandidate, FingeringTrial

from .port import FingeringRepositoryPort, FingeringTrialRepositoryPort


class FingeringQueryHandler:
    def __init__(
        self,
        fingerings: FingeringRepositoryPort,
        trials: FingeringTrialRepositoryPort,
    ) -> None:
        self._fingerings = fingerings
        self._trials = trials

    def list_for_plan(
        self,
        plan_id: str,
        score_fingerprint: str,
    ) -> list[FingeringAnnotation]:
        return self._fingerings.list_for_plan(plan_id, score_fingerprint)

    def list_candidates(
        self,
        piece_id: str,
        stage_id: str | None = None,
    ) -> list[FingeringCandidate]:
        return self._trials.list_candidates(piece_id, stage_id)

    def list_trials(self, piece_id: str) -> list[FingeringTrial]:
        return self._trials.list_trials(piece_id)
