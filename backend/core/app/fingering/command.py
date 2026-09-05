from dataclasses import dataclass, replace
from datetime import datetime, timezone
from math import ceil
from uuid import uuid4

from core.app.app_error import AppError
from core.domain.fingering import (
    FingeringAnnotation,
    FingeringCandidate,
    FingeringCandidateAssignment,
    FingeringTrial,
    FingeringTrialPass,
)
from core.domain.music import MusicPieceId, NoteEvent
from .policy import FingeringGenerationRequest, FingeringPatch
from .port import (
    FingeringAgentPort,
    FingeringRepositoryPort,
    FingeringTrialRepositoryPort,
    MusicPieceRepositoryPort,
    PieceStagePlanQueryPort,
)


@dataclass(frozen=True)
class GenerateFingeringCommand:
    piece_id: MusicPieceId
    plan_id: str
    stage_id: str


@dataclass(frozen=True)
class GenerateFingeringCandidatesCommand:
    piece_id: MusicPieceId
    plan_id: str
    stage_id: str
    limit: int = 3


@dataclass(frozen=True)
class CreateFingeringTrialCommand:
    piece_id: MusicPieceId
    candidate_ids: tuple[str, str]
    mode: str
    bpm: int


@dataclass(frozen=True)
class StartFingeringTrialPassCommand:
    trial_id: str
    pass_id: str


@dataclass(frozen=True)
class CompleteFingeringTrialPassCommand:
    trial_id: str
    pass_id: str
    practice_session_id: str
    adherence: str
    comfort_rating: int | None


@dataclass(frozen=True)
class CancelFingeringTrialCommand:
    trial_id: str


@dataclass(frozen=True)
class AdoptFingeringCandidateCommand:
    piece_id: MusicPieceId
    candidate_id: str


class FingeringCommandHandler:
    def __init__(
        self,
        pieces: MusicPieceRepositoryPort,
        fingerings: FingeringRepositoryPort,
        stage_plans: PieceStagePlanQueryPort,
        agent: FingeringAgentPort,
        trials: FingeringTrialRepositoryPort,
    ) -> None:
        self._pieces = pieces
        self._fingerings = fingerings
        self._stage_plans = stage_plans
        self._agent = agent
        self._trials = trials

    def generate(self, command: GenerateFingeringCommand) -> FingeringPatch:
        request = self._generation_request(
            command.piece_id,
            command.plan_id,
            command.stage_id,
        )
        try:
            patch = self._agent.generate(request)
        except ValueError as error:
            raise AppError.validation(str(error)) from error

        revision_id = uuid4().hex
        updated_at = datetime.now(timezone.utc).isoformat()
        annotations = [
            replace(annotation, revision_id=revision_id, updated_at=updated_at)
            for annotation in patch.annotations
        ]
        selected_note_ids = {
            note.id
            for note in request.score.notes
            if request.start_beat <= note.start_beats < request.end_beat
        }
        self._fingerings.replace_for_notes(
            request.plan_id,
            selected_note_ids,
            annotations,
        )
        return replace(patch, annotations=tuple(annotations))

    def generate_candidates(
        self,
        command: GenerateFingeringCandidatesCommand,
    ) -> tuple[FingeringCandidate, ...]:
        request = self._generation_request(
            command.piece_id,
            command.plan_id,
            command.stage_id,
        )
        notes_by_id = {note.id: note for note in request.score.notes}
        candidate_request = replace(
            request,
            existing=tuple(
                annotation
                for annotation in request.existing
                if annotation.note_id in notes_by_id
                and not request.start_beat
                <= notes_by_id[annotation.note_id].start_beats
                < request.end_beat
            ),
        )
        try:
            generated = self._agent.generate_candidates(
                candidate_request,
                max(2, min(3, command.limit)),
            )
        except ValueError as error:
            raise AppError.validation(str(error)) from error
        if len(generated) < 2:
            raise AppError.validation("该分段没有生成足够不同的指法候选")

        created_at = datetime.now(timezone.utc).isoformat()
        names = {
            "balanced": "均衡方案",
            "centered": "中位稳定",
            "thumb-safe": "拇指避黑键",
        }
        candidates = tuple(
            FingeringCandidate(
                id=uuid4().hex,
                piece_id=command.piece_id.value,
                plan_id=request.plan_id,
                stage_id=request.stage_id,
                arrangement_id=request.arrangement_id,
                score_fingerprint=request.score_fingerprint,
                name=names.get(strategy, strategy),
                strategy=strategy,
                start_measure=request.start_measure,
                end_measure=request.end_measure,
                start_beat=request.start_beat,
                end_beat=request.end_beat,
                assignments=tuple(
                    FingeringCandidateAssignment(
                        note_id=item.note_id,
                        hand=item.hand,
                        finger=item.finger,
                    )
                    for item in patch.annotations
                ),
                features=_candidate_features(request, patch),
                created_at=created_at,
            )
            for strategy, patch in generated
        )
        self._trials.save_candidates(candidates)
        return candidates

    def create_trial(
        self,
        command: CreateFingeringTrialCommand,
    ) -> FingeringTrial:
        candidates = tuple(
            self._trials.get_candidate(candidate_id)
            for candidate_id in command.candidate_ids
        )
        if any(candidate is None for candidate in candidates):
            raise AppError.not_found("fingering candidate not found")
        first, second = candidates
        if first is None or second is None:
            raise AppError.not_found("fingering candidate not found")
        if first.piece_id != command.piece_id.value or second.piece_id != first.piece_id:
            raise AppError.validation("candidates do not belong to this piece")
        piece = self._pieces.find_piece(command.piece_id)
        if (
            piece is None
            or not piece.arrangements
            or piece.arrangements[0].fingerprint != first.score_fingerprint
        ):
            raise AppError.validation("candidate score version is no longer current")
        if (
            second.stage_id != first.stage_id
            or second.score_fingerprint != first.score_fingerprint
            or second.start_beat != first.start_beat
            or second.end_beat != first.end_beat
        ):
            raise AppError.validation("candidates must share the same immutable scope")

        trial_id = uuid4().hex
        candidate_order = (first.id, second.id, first.id)
        trial = FingeringTrial(
            id=trial_id,
            piece_id=first.piece_id,
            plan_id=first.plan_id,
            stage_id=first.stage_id,
            arrangement_id=first.arrangement_id,
            score_fingerprint=first.score_fingerprint,
            protocol="A-B-A",
            mode=command.mode,
            bpm=command.bpm,
            start_measure=first.start_measure,
            end_measure=first.end_measure,
            start_beat=first.start_beat,
            end_beat=first.end_beat,
            candidate_ids=(first.id, second.id),
            passes=tuple(
                FingeringTrialPass(
                    id=uuid4().hex,
                    candidate_id=candidate_id,
                    position=index,
                )
                for index, candidate_id in enumerate(candidate_order, start=1)
            ),
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        try:
            self._trials.save_trial(trial)
        except ValueError as error:
            raise AppError.validation(str(error)) from error
        return trial

    def start_trial_pass(
        self,
        command: StartFingeringTrialPassCommand,
    ) -> FingeringTrial:
        trial = self._trials.get_trial(command.trial_id)
        if trial is None:
            raise AppError.not_found("fingering trial not found")
        next_pass = next(
            (item for item in trial.passes if item.status != "completed"),
            None,
        )
        if next_pass is None or next_pass.id != command.pass_id:
            raise AppError.validation("trial passes must run in protocol order")
        try:
            self._trials.start_pass(
                trial.id,
                command.pass_id,
                datetime.now(timezone.utc).isoformat(),
            )
        except ValueError as error:
            raise AppError.validation(str(error)) from error
        updated = self._trials.get_trial(trial.id)
        if updated is None:
            raise AppError.not_found("fingering trial not found")
        return updated

    def complete_trial_pass(
        self,
        command: CompleteFingeringTrialPassCommand,
    ) -> FingeringTrial:
        if command.adherence not in ("confirmed", "partial", "not-followed", "unknown"):
            raise AppError.validation("invalid fingering adherence")
        if command.comfort_rating is not None and not 1 <= command.comfort_rating <= 5:
            raise AppError.validation("comfort rating must be between 1 and 5")
        try:
            self._trials.complete_pass(
                command.trial_id,
                command.pass_id,
                command.practice_session_id,
                command.adherence,
                command.comfort_rating,
                datetime.now(timezone.utc).isoformat(),
            )
        except ValueError as error:
            raise AppError.validation(str(error)) from error
        updated = self._trials.get_trial(command.trial_id)
        if updated is None:
            raise AppError.not_found("fingering trial not found")
        return updated

    def adopt_candidate(
        self,
        command: AdoptFingeringCandidateCommand,
    ) -> FingeringCandidate:
        candidate = self._trials.get_candidate(command.candidate_id)
        if candidate is None or candidate.piece_id != command.piece_id.value:
            raise AppError.not_found("fingering candidate not found")
        revision_id = uuid4().hex
        updated_at = datetime.now(timezone.utc).isoformat()
        annotations = [
            FingeringAnnotation(
                plan_id=candidate.plan_id,
                stage_id=candidate.stage_id,
                arrangement_id=candidate.arrangement_id,
                score_fingerprint=candidate.score_fingerprint,
                note_id=item.note_id,
                hand=item.hand,
                finger=item.finger,
                status="confirmed",
                confidence=1.0,
                revision_id=revision_id,
                updated_at=updated_at,
            )
            for item in candidate.assignments
        ]
        self._fingerings.replace_for_notes(
            candidate.plan_id,
            {item.note_id for item in candidate.assignments},
            annotations,
        )
        return candidate

    def cancel_trial(self, command: CancelFingeringTrialCommand) -> FingeringTrial:
        try:
            self._trials.cancel_trial(
                command.trial_id,
                datetime.now(timezone.utc).isoformat(),
            )
        except ValueError as error:
            raise AppError.validation(str(error)) from error
        trial = self._trials.get_trial(command.trial_id)
        if trial is None:
            raise AppError.not_found("fingering trial not found")
        return trial

    def _generation_request(
        self,
        piece_id: MusicPieceId,
        plan_id: str,
        stage_id: str,
    ) -> FingeringGenerationRequest:
        piece = self._pieces.find_piece(piece_id)
        if piece is None or not piece.arrangements:
            raise AppError.not_found("piece score not found")
        arrangement = piece.arrangements[0]
        score = arrangement.score
        plan = self._stage_plans.get_by_id(
            plan_id,
            arrangement.id.value,
            arrangement.fingerprint,
        )
        if plan is None:
            raise AppError.not_found("piece stage plan not found")
        stage = plan.stage(stage_id)
        if stage is None:
            raise AppError.not_found("piece stage not found")

        beats_per_measure = _beats_per_measure(score.meters[0] if score.meters else "4/4")
        total_beats = max(
            (note.start_beats + note.duration_beats for note in score.notes),
            default=0.0,
        )
        measure_count = max(1, ceil(total_beats / beats_per_measure))
        if stage.start_measure > measure_count or stage.end_measure > measure_count:
            raise AppError.validation("fingering measure range exceeds score")

        start_beat = (stage.start_measure - 1) * beats_per_measure
        end_beat = min(total_beats, stage.end_measure * beats_per_measure)
        context_start = max(0.0, start_beat - beats_per_measure)
        context_end = min(total_beats, end_beat + beats_per_measure)
        existing = self._fingerings.list_for_plan(
            plan.id,
            arrangement.fingerprint,
        )
        return FingeringGenerationRequest(
            plan_id=plan.id,
            stage_id=stage.id,
            arrangement_id=arrangement.id.value,
            score_fingerprint=arrangement.fingerprint,
            score=score,
            start_measure=stage.start_measure,
            end_measure=stage.end_measure,
            start_beat=start_beat,
            end_beat=end_beat,
            context_start_beat=context_start,
            context_end_beat=context_end,
            existing=tuple(existing),
        )


def _candidate_features(
    request: FingeringGenerationRequest,
    patch: FingeringPatch,
) -> dict[str, float | int]:
    notes = {
        note.id: note
        for note in request.score.notes
        if request.start_beat <= note.start_beats < request.end_beat
    }
    assignments = {item.note_id: item for item in patch.annotations}
    ordered = sorted(
        (note for note in notes.values() if note.id in assignments),
        key=lambda note: (note.hand, note.start_beats, note.pitch, note.id),
    )
    thumb_crossings = 0
    position_shifts = 0
    repeated_changes = 0
    black_key_thumbs = 0
    max_span = 0
    previous_by_hand: dict[str, tuple[NoteEvent, FingeringAnnotation]] = {}
    previous_by_pitch: dict[tuple[str, int], int] = {}
    onset_groups: dict[tuple[str, float], list[int]] = {}
    for note in ordered:
        assignment = assignments[note.id]
        if assignment.finger == 1 and note.pitch % 12 in {1, 3, 6, 8, 10}:
            black_key_thumbs += 1
        group = onset_groups.setdefault((note.hand, note.start_beats), [])
        group.append(note.pitch)
        previous_finger = previous_by_pitch.get((note.hand, note.pitch))
        if previous_finger is not None and previous_finger != assignment.finger:
            repeated_changes += 1
        previous_by_pitch[(note.hand, note.pitch)] = assignment.finger
        previous = previous_by_hand.get(note.hand)
        if previous is not None:
            previous_note, previous_assignment = previous
            pitch_delta = note.pitch - previous_note.pitch
            finger_delta = assignment.finger - previous_assignment.finger
            if abs(pitch_delta) >= 8:
                position_shifts += 1
            expected = finger_delta if note.hand == "right" else -finger_delta
            if pitch_delta * expected < 0 and 1 in (assignment.finger, previous_assignment.finger):
                thumb_crossings += 1
        previous_by_hand[note.hand] = (note, assignment)
    for pitches in onset_groups.values():
        max_span = max(max_span, max(pitches) - min(pitches))
    return {
        "thumbCrossings": thumb_crossings,
        "positionShifts": position_shifts,
        "repeatedNoteChanges": repeated_changes,
        "maxSpan": max_span,
        "blackKeyThumbs": black_key_thumbs,
    }


def _beats_per_measure(time_signature: str) -> float:
    try:
        numerator_text, denominator_text = time_signature.split("/", maxsplit=1)
        numerator = int(numerator_text)
        denominator = int(denominator_text)
    except (ValueError, TypeError):
        return 4.0
    if numerator <= 0 or denominator <= 0:
        return 4.0
    return numerator * (4.0 / denominator)
