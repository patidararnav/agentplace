import logging
import os
import re
from datetime import datetime, timezone
from typing import Dict, List, Literal, Optional
from uuid import uuid4

from anthropic import AsyncAnthropic
from openai import AsyncOpenAI
from uagents_core.contrib.protocols.chat import ChatMessage, TextContent

logger = logging.getLogger(__name__)

_asi_client: Optional[AsyncOpenAI] = None
_claude_client: Optional[AsyncAnthropic] = None

DEFAULT_CLAUDE_MODEL = "claude-3-5-haiku-20241022"
DEFAULT_ASI_MODEL = "asi1"
LLMProvider = Literal["claude", "asi"]
CLAUDE_FALLBACK_MODELS = [
    "claude-3-5-haiku-20241022",
    "claude-haiku-4-5-20251001",
    "claude-3-haiku-20240307",
]


class LLMCallError(RuntimeError):
    """Raised when strict LLM generation cannot complete."""


def _normalize_provider(provider: str) -> LLMProvider:
    token = str(provider or "").strip().lower()
    if token in {"", "auto", "default"}:
        token = os.getenv("LLM_PROVIDER", "claude").strip().lower()
    if token in {"asi", "asi1"}:
        return "asi"
    return "claude"


def get_asi_client() -> Optional[AsyncOpenAI]:
    global _asi_client
    api_key = os.getenv("ASI1_API_KEY", "").strip()
    if not api_key:
        return None
    if _asi_client is None:
        _asi_client = AsyncOpenAI(
            base_url="https://api.asi1.ai/v1",
            api_key=api_key,
        )
    return _asi_client


def get_claude_client() -> Optional[AsyncAnthropic]:
    global _claude_client
    api_key = os.getenv("CLAUDE_API_KEY", "").strip()
    if not api_key:
        return None
    if _claude_client is None:
        _claude_client = AsyncAnthropic(api_key=api_key)
    return _claude_client


def get_llm_client(provider: str = "auto") -> Optional[object]:
    normalized = _normalize_provider(provider)
    if normalized == "asi":
        return get_asi_client()
    return get_claude_client()


async def _generate_with_asi(
    *,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int,
    temperature: float,
) -> str:
    client = get_asi_client()
    if client is None:
        raise LLMCallError("LLM client unavailable (ASI1_API_KEY missing).")

    response = await client.chat.completions.create(
        model=os.getenv("ASI1_MODEL", DEFAULT_ASI_MODEL),
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        max_tokens=max_tokens,
        temperature=temperature,
    )
    text = (response.choices[0].message.content or "").strip()
    if not text:
        raise LLMCallError("ASI LLM returned an empty response.")
    return text


async def _generate_with_claude(
    *,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int,
    temperature: float,
) -> str:
    client = get_claude_client()
    if client is None:
        raise LLMCallError("LLM client unavailable (CLAUDE_API_KEY missing).")

    requested_model = os.getenv("CLAUDE_MODEL", DEFAULT_CLAUDE_MODEL).strip()
    model_candidates = [requested_model] + [
        mid for mid in CLAUDE_FALLBACK_MODELS if mid != requested_model
    ]
    response = None
    last_err: Optional[Exception] = None
    for model_id in model_candidates:
        try:
            response = await client.messages.create(
                model=model_id,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
                max_tokens=max(1, int(max_tokens)),
                temperature=temperature,
            )
            break
        except Exception as exc:
            last_err = exc
            if "not_found_error" not in str(exc):
                raise
            logger.warning("Claude model unavailable: %s", model_id)
    if response is None:
        raise LLMCallError(str(last_err) if last_err else "Claude call failed.")
    chunks: List[str] = []
    for block in response.content:
        if getattr(block, "type", "") == "text":
            text = str(getattr(block, "text", "")).strip()
            if text:
                chunks.append(text)
    output = "\n".join(chunks).strip()
    if not output:
        raise LLMCallError("Claude LLM returned an empty response.")
    return output


async def generate_text(
    system_prompt: str,
    user_prompt: str,
    fallback: str = "",
    *,
    max_tokens: int = 120,
    temperature: float = 0.8,
    strict: bool = False,
    provider: str = "auto",
) -> str:
    normalized = _normalize_provider(provider)
    try:
        if normalized == "asi":
            return await _generate_with_asi(
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                max_tokens=max_tokens,
                temperature=temperature,
            )
        return await _generate_with_claude(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
        )
    except LLMCallError as exc:
        if strict:
            raise
        logger.warning(
            "LLM call failed (provider=%s), using fallback: %s",
            normalized,
            exc,
        )
        return fallback
    except Exception as exc:
        if strict:
            raise LLMCallError(str(exc)) from exc
        logger.warning(
            "LLM call failed (provider=%s), using fallback: %s",
            normalized,
            exc,
        )
        return fallback


def make_chat_message(text: str) -> ChatMessage:
    return ChatMessage(
        timestamp=datetime.now(timezone.utc),
        msg_id=uuid4(),
        content=[TextContent(type="text", text=text)],
    )


def extract_text(msg: ChatMessage) -> str:
    chunks: List[str] = []
    for item in msg.content:
        if isinstance(item, TextContent):
            chunks.append(item.text)
        elif isinstance(item, dict) and item.get("type") == "text":
            chunks.append(str(item.get("text", "")))
        elif hasattr(item, "text"):
            chunks.append(str(getattr(item, "text")))
    return "\n".join(chunks).strip()


def parse_fields(text: str) -> Dict[str, str]:
    fields: Dict[str, str] = {}
    for line in text.splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip().upper()
        value = value.strip()
        if key:
            fields[key] = value
    return fields


def extract_price(text: str) -> int:
    dollar_match = re.search(r"\$([0-9]{2,6})", text)
    if dollar_match:
        return int(dollar_match.group(1))
    price_match = re.search(r"\b([0-9]{2,6})\b", text)
    if price_match:
        return int(price_match.group(1))
    return 0


def services_from_csv(raw: str) -> List[str]:
    return [service.strip().lower() for service in raw.split(",") if service.strip()]
