"""
Customer agent for the agentplace negotiation marketplace.

Exports:
    customer_counter_price()  – compute a counter-offer
    create_customer_agent()   – factory returning a fully-wired Agent

Run standalone:  python customer.py   (reads config from .env)
"""

import asyncio
import json
import math
import os
import random
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from urllib.parse import quote
from uuid import uuid4

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
)


# ─── Urgency-driven price policy helpers ─────────────────────────────────


def _parse_iso_datetime(raw: str) -> Optional[datetime]:
    text = str(raw or "").strip()
    if not text:
        return None
    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        return None


def _urgency_norm(urgency: int) -> float:
    return max(0.0, min(1.0, (int(urgency) - 1) / 4.0))


def _days_ahead_from_iso(start_iso: str) -> float:
    dt = _parse_iso_datetime(start_iso)
    if dt is None:
        return 0.0
    now = datetime.now(dt.tzinfo) if dt.tzinfo else datetime.now()
    delta_days = (dt - now).total_seconds() / 86400.0
    return max(0.0, min(7.0, delta_days))


def target_price_for_days(
    budget: int,
    urgency: int,
    days_ahead: float,
) -> int:
    """
    Urgency-aware willingness-to-pay curve.

    Higher urgency accepts higher near-term prices.
    Lower urgency pushes harder for delayed slots.
    """
    b = max(1, int(budget))
    u = _urgency_norm(urgency)
    d = max(0.0, min(7.0, float(days_ahead)))

    target_ratio_now = 0.70 + 0.30 * u
    target_ratio_late = 0.50 + 0.40 * u
    target_ratio = target_ratio_now + (target_ratio_late - target_ratio_now) * (d / 7.0)
    return max(1, min(b, int(b * target_ratio)))


def acceptance_price_cap(
    budget: int,
    urgency: int,
    days_ahead: float,
) -> int:
    target = target_price_for_days(budget, urgency, days_ahead)
    slack = 0.03 + 0.12 * _urgency_norm(urgency)
    return min(max(1, int(budget)), int(target * (1.0 + slack)))


def should_accept_vendor_offer(
    *,
    budget: int,
    urgency: int,
    vendor_price: int,
    days_ahead: float,
    round_no: int,
    max_rounds: int,
) -> bool:
    """Decide whether to accept the current vendor offer."""
    price = max(0, int(vendor_price))
    hard_max = max(1, int(budget))
    cap = acceptance_price_cap(hard_max, urgency, days_ahead)

    # Good relative deal for this urgency/time profile.
    if price <= cap:
        return True

    # Endgame rule: never reject a within-budget offer solely due urgency shaping.
    if int(round_no) >= int(max_rounds) and price <= hard_max:
        return True

    return False


def max_rounds_for_urgency(urgency: int) -> int:
    # Negotiation round budget is fixed regardless of urgency.
    _ = urgency
    return 8


def customer_offer_utility(
    *,
    budget: int,
    urgency: int,
    price: int,
    start_iso: str,
    time_price_preference: str,
    priority: int = 1,
) -> float:
    b = max(1, int(budget))
    p = max(0, int(price))
    u = _urgency_norm(urgency)
    d = _days_ahead_from_iso(start_iso)

    price_score = max(-1.0, min(1.0, 1.0 - (p / float(b))))
    horizon = max(3.0, 7.0 - 4.0 * u)
    time_score = math.exp(-d / horizon)

    # Low urgency: prioritize price heavily.
    # High urgency: prioritize earlier appointment time.
    w_time = 0.05 + 0.75 * u
    w_price = 0.95 - 0.75 * u

    pref = str(time_price_preference or "balanced").strip().lower()
    if pref == "time_first":
        w_time += 0.15
    elif pref == "price_first":
        w_price += 0.15

    total = max(1e-6, w_time + w_price)
    w_time /= total
    w_price /= total

    pr = max(1, min(5, int(priority or 1)))
    priority_bonus = (pr - 1) * 0.02

    return (w_price * price_score) + (w_time * time_score) + priority_bonus


def customer_counter_price(
    budget: int,
    urgency: int,
    vendor_price: int,
    previous_counter: int,
    days_ahead: float,
) -> int:
    """Compute a counter-offer from urgency and slot timing."""
    target = target_price_for_days(budget, urgency, days_ahead)
    midpoint = int((max(1, vendor_price) + target) / 2)
    proposal = min(int(budget), midpoint + random.randint(-2, 2))
    floor = int(max(1, budget) * 0.45)
    proposal = max(floor, proposal)
    if previous_counter > 0:
        proposal = min(int(budget), max(proposal, previous_counter))
    return proposal


def choose_best_offer(
    *,
    offers: List[Dict[str, Any]],
    budget: int,
    urgency: int,
    time_price_preference: str,
) -> Dict[str, Any]:
    if not offers:
        return {}

    def _offer_price(offer: Dict[str, Any]) -> int:
        try:
            return int(offer.get("price") or 0)
        except (TypeError, ValueError):
            return 0

    def _offer_start(offer: Dict[str, Any]) -> str:
        return str(offer.get("start_iso") or "")

    def _offer_priority(offer: Dict[str, Any]) -> int:
        try:
            return int(offer.get("priority") or 1)
        except (TypeError, ValueError):
            return 1

    # Low urgency customers compare multiple dates and favor cheaper later slots.
    if int(urgency) <= 2:
        return min(
            offers,
            key=lambda o: (
                _offer_price(o),
                -_days_ahead_from_iso(_offer_start(o)),
                -_offer_priority(o),
            ),
        )

    return max(
        offers,
        key=lambda o: customer_offer_utility(
            budget=budget,
            urgency=urgency,
            price=_offer_price(o),
            start_iso=_offer_start(o),
            time_price_preference=time_price_preference,
            priority=_offer_priority(o),
        ),
    )


def _parse_vendor_offers(fields: Dict[str, str]) -> List[Dict[str, Any]]:
    raw = fields.get("OFFERS_JSON", "")
    if raw:
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, list):
                return [o for o in parsed if isinstance(o, dict)]
        except Exception:
            pass

    # Fallback to a single-offer shape from flat fields.
    price = int(fields.get("PRICE", "0")) if fields.get("PRICE", "").isdigit() else 0
    start_iso = fields.get("START_ISO", "")
    end_iso = fields.get("END_ISO", "")
    if price > 0:
        return [{
            "offer_id": fields.get("OFFER_ID", "single"),
            "price": price,
            "start_iso": start_iso,
            "end_iso": end_iso,
            "priority": 1,
        }]
    return []


_SENSITIVE_DISCLOSURE_PATTERNS = [
    re.compile(
        r"\b(max(?:imum)?\s+budget|budget\s+cap|budget\s+limit|absolute\s+maximum|reservation\s+price)\b",
        flags=re.IGNORECASE,
    ),
    re.compile(
        r"\b(min(?:imum)?|lowest|floor|final)\s+(?:price|offer)\b",
        flags=re.IGNORECASE,
    ),
    re.compile(
        r"\burgency\s*(?:is|=|:)?\s*[1-5](?:\s*/\s*5)?\b",
        flags=re.IGNORECASE,
    ),
    re.compile(
        r"\b[1-5]\s*/\s*5\b",
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


def _contains_sensitive_disclosure(text: str) -> bool:
    t = str(text or "")
    return any(p.search(t) for p in _SENSITIVE_DISCLOSURE_PATTERNS)


def _sanitize_customer_utterance(text: str, fallback: str) -> str:
    t = str(text or "").strip()
    if not t or _contains_sensitive_disclosure(t) or "$" not in t:
        return fallback
    return t


# ─── Agent Factory ───────────────────────────────────────────────────────


def create_customer_agent(
    *,
    name: str = "customer",
    seed: str,
    service: str,
    budget: int,
    urgency: int = 3,
    city: str = "Palo Alto",
    notes: str = "",
    orchestrator_address: str,
    timezone_name: str = "UTC",
    duration_minutes: int = 60,
    availability_windows: Optional[List[Dict[str, Any]]] = None,
    time_price_preference: str = "balanced",
    latest_acceptable_start_iso: str = "",
    port: Optional[int] = None,
    mailbox: bool = False,
    network: Optional[str] = None,
    readme_path: Optional[str] = None,
    publish_agent_details: bool = False,
    registration_policy: Optional[Any] = None,
    # ── simulation hooks (optional) ──
    startup_delay: float = 0.0,
    result_sink: Optional[Dict[str, Any]] = None,
    finished_event: Optional[asyncio.Event] = None,
    event_queue: Optional[asyncio.Queue] = None,
) -> Agent:
    """Return a fully-wired customer Agent.

    If *result_sink* is provided the agent populates it with structured
    negotiation results (vendor_results, outcome, winner, etc.).
    If *finished_event* is provided the agent sets it once all negotiations
    are resolved.
    If *event_queue* is provided the agent pushes real-time events as dicts
    for streaming to the frontend via WebSocket.
    """

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
            "role": "customer",
            "category": "agent_marketplace",
            "job_type": service,
            "max_price": str(budget),
            "urgency": str(urgency),
            "protocol": "chat",
        }

    if registration_policy is not None:
        kwargs["registration_policy"] = registration_policy

    agent = Agent(**kwargs)

    rid = str(uuid4())
    previous_counters: Dict[str, int] = {}
    vendor_rounds: Dict[str, int] = {}
    deal_closed = False
    terminated = False
    expected_vendors: List[int] = [0]       # mutable; set from "Matched N vendors" status
    vendor_result_count: List[int] = [0]    # mutable; incremented on each vendor_result

    req_windows = availability_windows or []
    pref_token = str(time_price_preference or "balanced").strip().lower()
    if pref_token not in {"time_first", "balanced", "price_first"}:
        pref_token = "balanced"

    # ── LLM text generation ──

    sys_prompt = (
        f"You are a customer looking for {service} services. "
        f"Your preference is '{pref_token}' between time and price. "
        "Write brief, natural responses (1-3 sentences). You MUST mention the exact dollar "
        "amount given to you. Keep reservation details private: never reveal maximum budget, "
        "minimum/maximum acceptable price, urgency score, or negotiation limits. "
        "Do NOT include any KEY=VALUE lines — write like a real person."
    )

    async def _accept_text(price: int, start_iso: str, end_iso: str) -> str:
        when = _slot_phrase(start_iso, end_iso)
        fallback = f"That works for me. I accept ${price} for {when}."
        raw = await generate_text(
            sys_prompt,
            (
                f"You are accepting an offer at ${price} for start time {when}. "
                "Sound decisive and positive. Do not disclose hidden limits."
            ),
            fallback,
        )
        return _sanitize_customer_utterance(raw, fallback)

    async def _counter_text(
        counter_price: int,
        vendor_price: int,
        start_iso: str,
        end_iso: str,
    ) -> str:
        when = _slot_phrase(start_iso, end_iso)
        fallback = f"Thanks for the offer. Could we do ${counter_price} for {when}?"
        raw = await generate_text(
            sys_prompt,
            (
                f"The vendor offered ${vendor_price} for {when}. "
                f"Counter at ${counter_price} while staying polite and firm. "
                "Do not disclose hidden limits."
            ),
            fallback,
        )
        return _sanitize_customer_utterance(raw, fallback)

    async def _terminate_text(vendor_price: int, start_iso: str, end_iso: str) -> str:
        when = _slot_phrase(start_iso, end_iso)
        fallback = f"I appreciate it, but I can't make ${vendor_price} work for {when}. I'll pass."
        raw = await generate_text(
            sys_prompt,
            (
                f"The vendor is at ${vendor_price} for {when}, which does not work for you. "
                "Politely end this negotiation. Do not disclose hidden limits."
            ),
            fallback,
        )
        return _sanitize_customer_utterance(raw, fallback)

    def _request_text() -> str:
        # Keep NOTES on a single line; parse_fields() is line-based.
        notes_urlenc = quote(notes or "", safe="")
        windows_json = json.dumps(req_windows, separators=(",", ":"))
        return "\n".join([
            "TYPE=request",
            f"RID={rid}",
            f"SERVICE={service}",
            f"BUDGET={budget}",
            f"URGENCY={urgency}",
            f"CITY={city}",
            f"TIMEZONE={timezone_name}",
            f"DURATION_MINUTES={max(1, int(duration_minutes))}",
            f"TIME_PRICE_PREFERENCE={pref_token}",
            f"LATEST_ACCEPTABLE_START_ISO={latest_acceptable_start_iso}",
            f"AVAILABILITY_WINDOWS_JSON={windows_json}",
            f"NOTES_URLENC={notes_urlenc}",
            "TEXT=Please help me find the best vendor and negotiate in natural language.",
        ])

    # ── helpers for result tracking ──

    def _record(key: str, value: Any) -> None:
        if result_sink is not None:
            result_sink[key] = value

    def _append(key: str, value: Any) -> None:
        if result_sink is not None:
            result_sink.setdefault(key, []).append(value)

    def _finish() -> None:
        if finished_event is not None:
            finished_event.set()

    def _push_event(evt: Dict[str, Any]) -> None:
        """Push a real-time event to the WebSocket queue (non-blocking)."""
        if event_queue is not None:
            try:
                event_queue.put_nowait(evt)
            except Exception:
                pass

    # ── Protocol handlers ──

    chat_proto = Protocol(spec=chat_protocol_spec)

    @agent.on_event("startup")
    async def on_startup(ctx: Context) -> None:
        if not os.getenv("AGENTVERSE_KEY") and mailbox:
            ctx.logger.warning("AGENTVERSE_KEY is not set.")
        if startup_delay > 0:
            ctx.logger.info("Waiting %.1fs for vendors to register...", startup_delay)
            await asyncio.sleep(startup_delay)
        ctx.logger.info(
            "Sending request  RID=%s  service=%s  budget=$%s  urgency=%s  city=%s  notes_len=%d",
            rid, service, budget, urgency, city, len(notes or ""),
        )
        request_payload = _request_text()
        await ctx.send(orchestrator_address, make_chat_message(request_payload))

    @chat_proto.on_message(model=ChatMessage)
    async def handle_chat(ctx: Context, sender: str, msg: ChatMessage) -> None:
        nonlocal deal_closed, terminated
        text = extract_text(msg)
        fields = parse_fields(text)

        await ctx.send(
            sender,
            ChatAcknowledgement(
                timestamp=datetime.now(timezone.utc),
                acknowledged_msg_id=msg.msg_id,
            ),
        )

        if sender != orchestrator_address:
            return

        msg_rid = fields.get("RID", "")
        if msg_rid and msg_rid != rid:
            return
        mt = fields.get("TYPE", "").lower()

        # ── status ──
        if mt == "status":
            txt = fields.get("TEXT", text)
            ctx.logger.info("STATUS: %s", txt)
            _append("statuses", txt)
            _push_event({"type": "status", "text": txt})
            # Parse expected vendor count: "Matched N vendors for ..."
            m = re.search(r"Matched (\d+) vendors", txt)
            if m:
                expected_vendors[0] = int(m.group(1))
                ctx.logger.info("Expected %d vendor results", expected_vendors[0])
            return

        # ── per-vendor result (consensus mode) ──
        if mt == "vendor_result":
            vn = fields.get("VENDOR_NAME", "?")
            outcome = fields.get("OUTCOME", "?")
            price_s = fields.get("PRICE", "0")
            rounds_s = fields.get("ROUNDS", "0")
            vendor_id_s = fields.get("VENDOR_ID", "0")
            start_iso = fields.get("START_ISO", "")
            end_iso = fields.get("END_ISO", "")
            utility_s = fields.get("UTILITY", "")
            try:
                utility_val = float(utility_s) if utility_s else 0.0
            except ValueError:
                utility_val = 0.0
            ctx.logger.info("VENDOR RESULT: %s  [%s]", vn, outcome)
            vr = {
                "vendor_name": vn,
                "vendor_address": fields.get("VENDOR", ""),
                "vendor_id": int(vendor_id_s) if vendor_id_s.isdigit() else 0,
                "outcome": outcome,
                "price": int(price_s) if price_s.isdigit() else 0,
                "rounds": int(rounds_s) if rounds_s.isdigit() else 0,
                "start_iso": start_iso,
                "end_iso": end_iso,
                "utility": utility_val,
                "text": fields.get("TEXT", text),
            }
            _append("vendor_results", vr)
            _push_event({"type": "vendor_result", **vr})

            # ── Auto-finish when ALL vendors have reported ──
            vendor_result_count[0] += 1
            ctx.logger.info(
                "Vendor results: %d / %d expected",
                vendor_result_count[0],
                expected_vendors[0],
            )
            if expected_vendors[0] > 0 and vendor_result_count[0] >= expected_vendors[0]:
                ctx.logger.info("All %d vendor results received — finishing", expected_vendors[0])
                all_results = result_sink.get("vendor_results", []) if result_sink else []
                deals = [r for r in all_results if r.get("outcome") == "deal"]
                if deals:
                    best = max(deals, key=lambda d: (float(d.get("utility") or 0.0), -(d.get("price", float("inf")))))
                    _record("outcome", "deal")
                    _record(
                        "outcome_text",
                        f"Best deal: {best['vendor_name']} at ${best['price']}",
                    )
                    _record("winner", best["vendor_name"])
                    _record("winner_price", best.get("price", 0))
                else:
                    _record("outcome", "no_deal")
                    _record("outcome_text", "All vendors failed to reach agreement")
                _finish()
            return

        # ── deal closed (final consensus or first-deal) ──
        if mt == "deal_closed":
            deal_closed = True
            txt = fields.get("TEXT", text)
            ctx.logger.info("DEAL CLOSED: %s", txt)
            _record("outcome", "deal")
            _record("outcome_text", txt)
            _record("winner", fields.get("WINNER", ""))
            wp = fields.get("WINNER_PRICE", "0")
            _record("winner_price", int(wp) if wp.isdigit() else 0)
            _push_event({
                "type": "deal_closed",
                "text": txt,
                "winner": fields.get("WINNER", ""),
                "winner_price": int(wp) if wp.isdigit() else 0,
            })
            _finish()
            return

        # ── terminated ──
        if mt == "terminated":
            txt = fields.get("TEXT", text)
            ctx.logger.info("TERMINATED: %s", txt)
            _append("terminations", txt)
            _push_event({"type": "terminated", "text": txt})
            llm_failed = "LLM failed" in txt
            if llm_failed:
                _push_event({"type": "error", "text": txt})
            if any(p in txt for p in [
                "All vendor negotiations ended",
                "All vendors unavailable",
                "No vendors found",
            ]) or llm_failed:
                terminated = True
                _record("outcome", "no_deal")
                _record("outcome_text", txt)
                _push_event({"type": "done", "outcome": "no_deal", "text": txt})
                _finish()
            return

        # ── vendor structured offer ──
        if mt != "vendor_offer":
            return
        if deal_closed or terminated:
            return

        va = fields.get("VENDOR", "")
        if not va:
            return

        vendor_text = fields.get("TEXT", text)
        offers = _parse_vendor_offers(fields)
        if not offers:
            return

        round_no = vendor_rounds.get(va, 0) + 1
        vendor_rounds[va] = round_no

        def _offer_price(offer: Dict[str, Any]) -> int:
            try:
                return int(offer.get("price") or 0)
            except (TypeError, ValueError):
                return 0

        def _offer_start(offer: Dict[str, Any]) -> str:
            return str(offer.get("start_iso") or "")

        def _offer_priority(offer: Dict[str, Any]) -> int:
            try:
                return int(offer.get("priority") or 1)
            except (TypeError, ValueError):
                return 1

        best_offer = choose_best_offer(
            offers=offers,
            budget=budget,
            urgency=urgency,
            time_price_preference=pref_token,
        )

        vp = _offer_price(best_offer)
        start_iso = _offer_start(best_offer)
        end_iso = str(best_offer.get("end_iso") or "")
        offer_id = str(best_offer.get("offer_id") or "")
        priority = _offer_priority(best_offer)
        util = customer_offer_utility(
            budget=budget,
            urgency=urgency,
            price=vp,
            start_iso=start_iso,
            time_price_preference=pref_token,
            priority=priority,
        )

        _push_event({
            "type": "negotiation_msg",
            "role": "vendor-agent",
            "vendor_address": va,
            "vendor_name": fields.get("VENDOR_NAME", "Vendor"),
            "price": vp,
            "text": vendor_text,
        })

        days = _days_ahead_from_iso(start_iso)
        max_rounds = max_rounds_for_urgency(urgency)

        action = "counter"
        response_price = vp

        if should_accept_vendor_offer(
            budget=int(budget),
            urgency=int(urgency),
            vendor_price=vp,
            days_ahead=days,
            round_no=round_no,
            max_rounds=max_rounds,
        ):
            action = "accept"
        elif round_no >= max_rounds:
            action = "terminate"
        else:
            prev = previous_counters.get(va, 0)
            response_price = customer_counter_price(
                budget=int(budget),
                urgency=int(urgency),
                vendor_price=vp,
                previous_counter=prev,
                days_ahead=days,
            )
            previous_counters[va] = response_price

        if action == "accept":
            body = await _accept_text(vp, start_iso, end_iso)
            response_price = vp
        elif action == "terminate":
            body = await _terminate_text(vp, start_iso, end_iso)
            response_price = 0
        else:
            body = await _counter_text(response_price, vp, start_iso, end_iso)

        _push_event({
            "type": "negotiation_msg",
            "role": "customer-agent",
            "vendor_address": va,
            "price": response_price,
            "text": body,
        })

        await ctx.send(
            orchestrator_address,
            make_chat_message("\n".join([
                "TYPE=customer_counter",
                f"RID={rid}",
                f"VENDOR={va}",
                f"ACTION={action}",
                f"OFFER_ID={offer_id}",
                f"PRICE={response_price}",
                f"START_ISO={start_iso}",
                f"END_ISO={end_iso}",
                f"UTILITY={util:.6f}",
                f"TEXT={body}",
            ])),
        )

    @chat_proto.on_message(model=ChatAcknowledgement)
    async def handle_ack(ctx: Context, sender: str, msg: ChatAcknowledgement) -> None:
        pass

    agent.include(chat_proto, publish_manifest=publish_agent_details)
    return agent


# ─── CLI Entry Point ─────────────────────────────────────────────────────

if __name__ == "__main__":
    from dotenv import load_dotenv
    from uagents.setup import fund_agent_if_low

    load_dotenv()

    # ── Optionally load consumer from Supabase by CONSUMER_NAME ──
    _consumer_name = os.getenv("CONSUMER_NAME", "")
    if _consumer_name:
        try:
            from db_helpers import load_consumer

            _consumer = load_consumer(_consumer_name)
            if _consumer:
                print(f"[customer] Loaded consumer from Supabase: {_consumer_name}")
                print(f"  job_count: {_consumer.get('job_count', 0)}")
            else:
                print(f"[customer] Consumer '{_consumer_name}' not found in Supabase")
        except Exception as _e:
            print(f"[customer] Supabase load skipped: {_e}")

    _agent = create_customer_agent(
        name=_consumer_name or "customer",
        seed=os.getenv("CUSTOMER_SEED", "customer_seed_treehacks_2026"),
        service=os.getenv("JOB_TYPE", "leaky faucet").strip().lower(),
        budget=int(os.getenv("MAX_PRICE", "180")),
        urgency=max(1, min(5, int(os.getenv("URGENCY", "3")))),
        notes=os.getenv(
            "CUSTOMER_NOTES",
            "Need someone reliable and quick. Please include labor/materials in quote.",
        ),
        orchestrator_address=os.getenv(
            "ORCHESTRATOR_ADDRESS",
            "agent1q0sewr2pg82xzuqzvj98usjdtc9zyrdlrgpsqh0gp4uw4cvh3ujp7452dwu",
        ),
        timezone_name=os.getenv("CUSTOMER_TIMEZONE", "UTC"),
        duration_minutes=max(1, int(os.getenv("JOB_DURATION_MINUTES", "60"))),
        availability_windows=[],
        time_price_preference=os.getenv("TIME_PRICE_PREFERENCE", "balanced"),
        latest_acceptable_start_iso=os.getenv("LATEST_ACCEPTABLE_START_ISO", ""),
        port=int(os.getenv("CUSTOMER_PORT", "8002")),
        mailbox=True,
        network="testnet",
        readme_path="README_CUSTOMER.md",
        publish_agent_details=True,
    )
    fund_agent_if_low(_agent.wallet.address())
    _agent.run()
