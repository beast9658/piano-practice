from dataclasses import dataclass


@dataclass(frozen=True)
class PieceStage:
    id: str
    start_measure: int
    end_measure: int
    label: str
    reason: str

    def __post_init__(self) -> None:
        if not self.id.strip():
            raise ValueError("piece stage id is empty")
        if self.start_measure < 1 or self.end_measure < self.start_measure:
            raise ValueError("invalid piece stage range")
        if not self.label.strip():
            raise ValueError("piece stage label is empty")


@dataclass(frozen=True)
class PieceStagePlan:
    id: str
    arrangement_id: str
    score_fingerprint: str
    name: str
    segmentation_prompt: str
    model: str
    generation: int
    stages: tuple[PieceStage, ...]
    created_at: str
    analyzed_at: str
    is_active: bool = False

    def __post_init__(self) -> None:
        if not self.id.strip():
            raise ValueError("piece stage plan id is empty")
        if not self.name.strip():
            raise ValueError("piece stage plan name is empty")
        if self.generation < 1:
            raise ValueError("piece stage plan generation must be positive")

    def stage(self, stage_id: str) -> PieceStage | None:
        return next((stage for stage in self.stages if stage.id == stage_id), None)

    @staticmethod
    def validate_coverage(
        stages: tuple[PieceStage, ...],
        measure_count: int,
    ) -> None:
        if not stages:
            raise ValueError("stage analysis returned no stages")
        expected_start = 1
        for stage in stages:
            if stage.start_measure != expected_start:
                raise ValueError("piece stages must be continuous")
            expected_start = stage.end_measure + 1
        if expected_start != measure_count + 1:
            raise ValueError("piece stages do not cover the complete score")
