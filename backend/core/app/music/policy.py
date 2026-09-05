from dataclasses import replace
import re
from statistics import median

from core.domain.music import NoteEvent, PianoScore, ScorePart


HAND_ANALYSIS_VERSION = "dp-v1"
ONSET_GROUP_TOLERANCE_BEATS = 0.08


class DynamicProgrammingHandAssignment:
    analysis_version = HAND_ANALYSIS_VERSION

    def assign(self, score: PianoScore) -> PianoScore:
        return _assign_hands(score)


def _assign_hands(score: PianoScore) -> PianoScore:
    if not score.notes:
        return replace(score, hand_analysis_version=HAND_ANALYSIS_VERSION)

    explicit = _explicit_track_hands(score.parts, score.notes)
    if explicit:
        notes = [
            replace(
                note,
                hand=explicit.get(note.track, ("unknown", 0.0))[0],
                hand_confidence=explicit.get(note.track, ("unknown", 0.0))[1],
            )
            for note in score.notes
        ]
    else:
        notes = _assign_mixed_notes(score.notes)

    part_hands = _summarize_parts(score.parts, notes)
    return replace(
        score,
        notes=notes,
        parts=part_hands,
        hand_analysis_version=HAND_ANALYSIS_VERSION,
    )


def _explicit_track_hands(
    parts: list[ScorePart], notes: list[NoteEvent]
) -> dict[int, tuple[str, float]]:
    result: dict[int, tuple[str, float]] = {}
    for part in parts:
        label = f"{part.name} {part.instrument_name or ''}".lower()
        if re.search(r"\b(right(?:\s+hand)?|r\.h\.|treble)\b", label) or "右手" in label:
            result[part.track] = ("right", 0.99)
        elif re.search(r"\b(left(?:\s+hand)?|l\.h\.|bass)\b", label) or "左手" in label:
            result[part.track] = ("left", 0.99)

    note_tracks = sorted({note.track for note in notes})
    missing_tracks = [track for track in note_tracks if track not in result]
    assigned_hands = {hand for hand, _ in result.values()}
    if len(missing_tracks) == 1 and len(assigned_hands) == 1:
        opposite = "left" if assigned_hands == {"right"} else "right"
        result[missing_tracks[0]] = (opposite, 0.95)
    if result or len(note_tracks) != 2:
        return result

    medians = {
        track: median(note.pitch for note in notes if note.track == track)
        for track in note_tracks
    }
    low, high = sorted(note_tracks, key=medians.__getitem__)
    if medians[high] - medians[low] < 5:
        return {}
    return {low: ("left", 0.9), high: ("right", 0.9)}


def _assign_mixed_notes(notes: list[NoteEvent]) -> list[NoteEvent]:
    groups = _group_by_onset(notes)
    candidates = [_group_candidates(group) for group in groups]
    costs: list[list[float]] = []
    previous: list[list[int]] = []

    for group_index, group_candidates in enumerate(candidates):
        group_costs: list[float] = []
        group_previous: list[int] = []
        for candidate in group_candidates:
            local = _local_cost(candidate)
            if group_index == 0:
                group_costs.append(local)
                group_previous.append(-1)
                continue
            transitions = [
                costs[group_index - 1][index]
                + _transition_cost(previous_candidate, candidate)
                for index, previous_candidate in enumerate(candidates[group_index - 1])
            ]
            best_previous = min(range(len(transitions)), key=transitions.__getitem__)
            group_costs.append(local + transitions[best_previous])
            group_previous.append(best_previous)
        costs.append(group_costs)
        previous.append(group_previous)

    last_costs = costs[-1]
    best_index = min(range(len(last_costs)), key=last_costs.__getitem__)
    ordered_costs = sorted(last_costs)
    margin = ordered_costs[1] - ordered_costs[0] if len(ordered_costs) > 1 else 4.0
    confidence = max(0.55, min(0.95, 0.55 + margin / 12))
    selected: list[dict[str, str]] = []
    for group_index in range(len(groups) - 1, -1, -1):
        selected.append(candidates[group_index][best_index]["assignments"])
        best_index = previous[group_index][best_index]
    selected.reverse()

    assignments = {
        note_id: hand
        for group_assignment in selected
        for note_id, hand in group_assignment.items()
    }
    return [
        replace(
            note,
            hand=assignments.get(note.id, "unknown"),
            hand_confidence=confidence,
        )
        for note in notes
    ]


def _group_by_onset(notes: list[NoteEvent]) -> list[list[NoteEvent]]:
    ordered = sorted(notes, key=lambda note: (note.start_beats, note.pitch, note.id))
    groups: list[list[NoteEvent]] = []
    for note in ordered:
        if not groups or note.start_beats - groups[-1][0].start_beats > ONSET_GROUP_TOLERANCE_BEATS:
            groups.append([note])
        else:
            groups[-1].append(note)
    return groups


def _group_candidates(group: list[NoteEvent]) -> list[dict]:
    ordered = sorted(group, key=lambda note: (note.pitch, note.id))
    candidates = []
    for split in range(len(ordered) + 1):
        left = ordered[:split]
        right = ordered[split:]
        candidates.append(
            {
                "left": left,
                "right": right,
                "assignments": {
                    **{note.id: "left" for note in left},
                    **{note.id: "right" for note in right},
                },
                "left_center": median(note.pitch for note in left) if left else None,
                "right_center": median(note.pitch for note in right) if right else None,
            }
        )
    return candidates


def _local_cost(candidate: dict) -> float:
    left: list[NoteEvent] = candidate["left"]
    right: list[NoteEvent] = candidate["right"]
    cost = _hand_cost(left, "left") + _hand_cost(right, "right")
    if left and right and left[-1].pitch > right[0].pitch:
        cost += 30
    if not left or not right:
        cost += 0.8
    return cost


def _hand_cost(notes: list[NoteEvent], hand: str) -> float:
    if not notes:
        return 0.0
    span = notes[-1].pitch - notes[0].pitch
    cost = max(0, span - 12) ** 2 * 0.8
    if span > 16:
        cost += 30
    cost += max(0, len(notes) - 5) * 8
    center = median(note.pitch for note in notes)
    if hand == "left":
        cost += max(0, center - 64) ** 2 * 0.035
    else:
        cost += max(0, 56 - center) ** 2 * 0.035
    return cost


def _transition_cost(previous: dict, current: dict) -> float:
    cost = 0.0
    for key in ("left_center", "right_center"):
        before = previous[key]
        after = current[key]
        if before is not None and after is not None:
            cost += abs(after - before) * 0.08
    for note_id, hand in current["assignments"].items():
        previous_hand = previous["assignments"].get(note_id)
        if previous_hand is not None and previous_hand != hand:
            cost += 10
    return cost


def _summarize_parts(parts: list[ScorePart], notes: list[NoteEvent]) -> list[ScorePart]:
    result = []
    for part in parts:
        part_notes = [note for note in notes if note.track == part.track]
        hands = {note.hand for note in part_notes if note.hand != "unknown"}
        hand = next(iter(hands)) if len(hands) == 1 else "mixed" if hands else "unknown"
        confidence = (
            sum(note.hand_confidence for note in part_notes) / len(part_notes)
            if part_notes
            else 0.0
        )
        result.append(replace(part, hand=hand, hand_confidence=confidence))
    return result
