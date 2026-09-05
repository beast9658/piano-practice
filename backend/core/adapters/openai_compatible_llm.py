from time import monotonic

from langchain_core.messages import HumanMessage
from langchain_openai import ChatOpenAI

from core.app.llm_settings import LlmConnectionResult
from core.domain.llm_settings import LlmSettings


class OpenAiCompatibleLlmClient:
    def test_connection(
        self,
        settings: LlmSettings,
        api_key: str,
    ) -> LlmConnectionResult:
        client = ChatOpenAI(
            base_url=settings.base_url,
            api_key=api_key,
            model=settings.model,
            temperature=0,
            max_retries=1,
            timeout=20,
        )
        started_at = monotonic()
        response = client.invoke([
            HumanMessage(content="Reply with exactly OK."),
        ])
        latency_ms = round((monotonic() - started_at) * 1000)
        response_model = response.response_metadata.get("model_name")
        return LlmConnectionResult(
            model=str(response_model or settings.model),
            latency_ms=latency_ms,
        )
