import base64
import json
import sys
from typing import Any

from core.app.app_error import AppError
from core.app.fingering import (
    AdoptFingeringCandidateCommand,
    CancelFingeringTrialCommand,
    CompleteFingeringTrialPassCommand,
    CreateFingeringTrialCommand,
    GenerateFingeringCandidatesCommand,
    GenerateFingeringCommand,
    StartFingeringTrialPassCommand,
)
from core.app.music.query import MusicPieceScore
from core.app.piece_stages import (
    ActivatePieceStagePlanCommand,
    AnalyzePieceStagesCommand,
    DeletePieceStagePlanCommand,
    RenamePieceStagePlanCommand,
)
from core.app.practice import SavePracticeSessionCommand
from core.domain.music import MusicPiece, MusicPieceId
from core.infra.setup import default_state_path, init_app_container


container = init_app_container()


def configure_standard_streams() -> None:
    if hasattr(sys.stdin, "reconfigure"):
        sys.stdin.reconfigure(encoding="utf-8")
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")


def main() -> None:
    configure_standard_streams()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        response = handle_line(line)
        sys.stdout.write(json.dumps(response, ensure_ascii=False) + "\n")
        sys.stdout.flush()


def handle_line(line: str) -> dict[str, Any]:
    request_id = None
    try:
        request = json.loads(line)
        request_id = request.get("id")
        result = dispatch(request.get("method"), request.get("params") or {})
        return {"id": request_id, "ok": True, "result": result}
    except AppError as error:
        return {"id": request_id, "ok": False, "error": error.message}
    except Exception as error:
        return {"id": request_id, "ok": False, "error": str(error)}


def dispatch(method: str, params: dict[str, Any]) -> Any:
    if method == "app_get_storage_info":
        state_path = default_state_path()
        return {
            "databasePath": str(state_path),
            "dataDirectory": str(state_path.parent),
        }
    if method == "music_list_pieces":
        return [piece_response(piece) for piece in container.music.query.list_pieces()]
    if method == "music_get_piece":
        piece = container.music.query.get_piece(MusicPieceId.parse(params["piece_id"]))
        if piece is None:
            raise AppError.not_found("piece not found")
        return piece_response(piece)
    if method == "music_get_piece_score":
        score = container.music.score_query.get(MusicPieceId.parse(params["piece_id"]))
        if score is None:
            raise AppError.not_found("piece not found")
        return piece_score_response(score)
    if method == "music_generate_fingering":
        patch = container.fingering.command.generate(GenerateFingeringCommand(
            piece_id=MusicPieceId.parse(params["piece_id"]),
            plan_id=str(params["plan_id"]),
            stage_id=str(params["stage_id"]),
        ))
        return fingering_patch_response(patch)
    if method == "fingering_generate_candidates":
        candidates = container.fingering.command.generate_candidates(
            GenerateFingeringCandidatesCommand(
                piece_id=MusicPieceId.parse(params["piece_id"]),
                plan_id=str(params["plan_id"]),
                stage_id=str(params["stage_id"]),
                limit=int(params.get("limit", 3)),
            )
        )
        return [fingering_candidate_response(item) for item in candidates]
    if method == "fingering_list_candidates":
        candidates = container.fingering.query.list_candidates(
            str(params["piece_id"]),
            str(params["stage_id"]) if params.get("stage_id") else None,
        )
        return [fingering_candidate_response(item) for item in candidates]
    if method == "fingering_create_trial":
        candidate_ids = tuple(str(item) for item in params["candidate_ids"])
        if len(candidate_ids) != 2:
            raise AppError.validation("A-B-A trial requires two candidates")
        trial = container.fingering.command.create_trial(CreateFingeringTrialCommand(
            piece_id=MusicPieceId.parse(params["piece_id"]),
            candidate_ids=(candidate_ids[0], candidate_ids[1]),
            mode=str(params["mode"]),
            bpm=int(params["bpm"]),
        ))
        return fingering_trial_response(trial)
    if method == "fingering_list_trials":
        trials = container.fingering.query.list_trials(str(params["piece_id"]))
        return [fingering_trial_response(item) for item in trials]
    if method == "fingering_start_trial_pass":
        trial = container.fingering.command.start_trial_pass(
            StartFingeringTrialPassCommand(
                trial_id=str(params["trial_id"]),
                pass_id=str(params["pass_id"]),
            )
        )
        return fingering_trial_response(trial)
    if method == "fingering_complete_trial_pass":
        comfort_rating = params.get("comfort_rating")
        trial = container.fingering.command.complete_trial_pass(
            CompleteFingeringTrialPassCommand(
                trial_id=str(params["trial_id"]),
                pass_id=str(params["pass_id"]),
                practice_session_id=str(params["practice_session_id"]),
                adherence=str(params.get("adherence", "unknown")),
                comfort_rating=(
                    int(comfort_rating) if comfort_rating is not None else None
                ),
            )
        )
        return fingering_trial_response(trial)
    if method == "fingering_cancel_trial":
        trial = container.fingering.command.cancel_trial(
            CancelFingeringTrialCommand(trial_id=str(params["trial_id"]))
        )
        return fingering_trial_response(trial)
    if method == "fingering_adopt_candidate":
        candidate = container.fingering.command.adopt_candidate(
            AdoptFingeringCandidateCommand(
                piece_id=MusicPieceId.parse(params["piece_id"]),
                candidate_id=str(params["candidate_id"]),
            )
        )
        return fingering_candidate_response(candidate)
    if method == "practice_save_session":
        session = params["session"]
        saved = container.practice.command.save(SavePracticeSessionCommand(
            id=str(session["id"]),
            piece_id=str(session["pieceId"]),
            started_at=str(session["startedAt"]),
            ended_at=str(session["endedAt"]),
            initial_mode=str(session["initialMode"]),
            initial_bpm=int(session["initialBpm"]),
            scope=dict(session.get("scope", {})),
            events=tuple(session.get("events", [])),
            attempts=tuple(session.get("attempts", [])),
            summary=dict(session.get("summary", {})),
        ))
        return {"saved": True, "sessionId": saved.id}
    if method == "practice_list_sessions":
        sessions = container.practice.query.list_for_piece(
            str(params["piece_id"]),
            int(params.get("limit", 20)),
        )
        return [practice_session_response(session) for session in sessions]
    if method == "llm_get_settings":
        return llm_settings_response(
            container.agent.llm_settings.query.get(),
            container.agent.llm_settings.query.has_api_key(),
        )
    if method == "llm_save_settings":
        settings = container.agent.llm_settings.command.save(
            base_url=str(params["base_url"]),
            model=str(params["model"]),
            api_key=str(params.get("api_key", "")),
        )
        return llm_settings_response(
            settings,
            container.agent.llm_settings.query.has_api_key(),
        )
    if method == "llm_clear_api_key":
        container.agent.llm_settings.command.clear_api_key()
        return {"apiKeyConfigured": False}
    if method == "llm_test_connection":
        result = container.agent.llm_settings.command.test_connection(
            base_url=str(params["base_url"]),
            model=str(params["model"]),
            api_key=str(params["api_key"]),
        )
        return {
            "connected": True,
            "model": result.model,
            "latencyMs": result.latency_ms,
        }
    if method == "music_get_stage_plan":
        plan = container.agent.piece_stages.query.get(
            MusicPieceId.parse(params["piece_id"])
        )
        return piece_stage_plan_response(plan)
    if method == "music_list_stage_plans":
        plans = container.agent.piece_stages.query.list(
            MusicPieceId.parse(params["piece_id"])
        )
        return [piece_stage_plan_response(plan) for plan in plans]
    if method == "music_analyze_stages":
        plan = container.agent.piece_stages.command.analyze(AnalyzePieceStagesCommand(
            piece_id=MusicPieceId.parse(params["piece_id"]),
            plan_id=str(params["plan_id"]) if params.get("plan_id") else None,
            name=str(params["name"]) if params.get("name") is not None else None,
            prompt=str(params["prompt"]) if params.get("prompt") is not None else None,
        ))
        return piece_stage_plan_response(plan)
    if method == "music_rename_stage_plan":
        plan = container.agent.piece_stages.command.rename(RenamePieceStagePlanCommand(
            piece_id=MusicPieceId.parse(params["piece_id"]),
            plan_id=str(params["plan_id"]),
            name=str(params["name"]),
        ))
        return piece_stage_plan_response(plan)
    if method == "music_activate_stage_plan":
        plan = container.agent.piece_stages.command.activate(ActivatePieceStagePlanCommand(
            piece_id=MusicPieceId.parse(params["piece_id"]),
            plan_id=str(params["plan_id"]),
        ))
        return piece_stage_plan_response(plan)
    if method == "music_delete_stage_plan":
        deleted = container.agent.piece_stages.command.delete(DeletePieceStagePlanCommand(
            piece_id=MusicPieceId.parse(params["piece_id"]),
            plan_id=str(params["plan_id"]),
        ))
        return {"deleted": deleted}
    if method == "music_delete_piece":
        container.music.command.delete_piece(MusicPieceId.parse(params["piece_id"]))
        return {"deleted": True}
    if method == "music_import_midi_bytes":
        content = base64.b64decode(params["content"], validate=True)
        result = container.music.local_library.import_midi_bytes(
            file_name=str(params["file_name"]),
            content=content,
            upload_dir=str(default_state_path().parent / "uploads"),
        )
        return piece_response(result.piece)
    if method == "music_list_watch_paths":
        return {"paths": container.music.local_library_query.list_watch_paths()}
    if method == "music_add_watch_path":
        report = container.music.local_library.add_watch_path(params["path"])
        return scan_report_response(report)
    if method == "music_add_watch_paths":
        report = container.music.local_library.add_watch_paths(params["paths"])
        return scan_report_response(report)
    if method == "music_remove_watch_path":
        removed = container.music.local_library.remove_watch_path(params["path"])
        return {"removed": removed}
    if method == "music_refresh_library":
        report = container.music.local_library.refresh_watched_paths()
        return scan_report_response(report)
    raise AppError.not_found(f"unknown rpc method: {method}")


def piece_response(piece: MusicPiece) -> dict[str, Any]:
    arrangement = piece.arrangements[0] if piece.arrangements else None
    score = arrangement.score if arrangement else None
    note_count = score.note_count if score else 0
    return {
        "id": piece.id.value,
        "title": piece.title,
        "composer": piece.creator or "Local MIDI",
        "level": "本地 MIDI",
        "durationSeconds": max(30, min(600, note_count // 4 if note_count else 30)),
        "keySignature": score.meters[0] if score and score.meters else "4/4",
        "bpm": int(score.tempos[0]) if score and score.tempos else 120,
        "progress": 0,
        "lastPracticedAt": piece.updated_at,
        "mistakeHotspots": [],
        "sourcePath": arrangement.source_path if arrangement else None,
        "arrangementCount": len(piece.arrangements),
        "noteCount": note_count,
    }


def scan_report_response(report: Any) -> dict[str, Any]:
    return {
        "watchedPaths": report.watched_paths,
        "discoveredFiles": report.discovered_files,
        "registeredFiles": report.registered_files,
        "updatedFiles": report.updated_files,
    }


def piece_score_response(result: MusicPieceScore) -> dict[str, Any]:
    piece = result.piece
    arrangement = piece.arrangements[0] if piece.arrangements else None
    score = arrangement.score if arrangement else None
    notes = score.notes if score else []
    tempo = int(score.tempos[0]) if score and score.tempos else 120
    time_signature = score.meters[0] if score and score.meters else "4/4"
    total_beats = max(
        (note.start_beats + note.duration_beats for note in notes),
        default=0,
    )
    annotations = {
        annotation.note_id: annotation
        for annotation in result.annotations
    }
    return {
        "pieceId": piece.id.value,
        "arrangementId": arrangement.id.value if arrangement else "",
        "scoreFingerprint": arrangement.fingerprint if arrangement else "",
        "title": piece.title,
        "tempoBpm": tempo,
        "timeSignature": time_signature,
        "totalBeats": total_beats,
        "handAnalysisVersion": score.hand_analysis_version if score else None,
        "handConfidence": (
            sum(note.hand_confidence for note in notes) / len(notes) if notes else 0
        ),
        "notes": [
            {
                "id": note.id or f"{index}-{note.pitch}-{note.start_beats:.4f}",
                "pitch": note.pitch,
                "startBeat": note.start_beats,
                "durationBeats": note.duration_beats,
                "velocity": note.velocity or 64,
                "track": note.track,
                "channel": note.channel,
                "hand": note.hand,
                "handConfidence": note.hand_confidence,
                "fingering": (
                    annotations[note.id].label if note.id in annotations else None
                ),
                "fingeringSource": (
                    annotations[note.id].source if note.id in annotations else None
                ),
                "fingeringConfidence": (
                    annotations[note.id].confidence if note.id in annotations else None
                ),
            }
            for index, note in enumerate(notes)
        ],
    }


def fingering_patch_response(patch: Any) -> dict[str, Any]:
    return {
        "planId": patch.plan_id,
        "stageId": patch.stage_id,
        "arrangementId": patch.arrangement_id,
        "startMeasure": patch.start_measure,
        "endMeasure": patch.end_measure,
        "updatedCount": len(patch.annotations),
        "warnings": list(patch.warnings),
        "annotations": [
            {
                "noteId": annotation.note_id,
                "hand": annotation.hand,
                "finger": annotation.finger,
                "label": annotation.label,
                "confidence": annotation.confidence,
            }
            for annotation in patch.annotations
        ],
    }


def fingering_candidate_response(candidate: Any) -> dict[str, Any]:
    return {
        "id": candidate.id,
        "pieceId": candidate.piece_id,
        "planId": candidate.plan_id,
        "stageId": candidate.stage_id,
        "arrangementId": candidate.arrangement_id,
        "scoreFingerprint": candidate.score_fingerprint,
        "name": candidate.name,
        "strategy": candidate.strategy,
        "startMeasure": candidate.start_measure,
        "endMeasure": candidate.end_measure,
        "startBeat": candidate.start_beat,
        "endBeat": candidate.end_beat,
        "features": candidate.features,
        "createdAt": candidate.created_at,
        "assignments": [
            {
                "noteId": item.note_id,
                "hand": item.hand,
                "finger": item.finger,
                "label": item.label,
            }
            for item in candidate.assignments
        ],
    }


def fingering_trial_response(trial: Any) -> dict[str, Any]:
    return {
        "id": trial.id,
        "pieceId": trial.piece_id,
        "planId": trial.plan_id,
        "stageId": trial.stage_id,
        "arrangementId": trial.arrangement_id,
        "scoreFingerprint": trial.score_fingerprint,
        "protocol": trial.protocol,
        "mode": trial.mode,
        "bpm": trial.bpm,
        "startMeasure": trial.start_measure,
        "endMeasure": trial.end_measure,
        "startBeat": trial.start_beat,
        "endBeat": trial.end_beat,
        "candidateIds": list(trial.candidate_ids),
        "status": trial.status,
        "createdAt": trial.created_at,
        "completedAt": trial.completed_at,
        "passes": [
            {
                "id": item.id,
                "candidateId": item.candidate_id,
                "position": item.position,
                "status": item.status,
                "practiceSessionId": item.practice_session_id,
                "adherence": item.adherence,
                "comfortRating": item.comfort_rating,
                "startedAt": item.started_at,
                "completedAt": item.completed_at,
                "summary": item.summary,
            }
            for item in trial.passes
        ],
    }


def practice_session_response(session: Any) -> dict[str, Any]:
    scored_beats = [
        float(item["targetBeat"])
        for item in session.attempts
        if item.get("targetBeat") is not None
    ]
    return {
        "id": session.id,
        "pieceId": session.piece_id,
        "startedAt": session.started_at,
        "endedAt": session.ended_at,
        "initialMode": session.initial_mode,
        "initialBpm": session.initial_bpm,
        "scope": session.scope,
        "startBeat": min(scored_beats) if scored_beats else None,
        "endBeat": max(scored_beats) if scored_beats else None,
        "summary": session.summary,
    }


def llm_settings_response(
    settings: Any,
    api_key_configured: bool,
) -> dict[str, Any]:
    return {
        "baseUrl": settings.base_url,
        "model": settings.model,
        "updatedAt": settings.updated_at,
        "apiKeyConfigured": api_key_configured,
    }


def piece_stage_plan_response(plan: Any) -> dict[str, Any] | None:
    if plan is None:
        return None
    return {
        "id": plan.id,
        "arrangementId": plan.arrangement_id,
        "name": plan.name,
        "segmentationPrompt": plan.segmentation_prompt,
        "model": plan.model,
        "generation": plan.generation,
        "isActive": plan.is_active,
        "analyzedAt": plan.analyzed_at,
        "stages": [
            {
                "id": stage.id,
                "startMeasure": stage.start_measure,
                "endMeasure": stage.end_measure,
                "label": stage.label,
                "reason": stage.reason,
            }
            for stage in plan.stages
        ],
    }


if __name__ == "__main__":
    main()
