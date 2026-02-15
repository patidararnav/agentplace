import logging
import os
import re
from datetime import datetime, timezone
from typing import Dict, List, Optional
from uuid import uuid4

from openai import AsyncOpenAI
from uagents_core.contrib.protocols.chat import ChatMessage, TextContent

logger = logging.getLogger(__name__)

_llm_client: Optional[AsyncOpenAI] = None


class LLMCallError(RuntimeError):
    """Raised when strict LLM generation cannot complete."""


def get_llm_client() -> Optional[AsyncOpenAI]:
    global _llm_client
    api_key = os.getenv("ASI1_API_KEY", "")
    if not api_key:
        return None
    if _llm_client is None:
        _llm_client = AsyncOpenAI(
            base_url="https://api.asi1.ai/v1",
            api_key=api_key,
        )
    return _llm_client


async def generate_text(
    system_prompt: str,
    user_prompt: str,
    fallback: str = "",
    *,
    max_tokens: int = 120,
    temperature: float = 0.8,
    strict: bool = False,
) -> str:
    client = get_llm_client()
    if client is None:
        if strict:
            raise LLMCallError("LLM client unavailable (ASI1_API_KEY missing).")
        return fallback
    try:
        response = await client.chat.completions.create(
            model="asi1",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=max_tokens,
            temperature=temperature,
        )
        text = (response.choices[0].message.content or "").strip()
        if text:
            return text
        if strict:
            raise LLMCallError("LLM returned an empty response.")
        return fallback
    except LLMCallError:
        raise
    except Exception as exc:
        if strict:
            raise LLMCallError(str(exc)) from exc
        logger.warning("LLM call failed, using fallback: %s", exc)
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
