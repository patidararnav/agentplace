"""
Vendor agent for the agentplace negotiation marketplace.

Exports:
    vendor_floor_price()    – minimum acceptable price
    vendor_opening_price()  – first offer for a service request
    vendor_revised_price()  – revised price after a customer counter
    create_vendor_agent()   – factory returning a fully-wired Agent

Run standalone:  python vendor.py   (reads config from .env)
"""

import json
import math
import os
import random
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set
from urllib.parse import unquote

from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    chat_protocol_spec,
)
from uagents_core.contrib.protocols.payment import (
    CancelPayment,
    CommitPayment,
    CompletePayment,
    Funds,
    RejectPayment,
    RequestPayment,
    payment_protocol_spec,
)

from chat_utils import (
    extract_price,
    extract_text,
    generate_text,
    make_chat_message,
    parse_fields,
    services_from_csv,
)
from db_helpers import update_job_status
from payment_agent import (
    ACCEPTED_FUNDS,
    FET_FUNDS,
    TriggerRequestPayment,
    verify_fet_payment_to_agent,
)


# ─── Pricing Logic (pure, importable) ────────────────────────────────────


PRICING_STRATEGY_MAXIMIZE_JOBS = "maximize_jobs"
PRICING_STRATEGY_HIGH_VALUE_ONLY = "high_value_only"
PRICING_STRATEGY_YIELD_OPTIMIZER = "yield_optimizer"
DEFAULT_PRICING_STRATEGY = PRICING_STRATEGY_MAXIMIZE_JOBS

_PRICING_STRATEGY_ALIASES = {
    "1": PRICING_STRATEGY_MAXIMIZE_JOBS,
    "maximize_jobs": PRICING_STRATEGY_MAXIMIZE_JOBS,
    "maximize_number_of_jobs": PRICING_STRATEGY_MAXIMIZE_JOBS,
    "max_jobs": PRICING_STRATEGY_MAXIMIZE_JOBS,
    "2": PRICING_STRATEGY_HIGH_VALUE_ONLY,
    "high_value_only": PRICING_STRATEGY_HIGH_VALUE_ONLY,
    "high_value_jobs_only": PRICING_STRATEGY_HIGH_VALUE_ONLY,
    "aggressive": PRICING_STRATEGY_HIGH_VALUE_ONLY,
    "3": PRICING_STRATEGY_YIELD_OPTIMIZER,
    "yield_optimizer": PRICING_STRATEGY_YIELD_OPTIMIZER,
    "yield_optimization": PRICING_STRATEGY_YIELD_OPTIMIZER,
}

def _normalize_service_label(raw: Any) -> str:
    return str(raw or "").strip().lower()


def _normalize_services(services: List[str]) -> Set[str]:
    return {svc for svc in (_normalize_service_label(s) for s in services) if svc}


def _normalize_base_prices(raw: Dict[str, int]) -> Dict[str, int]:
    normalized: Dict[str, int] = {}
    for key, val in raw.items():
        svc = _normalize_service_label(key)
        if not svc:
            continue
        try:
            price = int(val)
        except (TypeError, ValueError):
            continue
        normalized[svc] = price
    return normalized


def normalize_pricing_strategy(strategy: Optional[str]) -> str:
    """Normalize a pricing-strategy string to one of the supported constants."""
    token = (
        str(strategy or "")
        .strip()
        .lower()
        .replace("-", "_")
        .replace(" ", "_")
    )
    return _PRICING_STRATEGY_ALIASES.get(token, DEFAULT_PRICING_STRATEGY)


def _base_price_for_service(base_prices: Dict[str, int], service: str) -> int:
    return int(base_prices.get(service, next(iter(base_prices.values()), 150)))


def _strategy_floor_scale(strategy: str) -> float:
    if strategy == PRICING_STRATEGY_MAXIMIZE_JOBS:
        return 0.94
    if strategy == PRICING_STRATEGY_HIGH_VALUE_ONLY:
        return 1.14
    return 1.0


def _strategy_opening_shift(strategy: str) -> float:
    if strategy == PRICING_STRATEGY_MAXIMIZE_JOBS:
        return -0.06
    if strategy == PRICING_STRATEGY_HIGH_VALUE_ONLY:
        return 0.11
    return 0.0


def _strategy_concession_scale(strategy: str) -> float:
    if strategy == PRICING_STRATEGY_MAXIMIZE_JOBS:
        return 1.25
    if strategy == PRICING_STRATEGY_HIGH_VALUE_ONLY:
        return 0.62
    return 1.0


def _yield_discount_from_free_ratio(free_ratio: float) -> float:
    """
    Return a pricing discount for the yield optimizer.

    No discount below 80% free capacity; linearly scales up to 12% at 100% free.
    """
    if free_ratio <= 0.8:
        return 0.0
    return min(0.12, ((free_ratio - 0.8) / 0.2) * 0.12)


def vendor_floor_price(
    base_prices: Dict[str, int],
    aggression: int,
    service: str,
    urgency: int,
    strategy: str = DEFAULT_PRICING_STRATEGY,
    yield_discount: float = 0.0,
) -> int:
    """Minimum price the vendor will accept."""
    strategy = normalize_pricing_strategy(strategy)
    base = _base_price_for_service(base_prices, service)
    effective_base = max(1, int(base * (1 - max(0.0, min(0.25, yield_discount)))))
    urgency_markup = max(0, urgency - 3) * 0.1
    discount = {1: 0.12, 2: 0.08, 3: 0.04, 4: 0.02, 5: 0.0}[aggression]
    floor = effective_base * (1 + urgency_markup) * (1 - discount)
    floor *= _strategy_floor_scale(strategy)
    return max(1, int(floor))


def vendor_opening_price(
    base_prices: Dict[str, int],
    aggression: int,
    service: str,
    urgency: int,
    strategy: str = DEFAULT_PRICING_STRATEGY,
    yield_discount: float = 0.0,
) -> int:
    """Opening offer for a service request."""
    strategy = normalize_pricing_strategy(strategy)
    base = _base_price_for_service(base_prices, service)
    effective_base = max(1, int(base * (1 - max(0.0, min(0.25, yield_discount)))))
    markup = {1: 0.04, 2: 0.08, 3: 0.14, 4: 0.2, 5: 0.28}[aggression]
    markup += _strategy_opening_shift(strategy)
    if strategy == PRICING_STRATEGY_YIELD_OPTIMIZER and yield_discount > 0:
        markup -= min(0.1, yield_discount + 0.02)
    markup = max(-0.05, markup)
    urgency_markup = max(0, urgency - 3) * 0.1
    floor = vendor_floor_price(
        base_prices,
        aggression,
        service,
        urgency,
        strategy=strategy,
        yield_discount=yield_discount,
    )
    return max(
        floor,
        int(effective_base * (1 + markup + urgency_markup)) + random.randint(-4, 8),
    )


def vendor_revised_price(
    aggression: int,
    current: int,
    customer_price: int,
    floor: int,
    strategy: str = DEFAULT_PRICING_STRATEGY,
    yield_discount: float = 0.0,
) -> int:
    """Revised price after a customer counter-offer."""
    strategy = normalize_pricing_strategy(strategy)
    concession = {1: 0.58, 2: 0.46, 3: 0.34, 4: 0.22, 5: 0.14}[aggression]
    concession *= _strategy_concession_scale(strategy)
    if strategy == PRICING_STRATEGY_YIELD_OPTIMIZER and yield_discount > 0:
        concession += min(0.2, yield_discount * 1.6)
    concession = max(0.08, min(0.9, concession))
    spread = max(0, current - customer_price)
    move = max(1, int(spread * concession))
    return max(floor, current - move + random.randint(-2, 2))


def _parse_customer_dates_from_notes(notes: str) -> List[str]:
    """Extract YYYY-MM-DD dates from the CUSTOMER_AVAILABILITY_NEXT_7_DAYS section."""
    if not notes:
        return []
    in_section = False
    dates: List[str] = []
    for raw_line in notes.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if "CUSTOMER_AVAILABILITY_NEXT_7_DAYS" in line:
            in_section = True
            continue
        if not in_section:
            continue
        m = re.match(r"^(\d{4}-\d{2}-\d{2})\s*:", line)
        if m:
            dates.append(m.group(1))
    return sorted(set(dates))


def _hhmm_to_minutes(raw: Any) -> Optional[int]:
    if not isinstance(raw, str):
        return None
    text = raw.strip()
    if not text:
        return None
    parts = text.split(":", 1)
    if len(parts) != 2:
        return None
    try:
        hour = int(parts[0])
        minute = int(parts[1])
    except ValueError:
        return None
    if hour < 0 or hour > 23 or minute < 0 or minute > 59:
        return None
    return hour * 60 + minute


def _slot_to_minutes(slot: str) -> int:
    if "-" not in slot:
        return 0
    start_raw, end_raw = slot.split("-", 1)
    start = _hhmm_to_minutes(start_raw)
    end = _hhmm_to_minutes(end_raw)
    if start is None or end is None or end <= start:
        return 0
    return end - start


def _expand_day_slots(raw: Any) -> List[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        return [raw]
    if not isinstance(raw, list):
        return []
    # Common storage shape in this project: ["09:00","17:00"].
    if (
        len(raw) == 2
        and all(isinstance(x, str) for x in raw)
        and "-" not in raw[0]
        and "-" not in raw[1]
    ):
        return [f"{raw[0]}-{raw[1]}"]

    out: List[str] = []
    for item in raw:
        if isinstance(item, str):
            out.append(item)
        elif isinstance(item, list) and len(item) == 2:
            out.append(f"{item[0]}-{item[1]}")
    return out


def _available_minutes_for_weekday(
    weekly_availability: Dict[str, Any],
    weekday_name: str,
) -> int:
    # Accept lowercase ("monday"), title case ("Monday"), or uppercase.
    day_raw = (
        weekly_availability.get(weekday_name)
        if isinstance(weekly_availability, dict)
        else None
    )
    if day_raw is None and isinstance(weekly_availability, dict):
        day_raw = (
            weekly_availability.get(weekday_name.title())
            or weekly_availability.get(weekday_name.upper())
        )
    slots = _expand_day_slots(day_raw)
    return sum(_slot_to_minutes(slot) for slot in slots)


def _load_booked_minutes_by_date(vendor_id: int, dates: List[str]) -> Dict[str, int]:
    """Load scheduled minutes for a vendor keyed by YYYY-MM-DD."""
    if vendor_id <= 0 or not dates:
        return {d: 0 for d in dates}

    wanted = set(dates)
    totals = {d: 0 for d in dates}
    try:
        from supabase_client import TABLE_JOBS, get_supabase

        sb = get_supabase()
        result = (
            sb.table(TABLE_JOBS)
            .select("date, duration_minutes")
            .eq("vendor_id", vendor_id)
            .execute()
        )
        for row in result.data or []:
            job_date = str(row.get("date") or "")
            if job_date not in wanted:
                continue
            try:
                minutes = int(row.get("duration_minutes") or 0)
            except (TypeError, ValueError):
                continue
            if minutes > 0:
                totals[job_date] += minutes
    except Exception:
        return totals

    return totals


def _compute_yield_discount(
    *,
    notes: str,
    weekly_availability: Dict[str, Any],
    vendor_id: int,
) -> tuple[float, Optional[float]]:
    """Return (discount, free_ratio) for yield optimization based on customer dates."""
    dates = _parse_customer_dates_from_notes(notes)
    if not dates:
        return 0.0, None

    booked_by_date = _load_booked_minutes_by_date(vendor_id, dates)
    best_free_ratio: Optional[float] = None

    for date_str in dates:
        try:
            weekday = datetime.strptime(date_str, "%Y-%m-%d").strftime("%A").lower()
        except ValueError:
            continue
        available_minutes = _available_minutes_for_weekday(weekly_availability, weekday)
        if available_minutes <= 0:
            continue
        booked_minutes = max(0, int(booked_by_date.get(date_str, 0)))
        free_ratio = max(0.0, min(1.0, (available_minutes - booked_minutes) / available_minutes))
        if best_free_ratio is None or free_ratio > best_free_ratio:
            best_free_ratio = free_ratio

    if best_free_ratio is None:
        return 0.0, None
    return _yield_discount_from_free_ratio(best_free_ratio), best_free_ratio


def _parse_iso_datetime(raw: str) -> Optional[datetime]:
    text = str(raw or "").strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def _days_ahead(start_iso: str) -> float:
    dt = _parse_iso_datetime(start_iso)
    if dt is None:
        return 0.0
    now = datetime.now(dt.tzinfo) if dt.tzinfo else datetime.now()
    return max(0.0, min(7.0, (dt - now).total_seconds() / 86400.0))


def _offer_id(start_iso: str, end_iso: str) -> str:
    return f"{start_iso}|{end_iso}"


def _parse_candidate_slots(raw: str) -> List[Dict[str, Any]]:
    if not raw:
        return []
    try:
        parsed = json.loads(raw)
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    out: List[Dict[str, Any]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        start_iso = str(item.get("start_iso") or "").strip()
        end_iso = str(item.get("end_iso") or "").strip()
        start_dt = _parse_iso_datetime(start_iso)
        end_dt = _parse_iso_datetime(end_iso)
        if start_dt is None or end_dt is None or end_dt <= start_dt:
            continue
        try:
            priority = int(item.get("priority") or 1)
        except (TypeError, ValueError):
            priority = 1
        try:
            load_ratio = float(item.get("load_ratio") or 0.0)
        except (TypeError, ValueError):
            load_ratio = 0.0
        try:
            days = float(item.get("days_ahead") or _days_ahead(start_iso))
        except (TypeError, ValueError):
            days = _days_ahead(start_iso)

        out.append({
            "slot_id": str(item.get("slot_id") or _offer_id(start_iso, end_iso)),
            "start_iso": start_iso,
            "end_iso": end_iso,
            "priority": max(1, min(5, priority)),
            "hard_constraint": bool(item.get("hard_constraint", False)),
            "load_ratio": max(0.0, min(1.5, load_ratio)),
            "days_ahead": max(0.0, min(7.0, days)),
        })
    return out


def _slot_opening_price(
    *,
    base_prices: Dict[str, int],
    aggression: int,
    service: str,
    urgency: int,
    strategy: str,
    days_ahead: float,
    load_ratio: float,
) -> int:
    # Base opening curve from existing strategy logic.
    opening = vendor_opening_price(
        base_prices,
        aggression,
        service,
        urgency,
        strategy=strategy,
        yield_discount=0.0,
    )
    floor = vendor_floor_price(
        base_prices,
        aggression,
        service,
        urgency,
        strategy=strategy,
        yield_discount=0.0,
    )

    u = max(0.0, min(1.0, (urgency - 1) / 4.0))
    d = max(0.0, min(7.0, float(days_ahead)))
    load = max(0.0, min(1.5, float(load_ratio)))

    # Near-term urgent work carries a premium; low-urgency future slots discount.
    lead_factor = 1.0 + (0.20 * u * math.exp(-d / 2.0)) - (0.12 * (1.0 - u) * (d / 7.0))
    occupancy_factor = 0.82 + (0.50 * min(1.0, load))
    if strategy == PRICING_STRATEGY_YIELD_OPTIMIZER:
        occupancy_factor -= 0.08 * max(0.0, 1.0 - min(1.0, load))
    factor = max(0.65, lead_factor * occupancy_factor)
    return max(floor, int(opening * factor))


def _slot_revised_price(
    *,
    aggression: int,
    current_price: int,
    customer_price: int,
    floor_price: int,
    strategy: str,
    days_ahead: float,
    urgency: int,
) -> int:
    revised = vendor_revised_price(
        aggression,
        current_price,
        customer_price,
        floor_price,
        strategy=strategy,
        yield_discount=0.0,
    )
    u = max(0.0, min(1.0, (urgency - 1) / 4.0))
    d = max(0.0, min(7.0, float(days_ahead)))
    premium = 1.0 + (0.04 * max(0.0, u - 0.5) * math.exp(-d / 2.0))
    revised = max(floor_price, int(revised * premium))
    if customer_price >= floor_price and customer_price >= int(revised * 0.98):
        return max(floor_price, customer_price)
    return revised


def _rank_offers_for_strategy(strategy: str, offers: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    if strategy == PRICING_STRATEGY_HIGH_VALUE_ONLY:
        return sorted(
            offers,
            key=lambda o: (-int(o.get("price", 0)), -int(o.get("priority", 1))),
        )
    if strategy == PRICING_STRATEGY_YIELD_OPTIMIZER:
        return sorted(
            offers,
            key=lambda o: (float(o.get("load_ratio", 0.0)), int(o.get("price", 0))),
        )
    return sorted(
        offers,
        key=lambda o: (int(o.get("price", 0)), -int(o.get("priority", 1))),
    )


def _diverse_shortlist_for_negotiation(
    *,
    strategy: str,
    offers: List[Dict[str, Any]],
    max_items: int = 3,
) -> List[Dict[str, Any]]:
    if not offers:
        return []

    ranked = _rank_offers_for_strategy(strategy, offers)
    if len(ranked) <= max_items:
        return ranked

    earliest = min(ranked, key=lambda o: str(o.get("start_iso", "")))
    latest = max(ranked, key=lambda o: str(o.get("start_iso", "")))
    preferred = ranked[0]

    picked: List[Dict[str, Any]] = []
    seen: Set[str] = set()

    def _add(offer: Dict[str, Any]) -> None:
        oid = str(offer.get("offer_id", ""))
        if oid in seen:
            return
        seen.add(oid)
        picked.append(offer)

    # Always include a strategy-best quote plus near/far time alternatives.
    _add(preferred)
    _add(earliest)
    _add(latest)

    for offer in ranked:
        if len(picked) >= max_items:
            break
        _add(offer)

    return picked[:max_items]


_SENSITIVE_VENDOR_PATTERNS = [
    re.compile(
        r"\b(min(?:imum)?|lowest|floor|final|best)\s+(?:price|offer)\b",
        flags=re.IGNORECASE,
    ),
    re.compile(
        r"\b(can(?:not|'t)\s+go\s+lower|won't\s+go\s+lower)\b",
        flags=re.IGNORECASE,
    ),
]


def _slot_phrase(start_iso: str, end_iso: str) -> str:
    start = str(start_iso or "").strip()
    end = str(end_iso or "").strip()
    if start and end:
        return f"{start} to {end}"
    if start:
        return start
    return "the proposed time slot"


def _contains_sensitive_vendor_disclosure(text: str) -> bool:
    t = str(text or "")
    return any(p.search(t) for p in _SENSITIVE_VENDOR_PATTERNS)


def _sanitize_vendor_utterance(text: str, fallback: str) -> str:
    t = str(text or "").strip()
    if not t or _contains_sensitive_vendor_disclosure(t) or "$" not in t:
        return fallback
    return t


# ─── Agent Factory ───────────────────────────────────────────────────────


def create_vendor_agent(
    *,
    name: str,
    seed: str,
    services: List[str],
    base_prices: Dict[str, int],
    aggression: int,
    orchestrator_address: str,
    port: Optional[int] = None,
    mailbox: bool = False,
    network: Optional[str] = None,
    readme_path: Optional[str] = None,
    publish_agent_details: bool = False,
    registration_policy: Optional[Any] = None,
    weekly_availability: Optional[Dict[str, Any]] = None,
    pricing_strategy: str = DEFAULT_PRICING_STRATEGY,
    vendor_id: int = 0,
    resolve: Optional[Any] = None,
) -> Agent:
    """Return a fully-wired vendor Agent ready to run or add to a Bureau."""

    strategy = normalize_pricing_strategy(pricing_strategy)
    supported = _normalize_services(services)
    if not supported:
        supported = {"plumbing"}
    base_prices = _normalize_base_prices(base_prices)
    for svc in supported:
        if int(base_prices.get(svc, 0)) <= 0:
            base_prices[svc] = 150

    kwargs: Dict[str, Any] = {"name": name.lower().replace(" ", "-"), "seed": seed}
    if port is not None:
        kwargs["port"] = port
        # Provide an explicit endpoint so the agent registers on the Almanac
        # and is reachable by other agents (needed when mailbox=False).
        kwargs["endpoint"] = [f"http://127.0.0.1:{port}/submit"]
    if mailbox:
        kwargs["mailbox"] = True
    if network:
        kwargs["network"] = network
    if readme_path:
        kwargs["readme_path"] = readme_path
    if publish_agent_details:
        kwargs["publish_agent_details"] = True
        kwargs["metadata"] = {
            "role": "vendor",
            "category": "home_services",
            "services": ",".join(sorted(supported)),
            "aggression": str(aggression),
            "pricing_strategy": strategy,
            "protocol": "chat",
        }

    if registration_policy is not None:
        kwargs["registration_policy"] = registration_policy
    if resolve is not None:
        kwargs["resolve"] = resolve

    agent = Agent(**kwargs)
    _weekly_availability = weekly_availability or {}
    deal_state: Dict[str, Dict[str, Any]] = {}

    # ── LLM text generation ──

    sys_prompt = (
        f"You are {name}, a professional {', '.join(sorted(supported))} service vendor. "
        f"Your negotiation style is {aggression}/5 (1 = very flexible, 5 = very firm). "
        f"Your pricing strategy is '{strategy}'. "
        "Write brief, natural responses (1-3 sentences). You MUST mention the exact dollar "
        "amount given to you. Keep pricing thresholds private: never reveal minimum/floor/final/best "
        "offer language. Mention the agreed time slot in your response. "
        "Do NOT include any KEY=VALUE lines — write like a real person."
    )

    async def _opening_text(svc: str, offer: int, start_iso: str, end_iso: str) -> str:
        when = _slot_phrase(start_iso, end_iso)
        fallback = f"I can handle the {svc} job at ${offer} for {when}."
        raw = await generate_text(
            sys_prompt,
            f"Write a friendly opening quote for a {svc} job at ${offer} for {when}. "
            "Mention what you bring to the table briefly and include the time slot.",
            fallback,
        )
        return _sanitize_vendor_utterance(raw, fallback)

    async def _counter_text(
        offer: int,
        customer_offer: int,
        svc: str,
        start_iso: str,
        end_iso: str,
    ) -> str:
        when = _slot_phrase(start_iso, end_iso)
        if customer_offer >= offer:
            fallback = f"That works. I can do ${offer} for the {svc} job at {when}."
            raw = await generate_text(
                sys_prompt,
                f"The customer offered ${customer_offer} and you accept at ${offer} for {svc} at {when}. "
                "Write a brief, warm acceptance and include the slot.",
                fallback,
            )
            return _sanitize_vendor_utterance(raw, fallback)
        fallback = f"I appreciate the counter. I can do ${offer} for the {svc} job at {when}."
        raw = await generate_text(
            sys_prompt,
            f"The customer countered at ${customer_offer}. Your revised offer is ${offer} "
            f"for {svc} at {when}. Write a brief, professional counter-offer and include the slot.",
            fallback,
        )
        return _sanitize_vendor_utterance(raw, fallback)

    def _registration_text() -> str:
        lines = [
            "TYPE=vendor_register",
            f"VENDOR={agent.address}",
            f"NAME={name}",
            f"VENDOR_ID={vendor_id}",
            f"SERVICES={','.join(sorted(supported))}",
            f"AGGRESSION={aggression}",
            f"STRATEGY={strategy}",
            f"WEEKLY_AVAILABILITY={json.dumps(_weekly_availability)}",
            "NOTE=Vendor ready for natural-language chat negotiation.",
        ]
        if vendor_id > 0:
            lines.append(f"VENDOR_ID={vendor_id}")
        return "\n".join(lines)

    # ── Protocol handlers ──

    chat_proto = Protocol(spec=chat_protocol_spec)

    @agent.on_event("startup")
    async def on_startup(ctx: Context) -> None:
        ctx.logger.info("Vendor ready: %s  address=%s", name, agent.address)
        if not os.getenv("AGENTVERSE_KEY") and mailbox:
            ctx.logger.warning("AGENTVERSE_KEY is not set.")
        await ctx.send(orchestrator_address, make_chat_message(_registration_text()))

    @agent.on_interval(period=45.0)
    async def refresh_registration(ctx: Context) -> None:
        await ctx.send(orchestrator_address, make_chat_message(_registration_text()))

    @chat_proto.on_message(model=ChatMessage)
    async def handle_chat(ctx: Context, sender: str, msg: ChatMessage) -> None:
        text = extract_text(msg)
        fields = parse_fields(text)
        await ctx.send(
            sender,
            ChatAcknowledgement(
                timestamp=datetime.now(timezone.utc),
                acknowledged_msg_id=msg.msg_id,
            ),
        )

        mt = fields.get("TYPE", "").lower()
        rid = fields.get("RID", "")

        if sender == orchestrator_address and mt == "request" and rid:
            svc = fields.get("PRICING_KEY", "").strip().lower()
            if not svc:
                svc = fields.get("SERVICE", "").strip().lower()
            urg = int(fields.get("URGENCY", "3")) if fields.get("URGENCY", "").isdigit() else 3
            dur = int(fields.get("DURATION_MINUTES", "60")) if fields.get("DURATION_MINUTES", "").isdigit() else 60
            if dur <= 0:
                dur = 60
            notes = fields.get("NOTES", "")
            notes_urlenc = fields.get("NOTES_URLENC", "")
            if notes_urlenc:
                try:
                    notes = unquote(notes_urlenc)
                except Exception:
                    pass

            if not svc:
                svc = sorted(supported)[0]
            if svc not in base_prices:
                fallback_svc = sorted(supported)[0]
                ctx.logger.info(
                    "Using fallback pricing key for %s  rid=%s  requested=%r  fallback=%r",
                    name,
                    rid,
                    svc,
                    fallback_svc,
                )
                svc = fallback_svc

            slots = _parse_candidate_slots(fields.get("CANDIDATE_SLOTS_JSON", ""))
            if not slots:
                await ctx.send(sender, make_chat_message("\n".join([
                    "TYPE=vendor_unavailable",
                    f"RID={rid}",
                    f"VENDOR={agent.address}",
                    "TEXT=No feasible schedule slots were provided.",
                ])))
                return

            offers: List[Dict[str, Any]] = []
            for slot in slots:
                price = _slot_opening_price(
                    base_prices=base_prices,
                    aggression=aggression,
                    service=svc,
                    urgency=urg,
                    strategy=strategy,
                    days_ahead=float(slot.get("days_ahead") or 0.0),
                    load_ratio=float(slot.get("load_ratio") or 0.0),
                )
                offers.append({
                    "offer_id": _offer_id(str(slot.get("start_iso", "")), str(slot.get("end_iso", ""))),
                    "price": price,
                    "start_iso": str(slot.get("start_iso", "")),
                    "end_iso": str(slot.get("end_iso", "")),
                    "priority": int(slot.get("priority", 1)),
                    "load_ratio": float(slot.get("load_ratio", 0.0)),
                    "days_ahead": float(slot.get("days_ahead", 0.0)),
                })

            shortlisted = _diverse_shortlist_for_negotiation(
                strategy=strategy,
                offers=offers,
                max_items=min(3, len(offers)),
            )
            selected = shortlisted[0]
            deal_state[rid] = {
                "service": svc,
                "urgency": urg,
                "duration_minutes": dur,
                "slots": slots,
                "last_offer": int(selected["price"]),
                "last_offer_id": str(selected["offer_id"]),
                "last_offer_start_iso": str(selected["start_iso"]),
                "last_offer_end_iso": str(selected["end_iso"]),
            }
            body = await _opening_text(
                svc,
                int(selected["price"]),
                str(selected.get("start_iso", "")),
                str(selected.get("end_iso", "")),
            )
            await ctx.send(sender, make_chat_message("\n".join([
                "TYPE=vendor_offer",
                f"RID={rid}",
                f"VENDOR={agent.address}",
                f"OFFER_ID={selected['offer_id']}",
                f"PRICE={int(selected['price'])}",
                f"START_ISO={selected['start_iso']}",
                f"END_ISO={selected['end_iso']}",
                f"OFFERS_JSON={json.dumps(shortlisted, separators=(',', ':'))}",
                f"TEXT={body}",
            ])))
            return

        if sender == orchestrator_address and mt == "customer_counter" and rid:
            st = deal_state.get(rid)
            if not st:
                return
            svc = str(st["service"])
            urg = int(st["urgency"])
            cur = int(st["last_offer"])
            action = fields.get("ACTION", "counter").strip().lower()
            if action != "counter":
                return

            cp = int(fields["PRICE"]) if fields.get("PRICE", "").isdigit() else extract_price(text)
            desired_start = fields.get("START_ISO", "") or str(st.get("last_offer_start_iso") or "")
            desired_end = fields.get("END_ISO", "") or str(st.get("last_offer_end_iso") or "")
            desired_id = fields.get("OFFER_ID", "") or _offer_id(desired_start, desired_end)

            slots: List[Dict[str, Any]] = st.get("slots", [])
            chosen_slot = next(
                (
                    s for s in slots
                    if str(s.get("start_iso")) == desired_start
                    and str(s.get("end_iso")) == desired_end
                ),
                None,
            )
            if chosen_slot is None:
                chosen_slot = next(
                    (s for s in slots if _offer_id(str(s.get("start_iso", "")), str(s.get("end_iso", ""))) == desired_id),
                    None,
                )
            if chosen_slot is None and slots:
                chosen_slot = slots[0]
            if chosen_slot is None:
                await ctx.send(sender, make_chat_message("\n".join([
                    "TYPE=vendor_unavailable",
                    f"RID={rid}",
                    f"VENDOR={agent.address}",
                    "TEXT=No feasible slots remain.",
                ])))
                return

            slot_start = str(chosen_slot.get("start_iso") or "")
            slot_end = str(chosen_slot.get("end_iso") or "")
            days = float(chosen_slot.get("days_ahead") or _days_ahead(slot_start))
            load_ratio = float(chosen_slot.get("load_ratio") or 0.0)

            floor = vendor_floor_price(
                base_prices,
                aggression,
                svc,
                urg,
                strategy=strategy,
                yield_discount=0.0,
            )
            slot_open = _slot_opening_price(
                base_prices=base_prices,
                aggression=aggression,
                service=svc,
                urgency=urg,
                strategy=strategy,
                days_ahead=days,
                load_ratio=load_ratio,
            )
            current_for_slot = max(cur, slot_open)
            if cp <= 0:
                cp = max(1, int(current_for_slot * 0.9))

            new = _slot_revised_price(
                aggression=aggression,
                current_price=current_for_slot,
                customer_price=cp,
                floor_price=floor,
                strategy=strategy,
                days_ahead=days,
                urgency=urg,
            )

            # Keep one or two alternative offers for context.
            alt_offers: List[Dict[str, Any]] = []
            for s in slots:
                sid = _offer_id(str(s.get("start_iso", "")), str(s.get("end_iso", "")))
                if sid == _offer_id(slot_start, slot_end):
                    continue
                p = _slot_opening_price(
                    base_prices=base_prices,
                    aggression=aggression,
                    service=svc,
                    urgency=urg,
                    strategy=strategy,
                    days_ahead=float(s.get("days_ahead") or _days_ahead(str(s.get("start_iso", "")))),
                    load_ratio=float(s.get("load_ratio") or 0.0),
                )
                alt_offers.append({
                    "offer_id": sid,
                    "price": p,
                    "start_iso": str(s.get("start_iso", "")),
                    "end_iso": str(s.get("end_iso", "")),
                    "priority": int(s.get("priority", 1)),
                    "load_ratio": float(s.get("load_ratio", 0.0)),
                    "days_ahead": float(s.get("days_ahead", 0.0)),
                })

            selected_offer = {
                "offer_id": _offer_id(slot_start, slot_end),
                "price": int(new),
                "start_iso": slot_start,
                "end_iso": slot_end,
                "priority": int(chosen_slot.get("priority", 1)),
                "load_ratio": load_ratio,
                "days_ahead": days,
            }
            ranked_alt = _rank_offers_for_strategy(strategy, alt_offers)[:2]
            outgoing_offers = [selected_offer, *ranked_alt]

            st["last_offer"] = int(new)
            st["last_offer_id"] = selected_offer["offer_id"]
            st["last_offer_start_iso"] = slot_start
            st["last_offer_end_iso"] = slot_end

            body = await _counter_text(int(new), cp, svc, slot_start, slot_end)
            await ctx.send(sender, make_chat_message("\n".join([
                "TYPE=vendor_offer",
                f"RID={rid}",
                f"VENDOR={agent.address}",
                f"OFFER_ID={selected_offer['offer_id']}",
                f"PRICE={int(new)}",
                f"START_ISO={slot_start}",
                f"END_ISO={slot_end}",
                f"OFFERS_JSON={json.dumps(outgoing_offers, separators=(',', ':'))}",
                f"TEXT={body}",
            ])))
            return

        # Legacy fallback (price-only flow)
        if sender == orchestrator_address and mt == "request" and rid:
            svc = fields.get("PRICING_KEY", "").strip().lower()
            if not svc:
                svc = fields.get("SERVICE", "").strip().lower()
            urg = int(fields.get("URGENCY", "3")) if fields.get("URGENCY", "").isdigit() else 3
            if not svc:
                svc = sorted(supported)[0]
            if svc not in base_prices:
                svc = sorted(supported)[0]
            offer = vendor_opening_price(
                base_prices,
                aggression,
                svc,
                urg,
                strategy=strategy,
                yield_discount=0.0,
            )
            deal_state[rid] = {
                "service": svc,
                "urgency": urg,
                "last_offer": offer,
                "last_offer_id": "legacy",
                "last_offer_start_iso": "",
                "last_offer_end_iso": "",
                "slots": [],
            }
            body = await _opening_text(svc, offer, "", "")
            await ctx.send(sender, make_chat_message("\n".join([
                "TYPE=vendor_message", f"RID={rid}",
                f"VENDOR={agent.address}", f"PRICE={offer}", f"TEXT={body}",
            ])))
            return

        if sender == orchestrator_address and mt == "customer_message" and rid:
            st = deal_state.get(rid)
            if not st:
                return
            svc, urg, cur = str(st["service"]), int(st["urgency"]), int(st["last_offer"])
            cp = int(fields["PRICE"]) if fields.get("PRICE", "").isdigit() else extract_price(text)
            if cp <= 0:
                cp = max(1, int(cur * 0.9))
            floor = vendor_floor_price(
                base_prices,
                aggression,
                svc,
                urg,
                strategy=strategy,
                yield_discount=0.0,
            )
            new = vendor_revised_price(
                aggression,
                cur,
                cp,
                floor,
                strategy=strategy,
                yield_discount=0.0,
            )
            st["last_offer"] = new
            body = await _counter_text(new, cp, svc, "", "")
            await ctx.send(sender, make_chat_message("\n".join([
                "TYPE=vendor_message", f"RID={rid}",
                f"VENDOR={agent.address}", f"PRICE={new}", f"TEXT={body}",
            ])))
            return

        if sender == orchestrator_address and mt == "deal_closed" and rid:
            ctx.logger.info("Deal closed RID=%s: %s", rid, fields.get("TEXT", ""))
            deal_state.pop(rid, None)
            return

        if sender == orchestrator_address and mt == "terminated" and rid:
            ctx.logger.info("Terminated RID=%s: %s", rid, fields.get("TEXT", ""))
            deal_state.pop(rid, None)

    @chat_proto.on_message(model=ChatAcknowledgement)
    async def handle_ack(ctx: Context, sender: str, msg: ChatAcknowledgement) -> None:
        pass

    # ── Payment protocol (seller role — vendor requests and accepts payment) ──

    payment_proto = Protocol(spec=payment_protocol_spec, role="seller")
    trigger_proto = Protocol(name="AgentPlacePaymentTrigger", version="0.1.0")

    @trigger_proto.on_message(TriggerRequestPayment)
    async def handle_trigger_request_payment(ctx: Context, sender: str, msg: TriggerRequestPayment) -> None:
        """API (buyer) asks this vendor to send RequestPayment to the buyer agent."""
        buyer_address = sender
        description = msg.description or f"AgentPlace job #{msg.job_id}"
        recipient = (msg.recipient_address or "").strip() or str(agent.wallet.address())
        req = RequestPayment(
            accepted_funds=ACCEPTED_FUNDS,
            recipient=recipient,
            deadline_seconds=300,
            reference=str(msg.job_id),
            description=description,
            metadata={},
        )
        await ctx.send(buyer_address, req)
        ctx.logger.info(
            "[seller] Sent RequestPayment to buyer %s for job %s (recipient=%s)",
            buyer_address[:20] + "…", msg.job_id, recipient[:20] + "…" if recipient else "?",
        )

    @payment_proto.on_message(CommitPayment)
    async def handle_commit_payment(ctx: Context, sender: str, msg: CommitPayment) -> None:
        """Buyer submitted payment — verify on-chain and send CompletePayment or CancelPayment."""
        job_id_str = (msg.reference or "").strip()
        if not job_id_str or not job_id_str.isdigit():
            ctx.logger.error("CommitPayment missing or invalid reference (job_id): %s", msg.reference)
            await ctx.send(
                sender,
                CancelPayment(transaction_id=msg.transaction_id, reason="Missing job reference"),
            )
            return

        job_id = int(job_id_str)
        payment_verified = False

        if msg.funds.payment_method == "fet_direct" and msg.funds.currency == "FET":
            buyer_fet = None
            expected_recipient = None
            if isinstance(msg.metadata, dict):
                buyer_fet = msg.metadata.get("buyer_fet_wallet") or msg.metadata.get("buyer_fet_address")
                expected_recipient = msg.metadata.get("expected_recipient") or msg.metadata.get("expected_recipient_address")
            if not expected_recipient:
                expected_recipient = str(agent.wallet.address())
            if not buyer_fet:
                ctx.logger.error("Missing buyer_fet_wallet in metadata")
            else:
                payment_verified = verify_fet_payment_to_agent(
                    transaction_id=msg.transaction_id,
                    expected_amount_fet=FET_FUNDS.amount,
                    sender_fet_address=str(buyer_fet),
                    expected_recipient_address=expected_recipient,
                    logger=ctx.logger,
                )

        if payment_verified:
            update_job_status(job_id, 8)  # Payment sent
            update_job_status(job_id, 9)  # Payment received
            ctx.logger.info("[seller] Job %s payment verified; status → 8 → 9", job_id)
            await ctx.send(sender, CompletePayment(transaction_id=msg.transaction_id))
        else:
            ctx.logger.warning("[seller] Job %s payment verification failed", job_id)
            await ctx.send(
                sender,
                CancelPayment(
                    transaction_id=msg.transaction_id,
                    reason="Payment verification failed",
                ),
            )

    @payment_proto.on_message(RejectPayment)
    async def handle_reject_payment(ctx: Context, sender: str, msg: RejectPayment) -> None:
        ctx.logger.info("[seller] Payment rejected by %s: %s", sender[:20] + "…", msg.reason or "no reason")

    agent.include(chat_proto, publish_manifest=publish_agent_details)
    agent.include(payment_proto, publish_manifest=True)
    agent.include(trigger_proto)
    return agent


# ─── CLI helpers ─────────────────────────────────────────────────────────


def _parse_base_prices(raw: str) -> Dict[str, int]:
    prices: Dict[str, int] = {}
    for item in raw.split(","):
        if ":" not in item:
            continue
        svc, val = item.split(":", 1)
        svc = svc.strip().lower()
        if svc:
            try:
                prices[svc] = int(val.strip())
            except ValueError:
                continue
    if "plumbing" not in prices:
        prices["plumbing"] = 150
    return prices


# ─── CLI Entry Point ─────────────────────────────────────────────────────

if __name__ == "__main__":
    from dotenv import load_dotenv
    from uagents.setup import fund_agent_if_low

    load_dotenv()

    # ── Optionally load vendor profile from Supabase by VENDOR_ID ──
    _vendor_id = os.getenv("VENDOR_ID", "")
    _name = os.getenv("VENDOR_NAME", "LocalPlumbCo")
    _services = services_from_csv(os.getenv("VENDOR_SERVICES", "plumbing,leaky faucet"))
    _base_prices = _parse_base_prices(
        os.getenv("VENDOR_BASE_PRICES", "plumbing:150,leaky faucet:180,septic tank:500")
    )
    _aggression = max(1, min(5, int(os.getenv("VENDOR_AGGRESSION", "2"))))
    _pricing_strategy = normalize_pricing_strategy(
        os.getenv("VENDOR_PRICING_STRATEGY", DEFAULT_PRICING_STRATEGY)
    )

    if _vendor_id.isdigit():
        try:
            from db_helpers import load_vendor, vendor_row_to_agent_config
            _row = load_vendor(int(_vendor_id))
            if _row:
                _cfg = vendor_row_to_agent_config(_row)
                _name = _cfg["name"]
                _services = _cfg["services"]
                _base_prices = _cfg["base_prices"]
                _aggression = _cfg["aggression"]
                _pricing_strategy = normalize_pricing_strategy(
                    _cfg.get("pricing_strategy", DEFAULT_PRICING_STRATEGY)
                )
                print(f"[vendor] Loaded profile from Supabase: {_name} (id={_vendor_id})")
                print(f"  services: {_services}")
                print(f"  base_prices: {_base_prices}")
                print(f"  aggression: {_aggression}")
                print(f"  pricing_strategy: {_pricing_strategy}")
            else:
                print(f"[vendor] Vendor ID {_vendor_id} not found in Supabase, using .env defaults")
        except Exception as _e:
            print(f"[vendor] Supabase load skipped: {_e}")

    _agent = create_vendor_agent(
        name=_name,
        seed=os.getenv("VENDOR_SEED", "vendor_seed_treehacks_2026"),
        services=_services,
        base_prices=_base_prices,
        aggression=_aggression,
        orchestrator_address=os.getenv(
            "ORCHESTRATOR_ADDRESS",
            "agent1q0sewr2pg82xzuqzvj98usjdtc9zyrdlrgpsqh0gp4uw4cvh3ujp7452dwu",
        ),
        port=int(os.getenv("VENDOR_PORT", "8000")),
        mailbox=True,
        network="testnet",
        readme_path="README_VENDOR.md",
        publish_agent_details=True,
        pricing_strategy=_pricing_strategy,
        vendor_id=int(_vendor_id) if _vendor_id.isdigit() else 0,
    )
    fund_agent_if_low(_agent.wallet.address())
    _agent.run()
