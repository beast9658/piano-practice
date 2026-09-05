from dataclasses import dataclass
from itertools import combinations

from core.domain.fingering import FingeringAnnotation, Hand
from core.domain.music import NoteEvent, PianoScore


@dataclass(frozen=True)
class FingeringGenerationRequest:
    plan_id: str
    stage_id: str
    arrangement_id: str
    score_fingerprint: str
    score: PianoScore
    start_measure: int
    end_measure: int
    start_beat: float
    end_beat: float
    context_start_beat: float
    context_end_beat: float
    existing: tuple[FingeringAnnotation, ...] = ()


@dataclass(frozen=True)
class FingeringPatch:
    plan_id: str
    stage_id: str
    arrangement_id: str
    start_measure: int
    end_measure: int
    annotations: tuple[FingeringAnnotation, ...]
    warnings: tuple[str, ...] = ()


@dataclass(frozen=True)
class _OnsetGroup:
    beat: float
    notes: tuple[NoteEvent, ...]


class FingeringPlanner:
    """Deterministic candidate planner used behind the agent adapter."""

    onset_epsilon = 0.08

    strategies = ("balanced", "centered", "thumb-safe")

    def generate(
        self,
        request: FingeringGenerationRequest,
        strategy: str = "balanced",
    ) -> FingeringPatch:
        relevant = [
            note
            for note in request.score.notes
            if request.context_start_beat <= note.start_beats < request.context_end_beat
            and note.hand in ("left", "right")
        ]
        notes_by_id = {note.id: note for note in request.score.notes}
        existing = {
            annotation.note_id: annotation
            for annotation in request.existing
            if annotation.note_id in notes_by_id
            and (
                not request.start_beat
                <= notes_by_id[annotation.note_id].start_beats
                < request.end_beat
                or annotation.status == "confirmed"
            )
        }
        generated: list[FingeringAnnotation] = []
        warnings: list[str] = []
        note_order = {
            note.id: (note.start_beats, note.pitch, note.id)
            for note in request.score.notes
        }

        for hand in ("left", "right"):
            hand_notes = [note for note in relevant if note.hand == hand]
            annotations, hand_warnings = self._plan_hand(
                hand,
                hand_notes,
                existing,
                strategy,
            )
            warnings.extend(hand_warnings)
            for note, finger, confidence in annotations:
                if request.start_beat <= note.start_beats < request.end_beat:
                    generated.append(FingeringAnnotation(
                        plan_id=request.plan_id,
                        stage_id=request.stage_id,
                        arrangement_id=request.arrangement_id,
                        score_fingerprint=request.score_fingerprint,
                        note_id=note.id,
                        hand=hand,
                        finger=finger,
                        confidence=confidence,
                    ))

        generated.sort(key=lambda item: note_order[item.note_id])
        return FingeringPatch(
            plan_id=request.plan_id,
            stage_id=request.stage_id,
            arrangement_id=request.arrangement_id,
            start_measure=request.start_measure,
            end_measure=request.end_measure,
            annotations=tuple(generated),
            warnings=tuple(dict.fromkeys(warnings)),
        )

    def generate_candidates(
        self,
        request: FingeringGenerationRequest,
        limit: int = 3,
    ) -> tuple[tuple[str, FingeringPatch], ...]:
        candidates: list[tuple[str, FingeringPatch]] = []
        fingerprints: set[tuple[tuple[str, int], ...]] = set()
        for strategy in self.strategies:
            patch = self.validate(request, self.generate(request, strategy))
            fingerprint = tuple(
                (item.note_id, item.finger) for item in patch.annotations
            )
            if fingerprint in fingerprints:
                continue
            fingerprints.add(fingerprint)
            candidates.append((strategy, patch))
            if len(candidates) >= limit:
                break
        return tuple(candidates)

    def validate(
        self,
        request: FingeringGenerationRequest,
        patch: FingeringPatch,
    ) -> FingeringPatch:
        notes_by_id = {note.id: note for note in request.score.notes}
        selected = {
            note.id
            for note in request.score.notes
            if request.start_beat <= note.start_beats < request.end_beat
            and note.hand in ("left", "right")
        }
        annotations = {annotation.note_id: annotation for annotation in patch.annotations}
        missing = selected.difference(annotations)
        if missing:
            raise ValueError(f"fingering plan is missing {len(missing)} selected notes")

        grouped: dict[tuple[str, int], set[int]] = {}
        for annotation in patch.annotations:
            note = notes_by_id.get(annotation.note_id)
            if note is None or note.hand != annotation.hand:
                raise ValueError("fingering annotation does not match score note")
            onset = round(note.start_beats / self.onset_epsilon)
            fingers = grouped.setdefault((annotation.hand, onset), set())
            if annotation.finger in fingers:
                raise ValueError("simultaneous notes cannot share one finger")
            fingers.add(annotation.finger)
        return patch

    def _plan_hand(
        self,
        hand: Hand,
        notes: list[NoteEvent],
        existing: dict[str, FingeringAnnotation],
        strategy: str,
    ) -> tuple[list[tuple[NoteEvent, int, float]], list[str]]:
        groups = self._group_onsets(notes)
        if not groups:
            return [], []

        candidate_groups: list[list[dict[str, int]]] = []
        warnings: list[str] = []
        for group in groups:
            candidates = self._group_candidates(hand, group, existing)
            if not candidates:
                warnings.append(
                    f"{hand} hand has more than five simultaneous notes near beat {group.beat:.2f}"
                )
                candidates = [self._fallback_candidate(hand, group)]
            candidate_groups.append(candidates)

        costs: list[dict[int, tuple[float, int | None]]] = []
        for index, candidates in enumerate(candidate_groups):
            current_costs: dict[int, tuple[float, int | None]] = {}
            for candidate_index, candidate in enumerate(candidates):
                internal = self._internal_cost(
                    hand,
                    groups[index],
                    candidate,
                    strategy,
                )
                if index == 0:
                    current_costs[candidate_index] = (internal, None)
                    continue
                best_cost = float("inf")
                best_previous: int | None = None
                for previous_index, (previous_cost, _) in costs[index - 1].items():
                    transition = self._transition_cost(
                        hand,
                        groups[index - 1],
                        candidate_groups[index - 1][previous_index],
                        groups[index],
                        candidate,
                    )
                    total = previous_cost + transition + internal
                    if total < best_cost:
                        best_cost = total
                        best_previous = previous_index
                current_costs[candidate_index] = (best_cost, best_previous)
            costs.append(current_costs)

        selected_indices = [0] * len(groups)
        selected_indices[-1] = min(costs[-1], key=lambda item: costs[-1][item][0])
        for index in range(len(groups) - 1, 0, -1):
            previous = costs[index][selected_indices[index]][1]
            selected_indices[index - 1] = previous if previous is not None else 0

        result: list[tuple[NoteEvent, int, float]] = []
        for group, candidates, selected_index in zip(groups, candidate_groups, selected_indices):
            candidate = candidates[selected_index]
            for note in group.notes:
                result.append((note, candidate[note.id], 0.82))
        return result, warnings

    def _group_onsets(self, notes: list[NoteEvent]) -> list[_OnsetGroup]:
        ordered = sorted(notes, key=lambda note: (note.start_beats, note.pitch, note.id))
        groups: list[_OnsetGroup] = []
        for note in ordered:
            if not groups or note.start_beats - groups[-1].beat > self.onset_epsilon:
                groups.append(_OnsetGroup(note.start_beats, (note,)))
            else:
                previous = groups[-1]
                groups[-1] = _OnsetGroup(previous.beat, previous.notes + (note,))
        return groups

    def _group_candidates(
        self,
        hand: Hand,
        group: _OnsetGroup,
        existing: dict[str, FingeringAnnotation],
    ) -> list[dict[str, int]]:
        notes = sorted(group.notes, key=lambda note: note.pitch)
        if len(notes) > 5:
            return []
        candidates: list[dict[str, int]] = []
        for fingers in combinations(range(1, 6), len(notes)):
            ordered_fingers = fingers if hand == "right" else tuple(reversed(fingers))
            candidate = {
                note.id: finger for note, finger in zip(notes, ordered_fingers)
            }
            if all(
                note.id not in existing or existing[note.id].finger == candidate[note.id]
                for note in notes
            ):
                candidates.append(candidate)
        return candidates

    def _fallback_candidate(self, hand: Hand, group: _OnsetGroup) -> dict[str, int]:
        notes = sorted(group.notes, key=lambda note: note.pitch)
        fingers = (1, 2, 3, 4, 5) if hand == "right" else (5, 4, 3, 2, 1)
        return {note.id: fingers[min(index, 4)] for index, note in enumerate(notes)}

    def _internal_cost(
        self,
        hand: Hand,
        group: _OnsetGroup,
        candidate: dict[str, int],
        strategy: str,
    ) -> float:
        preference_cost = self._strategy_cost(group, candidate, strategy)
        if len(group.notes) < 2:
            return preference_cost
        ordered = sorted(group.notes, key=lambda note: note.pitch)
        pitch_span = ordered[-1].pitch - ordered[0].pitch
        finger_span = abs(candidate[ordered[-1].id] - candidate[ordered[0].id])
        reach = 2.0 + finger_span * 2.0
        cost = max(0.0, pitch_span - reach) * 1.8
        if pitch_span >= 8 and finger_span < 3:
            cost += 4.0
        if hand == "right" and candidate[ordered[0].id] != 1 and pitch_span >= 7:
            cost += 1.2
        if hand == "left" and candidate[ordered[0].id] != 5 and pitch_span >= 7:
            cost += 1.2
        return cost + preference_cost

    @staticmethod
    def _strategy_cost(
        group: _OnsetGroup,
        candidate: dict[str, int],
        strategy: str,
    ) -> float:
        if strategy == "centered":
            return sum(abs(candidate[note.id] - 3) for note in group.notes) * 0.32
        if strategy == "thumb-safe":
            black_keys = {1, 3, 6, 8, 10}
            return sum(
                0.8
                if candidate[note.id] == 1 and note.pitch % 12 in black_keys
                else 0.12 * abs(candidate[note.id] - 1)
                for note in group.notes
            )
        return 0.0

    def _transition_cost(
        self,
        hand: Hand,
        previous_group: _OnsetGroup,
        previous: dict[str, int],
        current_group: _OnsetGroup,
        current: dict[str, int],
    ) -> float:
        previous_note = min(
            previous_group.notes,
            key=lambda note: abs(note.pitch - self._group_center(current_group)),
        )
        current_note = min(
            current_group.notes,
            key=lambda note: abs(note.pitch - previous_note.pitch),
        )
        pitch_delta = current_note.pitch - previous_note.pitch
        finger_delta = current[current_note.id] - previous[previous_note.id]
        expected_delta = finger_delta if hand == "right" else -finger_delta

        if pitch_delta == 0:
            return abs(finger_delta) * 0.45
        direction_penalty = 0.0
        if pitch_delta * expected_delta < 0:
            crossing = (
                current[current_note.id] == 1
                if hand == "right" and pitch_delta > 0
                else previous[previous_note.id] == 1
                if hand == "right"
                else previous[previous_note.id] == 1
                if pitch_delta > 0
                else current[current_note.id] == 1
            )
            direction_penalty = 0.9 if crossing else 3.2

        reach = 2.0 + abs(finger_delta) * 2.0
        stretch_penalty = max(0.0, abs(pitch_delta) - reach) * 1.35
        movement_penalty = abs(pitch_delta) * 0.08
        return direction_penalty + stretch_penalty + movement_penalty

    @staticmethod
    def _group_center(group: _OnsetGroup) -> float:
        return sum(note.pitch for note in group.notes) / len(group.notes)
