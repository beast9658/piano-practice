from typing import Any, TypedDict

from core.app.fingering import FingeringGenerationRequest, FingeringPatch, FingeringPlanner


class _FingeringState(TypedDict, total=False):
    request: FingeringGenerationRequest
    patch: FingeringPatch


class LangGraphFingeringAgent:
    """LangGraph orchestration adapter with a deterministic local fallback."""

    def __init__(self, planner: FingeringPlanner | None = None) -> None:
        self._planner = planner or FingeringPlanner()
        self._graph = self._build_graph()

    def generate(self, request: FingeringGenerationRequest) -> FingeringPatch:
        if self._graph is None:
            return self._planner.validate(request, self._planner.generate(request))
        result: dict[str, Any] = self._graph.invoke({"request": request})
        patch = result.get("patch")
        if not isinstance(patch, FingeringPatch):
            raise ValueError("fingering graph returned no patch")
        return patch

    def generate_candidates(
        self,
        request: FingeringGenerationRequest,
        limit: int = 3,
    ) -> tuple[tuple[str, FingeringPatch], ...]:
        return self._planner.generate_candidates(request, limit)

    def _build_graph(self) -> Any | None:
        try:
            from langchain_core.runnables import RunnableLambda
            from langgraph.graph import END, START, StateGraph
        except ImportError:
            return None

        graph = StateGraph(_FingeringState)
        graph.add_node("generate_candidates", RunnableLambda(self._generate_candidates))
        graph.add_node("validate_patch", RunnableLambda(self._validate_patch))
        graph.add_edge(START, "generate_candidates")
        graph.add_edge("generate_candidates", "validate_patch")
        graph.add_edge("validate_patch", END)
        return graph.compile()

    def _generate_candidates(self, state: _FingeringState) -> _FingeringState:
        request = state["request"]
        return {"patch": self._planner.generate(request)}

    def _validate_patch(self, state: _FingeringState) -> _FingeringState:
        request = state["request"]
        return {"patch": self._planner.validate(request, state["patch"])}
