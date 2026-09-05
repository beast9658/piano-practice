from dataclasses import dataclass
from typing import Any

from .value_object import FingeringSource, FingeringStatus, Hand


@dataclass(frozen=True)
class FingeringAnnotation:
    plan_id: str
    stage_id: str
    arrangement_id: str
    score_fingerprint: str
    note_id: str
    hand: Hand
    finger: int
    source: FingeringSource = "agent"
    status: FingeringStatus = "suggested"
    confidence: float = 0.0
    revision_id: str = ""
    updated_at: str = ""

    def __post_init__(self) -> None:
        if self.finger < 1 or self.finger > 5:
            raise ValueError("finger must be between 1 and 5")

    @property
    def label(self) -> str:
        prefix = "L" if self.hand == "left" else "R"
        return f"{prefix}{self.finger}"


@dataclass(frozen=True)
class FingeringCandidateAssignment:
    note_id: str
    hand: Hand
    finger: int

    def __post_init__(self) -> None:
        if not self.note_id:
            raise ValueError("candidate assignment note id is required")
        if self.finger < 1 or self.finger > 5:
            raise ValueError("finger must be between 1 and 5")

    @property
    def label(self) -> str:
        prefix = "L" if self.hand == "left" else "R"
        return f"{prefix}{self.finger}"


@dataclass(frozen=True)
class FingeringCandidate:
    id: str
    piece_id: str
    plan_id: str
    stage_id: str
    arrangement_id: str
    score_fingerprint: str
    name: str
    strategy: str
    start_measure: int
    end_measure: int
    start_beat: float
    end_beat: float
    assignments: tuple[FingeringCandidateAssignment, ...]
    features: dict[str, float | int]
    created_at: str

    def __post_init__(self) -> None:
        if not self.id or not self.piece_id or not self.stage_id:
            raise ValueError("candidate identity is required")
        if self.start_measure < 1 or self.end_measure < self.start_measure:
            raise ValueError("invalid candidate measure range")
        if self.end_beat <= self.start_beat:
            raise ValueError("invalid candidate beat range")
        if not self.assignments:
            raise ValueError("candidate assignments are required")


@dataclass(frozen=True)
class FingeringTrialPass:
    id: str
    candidate_id: str
    position: int
    status: str = "pending"
    practice_session_id: str | None = None
    adherence: str = "unknown"
    comfort_rating: int | None = None
    started_at: str | None = None
    completed_at: str | None = None
    summary: dict[str, Any] | None = None


@dataclass(frozen=True)
class FingeringTrial:
    id: str
    piece_id: str
    plan_id: str
    stage_id: str
    arrangement_id: str
    score_fingerprint: str
    protocol: str
    mode: str
    bpm: int
    start_measure: int
    end_measure: int
    start_beat: float
    end_beat: float
    candidate_ids: tuple[str, ...]
    passes: tuple[FingeringTrialPass, ...]
    status: str = "running"
    created_at: str = ""
    completed_at: str | None = None

    def __post_init__(self) -> None:
        if self.protocol != "A-B-A":
            raise ValueError("only A-B-A trials are supported")
        if len(self.candidate_ids) != 2:
            raise ValueError("A-B-A trial requires exactly two candidates")
        if self.mode not in ("left-hand", "right-hand", "both-hands"):
            raise ValueError("invalid fingering trial mode")
        if self.bpm <= 0:
            raise ValueError("trial bpm must be positive")
