from dataclasses import dataclass
from urllib.parse import urlparse


DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEEPSEEK_CHAT_MODEL = "deepseek-chat"


@dataclass(frozen=True)
class LlmSettings:
    base_url: str
    model: str
    updated_at: str = ""

    @classmethod
    def create(
        cls,
        base_url: str,
        model: str,
        updated_at: str = "",
    ) -> "LlmSettings":
        normalized_url = base_url.strip().rstrip("/")
        parsed_url = urlparse(normalized_url)
        if parsed_url.scheme not in ("http", "https") or not parsed_url.netloc:
            raise ValueError("LLM Base URL 必须是有效的 HTTP 或 HTTPS 地址")
        normalized_model = model.strip()
        if not normalized_model:
            raise ValueError("LLM 模型名称不能为空")
        return cls(
            base_url=normalized_url,
            model=normalized_model,
            updated_at=updated_at,
        )

    @classmethod
    def deepseek_default(cls) -> "LlmSettings":
        return cls(base_url=DEEPSEEK_BASE_URL, model=DEEPSEEK_CHAT_MODEL)
