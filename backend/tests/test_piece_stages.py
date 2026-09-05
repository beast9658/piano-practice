from pathlib import Path
import sqlite3

from core.adapters.persistence.sqlite_fingering_repository import SqliteFingeringRepository
from core.adapters.persistence.sqlite_music_repository import SqliteMusicPieceRepository
from core.adapters.persistence.sqlite_piece_stage_repository import SqlitePieceStageRepository
from core.app.piece_stages import (
    AnalyzePieceStagesCommand,
    DeletePieceStagePlanCommand,
    PieceStageCommandHandler,
    PieceStageQueryHandler,
    RenamePieceStagePlanCommand,
)
from core.domain.llm_settings import LlmSettings
from core.domain.music import (
    ArrangementId,
    MusicPiece,
    MusicPieceId,
    NoteEvent,
    PianoArrangement,
    PianoScore,
)
from core.domain.piece_stages import PieceStage


class FakeStageAnalyzer:
    def __init__(self) -> None:
        self.instructions: list[str] = []

    def analyze(self, title, score, settings, api_key, instruction):
        assert title == "Stage Study"
        assert api_key == "secret"
        self.instructions.append(instruction)
        return (
            PieceStage("candidate-1", 1, 2, "主题", "节奏材料保持一致"),
            PieceStage("candidate-2", 3, 4, "变化", "右手音域发生变化"),
        )


class FakeLlmSettings:
    def get(self):
        return LlmSettings.create("https://api.deepseek.com", "deepseek-chat")

    def get_api_key(self):
        return "secret"


def create_handler(tmp_path: Path):
    database = tmp_path / "state.db"
    pieces = SqliteMusicPieceRepository(database)
    piece_id = MusicPieceId.parse("stage-piece")
    arrangement_id = ArrangementId.parse("stage-arrangement")
    score = PianoScore(
        notes=[
            NoteEvent(
                id=f"note-{index}",
                pitch=60 + index,
                start_beats=float(index * 2),
                duration_beats=1,
                hand="right",
                hand_confidence=0.99,
            )
            for index in range(8)
        ],
        tempos=[72],
        meters=["4/4"],
    )
    pieces.save_piece(MusicPiece(
        id=piece_id,
        title="Stage Study",
        arrangements=[PianoArrangement(
            id=arrangement_id,
            piece_id=piece_id,
            title="Stage Study",
            source_path="/tmp/stage.mid",
            fingerprint="score-v1",
            score=score,
        )],
    ))
    stages = SqlitePieceStageRepository(database)
    analyzer = FakeStageAnalyzer()
    command = PieceStageCommandHandler(
        pieces=pieces,
        stages=stages,
        analyzer=analyzer,
        llm_settings=FakeLlmSettings(),
    )
    query = PieceStageQueryHandler(pieces=pieces, stages=stages)
    return command, query, stages, analyzer, piece_id, arrangement_id


def test_analyzes_and_persists_continuous_piece_stages(tmp_path: Path) -> None:
    command, _, stages, analyzer, piece_id, arrangement_id = create_handler(tmp_path)

    plan = command.analyze(AnalyzePieceStagesCommand(
        piece_id=piece_id,
        name="节奏型",
        prompt="优先按照节奏变化分段",
    ))

    assert [(stage.start_measure, stage.end_measure) for stage in plan.stages] == [
        (1, 2),
        (3, 4),
    ]
    assert plan.name == "节奏型"
    assert plan.generation == 1
    assert plan.is_active is True
    assert analyzer.instructions == ["优先按照节奏变化分段"]
    assert stages.get_by_id(plan.id, arrangement_id.value, "score-v1") == plan


def test_multiple_stage_plans_coexist_and_regeneration_reuses_plan_id(tmp_path: Path) -> None:
    command, query, _, analyzer, piece_id, _ = create_handler(tmp_path)
    rhythm = command.analyze(AnalyzePieceStagesCommand(
        piece_id=piece_id,
        name="节奏型",
        prompt="按节奏分段",
    ))
    emotion = command.analyze(AnalyzePieceStagesCommand(
        piece_id=piece_id,
        name="情绪型",
        prompt="按情绪分段",
    ))

    updated = command.analyze(AnalyzePieceStagesCommand(
        piece_id=piece_id,
        plan_id=rhythm.id,
        prompt="优先保留重复节奏型",
    ))
    plans = query.list(piece_id)

    assert {plan.id for plan in plans} == {rhythm.id, emotion.id}
    assert updated.id == rhythm.id
    assert updated.generation == 2
    assert updated.segmentation_prompt == "优先保留重复节奏型"
    assert analyzer.instructions[-1] == "优先保留重复节奏型"


def test_rename_stage_plan_does_not_run_analysis_or_increment_generation(tmp_path: Path) -> None:
    command, _, _, analyzer, piece_id, _ = create_handler(tmp_path)
    plan = command.analyze(AnalyzePieceStagesCommand(
        piece_id=piece_id,
        name="原方案",
        prompt="按节奏分段",
    ))

    renamed = command.rename(RenamePieceStagePlanCommand(
        piece_id=piece_id,
        plan_id=plan.id,
        name="新方案",
    ))

    assert renamed.id == plan.id
    assert renamed.name == "新方案"
    assert renamed.generation == plan.generation
    assert renamed.stages == plan.stages
    assert analyzer.instructions == ["按节奏分段"]


def test_delete_plan_keeps_other_plan_and_selects_replacement(tmp_path: Path) -> None:
    command, query, _, _, piece_id, _ = create_handler(tmp_path)
    first = command.analyze(AnalyzePieceStagesCommand(piece_id=piece_id, name="方案一"))
    second = command.analyze(AnalyzePieceStagesCommand(piece_id=piece_id, name="方案二"))

    assert command.delete(DeletePieceStagePlanCommand(piece_id, second.id)) is True

    remaining = query.list(piece_id)
    assert [plan.id for plan in remaining] == [first.id]
    assert query.get(piece_id).id == first.id


def test_stage_plan_isolated_by_midi_fingerprint(tmp_path: Path) -> None:
    command, _, stages, _, piece_id, arrangement_id = create_handler(tmp_path)
    plan = command.analyze(AnalyzePieceStagesCommand(piece_id))

    assert stages.get_by_id(plan.id, arrangement_id.value, "score-v2") is None


def test_legacy_agent_schema_is_cleared_without_touching_other_data(tmp_path: Path) -> None:
    database = tmp_path / "legacy.db"
    with sqlite3.connect(database) as connection:
        connection.executescript(
            """
            create table piece_stage_plans (
              arrangement_id text primary key,
              score_fingerprint text not null,
              model text not null,
              stages_json text not null,
              analyzed_at text not null
            );
            insert into piece_stage_plans values ('arr-1', 'score-1', 'model', '[]', 'now');

            create table fingering_annotations (
              arrangement_id text not null,
              note_id text not null,
              primary key (arrangement_id, note_id)
            );
            insert into fingering_annotations values ('arr-1', 'note-1');

            create table unrelated_data (value text not null);
            insert into unrelated_data values ('keep-me');
            """
        )

    SqlitePieceStageRepository(database)
    SqliteFingeringRepository(database)

    with sqlite3.connect(database) as connection:
        plan_columns = {
            row[1]
            for row in connection.execute("pragma table_info(piece_stage_plans)")
        }
        assert {"id", "name", "generation"}.issubset(plan_columns)
        assert connection.execute("select count(*) from piece_stage_plans").fetchone()[0] == 0
        assert connection.execute("select count(*) from piece_stages").fetchone()[0] == 0
        assert connection.execute("select count(*) from fingering_annotations").fetchone()[0] == 0
        assert connection.execute("select value from unrelated_data").fetchone()[0] == "keep-me"
