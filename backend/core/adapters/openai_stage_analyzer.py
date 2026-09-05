import json
from math import ceil
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

from core.domain.llm_settings import LlmSettings
from core.domain.music import PianoScore
from core.domain.piece_stages import PieceStage


class _StageSuggestion(BaseModel):
    start_measure: int = Field(ge=1)
    end_measure: int = Field(ge=1)
    label: str = Field(min_length=1, max_length=40)
    reason: str = Field(min_length=1, max_length=240)


class _StageAnalysis(BaseModel):
    stages: list[_StageSuggestion] = Field(min_length=1)


class OpenAiCompatibleStageAnalyzer:
    def analyze(
        self,
        title: str,
        score: PianoScore,
        settings: LlmSettings,
        api_key: str,
        instruction: str,
    ) -> tuple[PieceStage, ...]:
        summary = _score_summary(score)
        measure_count = len(summary["measures"])
        client = ChatOpenAI(
            base_url=settings.base_url,
            api_key=api_key,
            model=settings.model,
            temperature=0,
            max_retries=1,
            timeout=90,
            model_kwargs={"response_format": {"type": "json_object"}},
        )
        response = client.invoke([
            SystemMessage(content=(
                "你是钢琴谱面结构分析 Agent。根据按小节整理的 MIDI 摘要，将整首曲子划分为适合独立生成指法的连续段落。"
                "段落必须从第1小节开始，连续、无重叠、无空洞，并覆盖最后一个小节。"
                "优先依据休止、节奏型变化、音域变化、重复材料、终止感和手位变化划分。"
                "通常每段2到8小节，但音乐结构优先。只输出 JSON。"
            )),
            HumanMessage(content=json.dumps({
                "task": "analyze score stages and return JSON with a stages array",
                "output_schema": {
                    "stages": [{
                        "start_measure": 1,
                        "end_measure": 4,
                        "label": "简短中文名称",
                        "reason": "简短中文分段依据",
                    }],
                },
                "piece": title,
                "measure_count": measure_count,
                "user_instruction": instruction.strip() or None,
                "score": summary,
            }, ensure_ascii=False)),
        ])
        parsed = _StageAnalysis.model_validate_json(
            _strip_code_fence(_message_text(response.content))
        )
        return _normalize_stages(parsed.stages, measure_count)


def _score_summary(score: PianoScore) -> dict[str, Any]:
    time_signature = score.meters[0] if score.meters else "4/4"
    beats_per_measure = _beats_per_measure(time_signature)
    total_beats = max(
        (note.start_beats + note.duration_beats for note in score.notes),
        default=0.0,
    )
    measure_count = max(1, ceil(total_beats / beats_per_measure))
    measures: list[dict[str, Any]] = []
    for index in range(measure_count):
        start = index * beats_per_measure
        end = start + beats_per_measure
        notes = [note for note in score.notes if start <= note.start_beats < end]
        hand_summary: dict[str, Any] = {}
        for hand in ("left", "right"):
            hand_notes = [note for note in notes if note.hand == hand]
            if not hand_notes:
                continue
            pitches = [note.pitch for note in hand_notes]
            hand_summary[hand] = {
                "notes": len(hand_notes),
                "pitch_range": [min(pitches), max(pitches)],
                "onsets": sorted({round(note.start_beats - start, 3) for note in hand_notes}),
                "durations": sorted({round(note.duration_beats, 3) for note in hand_notes}),
                "mean_velocity": round(
                    sum(note.velocity or 64 for note in hand_notes) / len(hand_notes),
                ),
            }
        measures.append({
            "measure": index + 1,
            "hands": hand_summary,
            "note_count": len(notes),
        })
    return {
        "time_signature": time_signature,
        "tempo_bpm": score.tempos[0] if score.tempos else 120,
        "measures": measures,
    }


def _normalize_stages(
    suggestions: list[_StageSuggestion],
    measure_count: int,
) -> tuple[PieceStage, ...]:
    ordered = sorted(suggestions, key=lambda item: (item.start_measure, item.end_measure))
    boundaries = sorted({
        1,
        *(min(measure_count, max(1, item.start_measure)) for item in ordered),
    })
    suggestions_by_start = {
        min(measure_count, max(1, item.start_measure)): item
        for item in ordered
    }
    stages: list[PieceStage] = []
    for index, start in enumerate(boundaries):
        end = boundaries[index + 1] - 1 if index + 1 < len(boundaries) else measure_count
        suggestion = suggestions_by_start.get(start)
        stages.append(PieceStage(
            id=f"stage-{start}-{end}",
            start_measure=start,
            end_measure=end,
            label=suggestion.label.strip() if suggestion else f"第 {index + 1} 段",
            reason=(
                suggestion.reason.strip()
                if suggestion
                else "根据相邻音乐材料边界补全"
            ),
        ))
    return tuple(stages)


def _message_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(
            str(item.get("text", "")) if isinstance(item, dict) else str(item)
            for item in content
        )
    return str(content)


def _strip_code_fence(value: str) -> str:
    stripped = value.strip()
    if not stripped.startswith("```"):
        return stripped
    lines = stripped.splitlines()
    if lines and lines[-1].strip() == "```":
        lines = lines[1:-1]
    else:
        lines = lines[1:]
    return "\n".join(lines)


def _beats_per_measure(time_signature: str) -> float:
    try:
        numerator_text, denominator_text = time_signature.split("/", maxsplit=1)
        numerator = int(numerator_text)
        denominator = int(denominator_text)
    except (TypeError, ValueError):
        return 4.0
    if numerator <= 0 or denominator <= 0:
        return 4.0
    return numerator * (4.0 / denominator)
