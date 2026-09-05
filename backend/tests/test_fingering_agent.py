from pathlib import Path
from dataclasses import replace
from datetime import datetime, timezone

from core.adapters.persistence.sqlite_piece_stage_repository import SqlitePieceStageRepository
from core.app.fingering import FingeringGenerationRequest, FingeringPlanner
from core.app.music import HAND_ANALYSIS_VERSION
from core.app.fingering import GenerateFingeringCommand
from core.app.music.command import (
    CreateMusicPieceCommand,
    ImportPianoArrangementCommand,
)
from core.domain.music import (
    ArrangementId,
    MusicPieceId,
    NoteEvent,
    PianoScore,
)
from core.domain.fingering import FingeringAnnotation
from core.domain.piece_stages import PieceStage, PieceStagePlan
from core.infra.setup import init_app_container


def build_score() -> PianoScore:
    return PianoScore(
        notes=[
            NoteEvent("r-1", 60, 0, 1, 80, hand="right", hand_confidence=0.99),
            NoteEvent("r-2", 62, 1, 1, 80, hand="right", hand_confidence=0.99),
            NoteEvent("r-3", 64, 2, 1, 80, hand="right", hand_confidence=0.99),
            NoteEvent("r-4", 65, 3, 1, 80, hand="right", hand_confidence=0.99),
            NoteEvent("l-1", 48, 4, 1, 80, hand="left", hand_confidence=0.99),
            NoteEvent("l-2", 52, 4, 1, 80, hand="left", hand_confidence=0.99),
            NoteEvent("l-3", 55, 4, 1, 80, hand="left", hand_confidence=0.99),
            NoteEvent("r-5", 67, 5, 1, 80, hand="right", hand_confidence=0.99),
            NoteEvent("r-6", 69, 6, 1, 80, hand="right", hand_confidence=0.99),
            NoteEvent("r-7", 72, 7, 1, 80, hand="right", hand_confidence=0.99),
        ],
        tempos=[72],
        meters=["4/4"],
        hand_analysis_version=HAND_ANALYSIS_VERSION,
    )


def create_piece(tmp_path: Path):
    database = tmp_path / "state.db"
    container = init_app_container(str(database))
    piece_id = MusicPieceId.parse("piece-1")
    arrangement_id = ArrangementId.parse("arrangement-1")
    container.music.command.create_piece(CreateMusicPieceCommand(
        piece_id=piece_id,
        title="Finger Study",
        creator=None,
        now="2026-07-16T00:00:00+00:00",
    ))
    container.music.command.import_arrangement(ImportPianoArrangementCommand(
        piece_id=piece_id,
        arrangement_id=arrangement_id,
        title="Finger Study",
        source_path="/tmp/finger-study.mid",
        fingerprint="finger-study",
        score=build_score(),
        now="2026-07-16T00:00:00+00:00",
    ))
    now = datetime.now(timezone.utc).isoformat()
    plan = PieceStagePlan(
        id="plan-1",
        arrangement_id=arrangement_id.value,
        score_fingerprint="finger-study",
        name="默认方案",
        segmentation_prompt="",
        model="test-model",
        generation=1,
        stages=(
            PieceStage("stage-1", 1, 1, "第一段", "测试"),
            PieceStage("stage-2", 2, 2, "第二段", "测试"),
        ),
        created_at=now,
        analyzed_at=now,
        is_active=True,
    )
    SqlitePieceStageRepository(database).save_new(plan)
    return container, piece_id, arrangement_id, plan


def test_generates_labels_for_selected_measure(tmp_path: Path) -> None:
    container, piece_id, arrangement_id, plan = create_piece(tmp_path)

    patch = container.fingering.command.generate(GenerateFingeringCommand(
        piece_id=piece_id,
        plan_id=plan.id,
        stage_id="stage-1",
    ))

    assert len(patch.annotations) == 4
    assert {item.note_id for item in patch.annotations} == {"r-1", "r-2", "r-3", "r-4"}
    assert all(item.label.startswith("R") for item in patch.annotations)
    assert all(1 <= item.finger <= 5 for item in patch.annotations)
    stored = container.fingering.query.list_for_plan(
        plan.id,
        "finger-study",
    )
    assert stored == list(patch.annotations)
    assert container.fingering.query.list_for_plan(
        plan.id,
        "changed-midi",
    ) == []

    score = container.music.score_query.get(piece_id)
    assert score is not None
    assert {item.note_id for item in score.annotations} == {
        "r-1",
        "r-2",
        "r-3",
        "r-4",
    }


def test_assigns_unique_fingers_to_a_chord(tmp_path: Path) -> None:
    container, piece_id, _, plan = create_piece(tmp_path)

    patch = container.fingering.command.generate(GenerateFingeringCommand(
        piece_id=piece_id,
        plan_id=plan.id,
        stage_id="stage-2",
    ))

    chord_fingers = {
        item.finger
        for item in patch.annotations
        if item.note_id in {"l-1", "l-2", "l-3"}
    }
    assert len(chord_fingers) == 3
    assert all(item.label.startswith(item.hand[0].upper()) for item in patch.annotations)


def test_regenerating_a_measure_preserves_adjacent_annotations(tmp_path: Path) -> None:
    container, piece_id, arrangement_id, plan = create_piece(tmp_path)
    container.fingering.command.generate(GenerateFingeringCommand(
        piece_id=piece_id,
        plan_id=plan.id,
        stage_id="stage-1",
    ))
    container.fingering.command.generate(GenerateFingeringCommand(
        piece_id=piece_id,
        plan_id=plan.id,
        stage_id="stage-2",
    ))
    before = {
        item.note_id: item
        for item in container.fingering.query.list_for_plan(
            plan.id,
            "finger-study",
        )
    }

    container.fingering.command.generate(GenerateFingeringCommand(
        piece_id=piece_id,
        plan_id=plan.id,
        stage_id="stage-2",
    ))
    after = {
        item.note_id: item
        for item in container.fingering.query.list_for_plan(
            plan.id,
            "finger-study",
        )
    }

    assert {note_id: after[note_id] for note_id in ("r-1", "r-2", "r-3", "r-4")} == {
        note_id: before[note_id] for note_id in ("r-1", "r-2", "r-3", "r-4")
    }


def test_same_note_coexists_across_plans_and_plan_replace_clears_only_its_data(
    tmp_path: Path,
) -> None:
    container, piece_id, _, first_plan = create_piece(tmp_path)
    repository = SqlitePieceStageRepository(tmp_path / "state.db")
    second_plan = replace(
        first_plan,
        id="plan-2",
        name="情绪型",
        stages=(
            PieceStage("plan-2-stage-1", 1, 1, "第一段", "测试"),
            PieceStage("plan-2-stage-2", 2, 2, "第二段", "测试"),
        ),
        is_active=False,
    )
    repository.save_new(second_plan)

    container.fingering.command.generate(GenerateFingeringCommand(
        piece_id=piece_id,
        plan_id=first_plan.id,
        stage_id="stage-1",
    ))
    container.fingering.command.generate(GenerateFingeringCommand(
        piece_id=piece_id,
        plan_id=second_plan.id,
        stage_id="plan-2-stage-1",
    ))

    assert len(container.fingering.query.list_for_plan(first_plan.id, "finger-study")) == 4
    assert len(container.fingering.query.list_for_plan(second_plan.id, "finger-study")) == 4

    repository.replace(replace(
        first_plan,
        generation=2,
        stages=(PieceStage("replacement-stage", 1, 2, "重分段", "测试"),),
    ))

    assert container.fingering.query.list_for_plan(first_plan.id, "finger-study") == []
    assert len(container.fingering.query.list_for_plan(second_plan.id, "finger-study")) == 4


def test_regeneration_does_not_lock_old_agent_suggestions_inside_selection() -> None:
    score = build_score()
    request = FingeringGenerationRequest(
        plan_id="plan-1",
        stage_id="stage-1",
        arrangement_id="arrangement-1",
        score_fingerprint="finger-study",
        score=score,
        start_measure=1,
        end_measure=1,
        start_beat=0,
        end_beat=4,
        context_start_beat=0,
        context_end_beat=8,
        existing=tuple(
            FingeringAnnotation(
                plan_id="plan-1",
                stage_id="stage-1",
                arrangement_id="arrangement-1",
                score_fingerprint="finger-study",
                note_id=note.id,
                hand="right",
                finger=5,
                source="agent",
            )
            for note in score.notes[:4]
        ),
    )

    patch = FingeringPlanner().generate(request)

    assert any(annotation.finger != 5 for annotation in patch.annotations)
