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
import os
import random
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set

from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.chat import (
    ChatAcknowledgement,
    ChatMessage,
    chat_protocol_spec,
)

from chat_utils import (
    extract_price,
    extract_text,
    generate_text,
    make_chat_message,
    parse_fields,
    services_from_csv,
)


# ─── Pricing Logic (pure, importable) ────────────────────────────────────


PRICING_STRATEGY_MAXIMIZE_JOBS = "maximize_jobs"
PRICING_STRATEGY_HIGH_VALUE_ONLY = "high_value_only"
PRICING_STRATEGY_YIELD_OPTIMIZER = "yield_optimizer"
DEFAULT_PRICING_STRATEGY = PRICING_STRATEGY_MAXIMIZE_JOBS

_PRICING_STRATEGY_ALIASES = {
    "maximize_jobs": PRICING_STRATEGY_MAXIMIZE_JOBS,
    "maximize_number_of_jobs": PRICING_STRATEGY_MAXIMIZE_JOBS,
    "max_jobs": PRICING_STRATEGY_MAXIMIZE_JOBS,
    "high_value_only": PRICING_STRATEGY_HIGH_VALUE_ONLY,
    "high_value_jobs_only": PRICING_STRATEGY_HIGH_VALUE_ONLY,
    "aggressive": PRICING_STRATEGY_HIGH_VALUE_ONLY,
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

    agent = Agent(**kwargs)
    _weekly_availability = weekly_availability or {}
    deal_state: Dict[str, Dict[str, Any]] = {}

    # ── LLM text generation ──

    sys_prompt = (
        f"You are {name}, a professional {', '.join(sorted(supported))} service vendor. "
        f"Your negotiation style is {aggression}/5 (1 = very flexible, 5 = very firm). "
        f"Your pricing strategy is '{strategy}'. "
        "Write brief, natural responses (1-3 sentences). You MUST mention the exact dollar "
        "amount given to you. Do NOT include any KEY=VALUE lines — write like a real person."
    )

    async def _opening_text(svc: str, offer: int) -> str:
        return await generate_text(
            sys_prompt,
            f"Write a friendly opening quote for a {svc} job at ${offer}. "
            "Mention what you bring to the table briefly.",
            f"I can handle the {svc} job and my opening offer is ${offer}.",
        )

    async def _counter_text(offer: int, customer_offer: int) -> str:
        if customer_offer >= offer:
            return await generate_text(
                sys_prompt,
                f"The customer offered ${customer_offer} and you accept at ${offer}. "
                "Write a brief, warm acceptance.",
                f"Your number works. I can accept ${offer}.",
            )
        return await generate_text(
            sys_prompt,
            f"The customer countered at ${customer_offer}. Your revised offer is ${offer}. "
            "Write a brief, professional counter-offer.",
            f"I appreciate the counter but I can revise to ${offer}.",
        )

    def _registration_text() -> str:
        return "\n".join([
            "TYPE=vendor_register",
            f"VENDOR={agent.address}",
            f"NAME={name}",
            f"SERVICES={','.join(sorted(supported))}",
            f"AGGRESSION={aggression}",
            f"STRATEGY={strategy}",
            f"WEEKLY_AVAILABILITY={json.dumps(_weekly_availability)}",
            "NOTE=Vendor ready for natural-language chat negotiation.",
        ])

    # ── Protocol handlers ──

    chat_proto = Protocol(spec=chat_protocol_spec)

    @agent.on_event("startup")
    async def on_startup(ctx: Context) -> None:
        print(f"[DEBUG] {name} on_startup FIRED", flush=True)
        ctx.logger.info("Vendor ready: %s  address=%s", name, agent.address)
        if not os.getenv("AGENTVERSE_KEY") and mailbox:
            ctx.logger.warning("AGENTVERSE_KEY is not set.")
        print(f"[DEBUG] {name} sending vendor_register to orchestrator...", flush=True)
        result = await ctx.send(orchestrator_address, make_chat_message(_registration_text()))
        print(f"[DEBUG] {name} ctx.send() returned: {result}", flush=True)

    @agent.on_interval(period=45.0)
    async def refresh_registration(ctx: Context) -> None:
        result = await ctx.send(orchestrator_address, make_chat_message(_registration_text()))
        print(f"[DEBUG] {name} refresh_registration ctx.send() returned: {result}", flush=True)

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
            notes = fields.get("NOTES", "")
            # Vendor-side service eligibility is intentionally not enforced here.
            # Orchestrator already handles LLM intent matching + availability filtering.
            # We only need a concrete price key for offer calculation.
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

            yield_discount = 0.0
            free_ratio: Optional[float] = None
            if strategy == PRICING_STRATEGY_YIELD_OPTIMIZER:
                yield_discount, free_ratio = _compute_yield_discount(
                    notes=notes,
                    weekly_availability=_weekly_availability,
                    vendor_id=vendor_id,
                )
                if yield_discount > 0:
                    ctx.logger.info(
                        "Yield optimizer applied for %s  rid=%s  free_ratio=%.2f  discount=%.1f%%",
                        name,
                        rid,
                        free_ratio if free_ratio is not None else 0.0,
                        yield_discount * 100,
                    )

            offer = vendor_opening_price(
                base_prices,
                aggression,
                svc,
                urg,
                strategy=strategy,
                yield_discount=yield_discount,
            )
            deal_state[rid] = {
                "service": svc,
                "urgency": urg,
                "last_offer": offer,
                "yield_discount": yield_discount,
                "free_ratio": free_ratio,
            }
            body = await _opening_text(svc, offer)
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
            yield_discount = float(st.get("yield_discount") or 0.0)
            cp = int(fields["PRICE"]) if fields.get("PRICE", "").isdigit() else extract_price(text)
            if cp <= 0:
                cp = max(1, int(cur * 0.9))
            floor = vendor_floor_price(
                base_prices,
                aggression,
                svc,
                urg,
                strategy=strategy,
                yield_discount=yield_discount,
            )
            new = vendor_revised_price(
                aggression,
                cur,
                cp,
                floor,
                strategy=strategy,
                yield_discount=yield_discount,
            )
            st["last_offer"] = new
            body = await _counter_text(new, cp)
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

    agent.include(chat_proto, publish_manifest=publish_agent_details)
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
