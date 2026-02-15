"""
Orchestrator agent for the agentplace negotiation marketplace.

Exports:
    CONVERGENCE_SYSTEM_PROMPT   – referee prompt for the LLM
    check_convergence()         – decide CONTINUE / DEAL / TERMINATE
    create_orchestrator_agent() – factory returning a fully-wired Agent

Run standalone:  python orchestrator.py   (reads config from .env)
"""

import asyncio
import json
import os
import re
from urllib.parse import unquote
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Set
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
    services_from_csv,
)
from vendor_selector import VendorSelectionError, VendorSelectorAgent


# ─── Convergence Logic (pure / importable) ───────────────────────────────

CONVERGENCE_SYSTEM_PROMPT = """\
You are a negotiation referee. You will be given a conversation transcript \
between a customer and a vendor, along with price data. Your job is to decide \
whether the negotiation should CONTINUE, end in a DEAL, or TERMINATE (no deal).

Rules:
- If either side has clearly accepted the other's price, or both prices are \
  very close, output DEAL.
- If either side is frustrated, wants to walk away, or the conversation is \
  going in circles with no progress, output TERMINATE.
- Otherwise output CONTINUE.

You MUST respond with EXACTLY one line in this format (no extra text):
ACTION|PRICE|REASON

Where:
- ACTION is one of: CONTINUE, DEAL, TERMINATE
- PRICE is the agreed/midpoint price (integer, 0 if not applicable)
- REASON is a short explanation (one sentence)

Examples:
DEAL|155|Both sides agreed on $155.
TERMINATE|0|Customer explicitly said they want to walk away.
CONTINUE|0|Prices are still far apart but both sides are moving.\
"""

PRICING_KEY_SYSTEM_PROMPT = """\
You are a pricing-key matching specialist. Pick exactly one service label from
the vendor's list that best matches the customer's request.

You will receive:
- SERVICE: the customer requested category
- NOTES: optional free-text details
- AVAILABLE SERVICES: the vendor's own service labels

Return ONLY JSON:
{"service":"<exact label>","reason":"short reason"}

Rules:
- "service" must be copied verbatim (case-insensitive compare is okay, but return
  the exact label from AVAILABLE SERVICES).
- If there is no good match, return an empty string.
"""


def _extract_json_object(raw: str) -> Dict[str, Any]:
    text = (raw or "").strip()
    if not text:
        return {}
    try:
        obj = json.loads(text)
        return obj if isinstance(obj, dict) else {}
    except Exception:
        pass

    match = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not match:
        return {}
    try:
        obj = json.loads(match.group(0))
        return obj if isinstance(obj, dict) else {}
    except Exception:
        return {}


def _normalize_service_list(services: List[str]) -> List[str]:
    return sorted({
        str(service).strip() for service in services if str(service).strip()
    })


async def pick_pricing_key(
    requested_service: str,
    notes: str,
    vendor_name: str,
    vendor_services: List[str],
    rid: str,
) -> str:
    """Pick a vendor-specific pricing key for this customer request."""
    normalized_services = _normalize_service_list(vendor_services)
    if not normalized_services:
        return ""

    if len(normalized_services) == 1:
        return normalized_services[0]

    request_service = (requested_service or "").strip().lower()
    request_notes = notes or ""

    direct = [
        svc for svc in normalized_services
        if request_service and (request_service == svc.lower() or request_service in svc.lower())
    ]
    if direct:
        return direct[0]

    raw = await generate_text(
        system_prompt=PRICING_KEY_SYSTEM_PROMPT,
        user_prompt=(
            f"SERVICE: {requested_service}\n"
            f"NOTES: {request_notes or '(none)'}\n"
            f"AVAILABLE SERVICES: {', '.join(normalized_services)}\n"
            f"VENDOR: {vendor_name or '(unknown)'}\n"
            f"RID: {rid}"
        ),
        fallback='{"service":"","reason":"llm_unavailable"}',
        max_tokens=120,
        temperature=0.2,
    )

    parsed = _extract_json_object(raw)
    picked = str(parsed.get("service", "")).strip()
    if picked:
        picked_l = picked.lower()
        for candidate in normalized_services:
            if candidate.lower() == picked_l:
                return candidate

    # Deterministic fallback: exact substring match if any.
    if request_service:
        for candidate in normalized_services:
            if request_service in candidate.lower():
                return candidate
    return normalized_services[0]


def ensure_vendor_state(req: Dict[str, Any], va: str) -> Dict[str, Any]:
    """Return (and lazily create) the per-vendor negotiation state."""
    vs = req.setdefault("vendor_states", {})
    if va not in vs:
        vs[va] = {
            "active": True,
            "outcome": None,           # "deal", "terminated", "unavailable"
            "deal_price": 0,
            "latest_vendor_price": 0,
            "latest_customer_price": 0,
            "recent_vendor_prices": [],
            "recent_customer_prices": [],
            "transcript": [],
            "rounds": 0,
        }
    return vs[va]


def build_convergence_prompt(
    req: Dict[str, Any],
    vs: Dict[str, Any],
    max_rounds: int,
) -> str:
    """Build a user prompt for the convergence referee LLM."""
    return (
        f"Service: {req['service']}\n"
        f"Customer budget: ${req['budget']}\n"
        f"Rounds so far: {vs['rounds']} (max {max_rounds})\n"
        f"Latest vendor price: ${vs['latest_vendor_price']}\n"
        f"Latest customer price: ${vs['latest_customer_price']}\n"
        f"Recent vendor prices: {vs['recent_vendor_prices'][-5:]}\n"
        f"Recent customer prices: {vs['recent_customer_prices'][-5:]}\n"
        f"\nTranscript (most recent):\n"
        + "\n".join(vs["transcript"][-12:])
        + "\n\nWhat is your decision?"
    )


def parse_llm_decision(raw: str) -> tuple[str, int, str]:
    """Parse 'ACTION|PRICE|REASON' from LLM output."""
    for line in raw.strip().splitlines():
        parts = line.strip().split("|", 2)
        if len(parts) >= 3:
            action = parts[0].strip().upper()
            if action in ("DEAL", "TERMINATE", "CONTINUE"):
                try:
                    price = int(parts[1].strip())
                except ValueError:
                    price = 0
                return action.lower(), price, parts[2].strip()
    return "continue", 0, ""


async def check_convergence(
    req: Dict[str, Any],
    vs: Dict[str, Any],
    max_rounds: int,
) -> tuple[str, int, str]:
    """Return ``(action, price, reason)`` where action is continue/deal/terminate."""
    budget = req["budget"]
    lv = vs["latest_vendor_price"]
    lc = vs["latest_customer_price"]
    rounds = vs["rounds"]

    # Fast-path: price gap convergence
    if lv > 0 and lc > 0:
        gap = abs(lv - lc)
        band = max(5, int(max(1, budget) * 0.04))
        if gap <= band:
            return "deal", (lv + lc) // 2, f"Prices converged (gap ${gap} within ${band} band)."

    # Fast-path: max rounds
    if rounds >= max_rounds:
        if lv > 0 and lv <= budget:
            return "deal", lv, f"Max rounds ({max_rounds}); vendor within budget."
        return "terminate", 0, f"Max rounds ({max_rounds}) with no agreement."

    if rounds < 2:
        return "continue", 0, ""

    # Ask LLM
    raw = await generate_text(
        system_prompt=CONVERGENCE_SYSTEM_PROMPT,
        user_prompt=build_convergence_prompt(req, vs, max_rounds),
        fallback="CONTINUE|0|LLM unavailable, continuing.",
    )
    return parse_llm_decision(raw)


def parse_request_text(text: str, fields: Dict[str, str]) -> Dict[str, Any]:
    """Extract service/budget/urgency/notes from a customer request message."""
    service = fields.get("SERVICE", "").strip().lower()
    budget_s = fields.get("BUDGET", "")
    budget = int(budget_s) if budget_s.isdigit() else max(1, extract_price(text))
    urgency_s = fields.get("URGENCY", "")
    urgency = int(urgency_s) if urgency_s.isdigit() else 3
    city = fields.get("CITY", "").strip()
    notes = fields.get("NOTES", "")
    notes_urlenc = fields.get("NOTES_URLENC", "")
    if notes_urlenc:
        try:
            notes = unquote(notes_urlenc)
        except Exception:
            # Keep existing notes fallback if decoding fails.
            pass
    return {
        "service": service,
        "budget": budget if budget > 0 else 200,
        "urgency": max(1, min(5, urgency)),
        "city": city,
        "notes": notes,
    }


def normalize_city(city: str) -> str:
    """Lowercase and collapse whitespace for city comparisons."""
    return " ".join((city or "").strip().lower().split())


# ─── Availability helpers ────────────────────────────────────────────────

# Map slot labels (from the frontend availability grid) to 24-hour values
_SLOT_TO_HOUR = {
    "8a": 8, "9a": 9, "10a": 10, "11a": 11, "12p": 12,
    "1p": 13, "2p": 14, "3p": 15, "4p": 16, "5p": 17, "6p": 18, "7p": 19,
}


def parse_customer_availability(notes: str) -> Dict[str, List[int]]:
    """Parse customer availability from the NOTES field.

    Expects a section like::

        CUSTOMER_AVAILABILITY_NEXT_7_DAYS:
        2026-02-15: 8a, 9a, 10a
        2026-02-16: 1p, 2p

    Returns ``{yyyy_mm_dd: [hour_ints]}`` e.g. ``{"2026-02-15": [8, 9, 10]}``.
    """
    result: Dict[str, List[int]] = {}
    in_availability = False
    for line in notes.split("\n"):
        line = line.strip()
        if "CUSTOMER_AVAILABILITY_NEXT_7_DAYS" in line:
            in_availability = True
            continue
        if not in_availability:
            continue
        if not line or ":" not in line:
            continue
        # Parse "2026-02-15: 8a, 9a, 10a"
        parts = line.split(":", 1)
        date_str = parts[0].strip()
        slots_str = parts[1].strip()
        try:
            datetime.strptime(date_str, "%Y-%m-%d")
        except ValueError:
            continue
        hours: List[int] = []
        for slot in slots_str.split(","):
            slot = slot.strip()
            if slot in _SLOT_TO_HOUR:
                hours.append(_SLOT_TO_HOUR[slot])
        if hours:
            if date_str not in result:
                result[date_str] = []
            result[date_str].extend(hours)
    return result


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


def _normalize_vendor_slots(raw: Any) -> List[str]:
    if raw is None:
        return []
    if isinstance(raw, str):
        return [raw]
    if not isinstance(raw, list):
        return []
    # Common shape from frontend: ["09:00", "17:00"].
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


def _vendor_slots_for_day(
    vendor_availability: Dict[str, Any],
    day_name: str,
) -> List[str]:
    vendor_day_raw = (
        vendor_availability.get(day_name)
        or vendor_availability.get(day_name.lower())
        or vendor_availability.get(day_name.upper())
    )
    return _normalize_vendor_slots(vendor_day_raw)


def _slot_ranges_minutes(slot_strings: List[str]) -> List[tuple[int, int]]:
    ranges: List[tuple[int, int]] = []
    for slot_str in slot_strings:
        if not isinstance(slot_str, str) or "-" not in slot_str:
            continue
        start_str, end_str = slot_str.split("-", 1)
        start = _hhmm_to_minutes(start_str)
        end = _hhmm_to_minutes(end_str)
        if start is None or end is None or end <= start:
            continue
        ranges.append((start, end))
    return ranges


def _ranges_overlap(a_start: int, a_end: int, b_start: int, b_end: int) -> bool:
    return a_start < b_end and b_start < a_end


def _minutes_to_hhmm(total: int) -> str:
    total = max(0, int(total))
    hour, minute = divmod(total, 60)
    return f"{hour:02d}:{minute:02d}"


def _format_ranges(ranges: List[tuple[int, int]]) -> List[str]:
    return [f"{_minutes_to_hhmm(start)}-{_minutes_to_hhmm(end)}" for start, end in ranges]


def _load_vendor_busy_ranges(
    vendor_id: int,
    dates: List[str],
) -> tuple[Dict[str, List[tuple[int, int]]], Optional[str]]:
    """Return vendor's existing booked time ranges for each selected date."""
    by_date: Dict[str, List[tuple[int, int]]] = {d: [] for d in dates}
    if vendor_id <= 0 or not dates:
        return by_date, None

    wanted = set(dates)
    try:
        from supabase_client import TABLE_JOBS, get_supabase

        sb = get_supabase()
        result = (
            sb.table(TABLE_JOBS)
            .select("date,start_time,end_time,duration_minutes")
            .eq("vendor_id", vendor_id)
            .execute()
        )
    except Exception as exc:
        return by_date, str(exc)

    for row in result.data or []:
        date_str = str(row.get("date") or "")
        if date_str not in wanted:
            continue
        start = _hhmm_to_minutes(row.get("start_time"))
        if start is None:
            continue
        end = _hhmm_to_minutes(row.get("end_time"))
        if end is None or end <= start:
            try:
                dur = int(row.get("duration_minutes") or 0)
            except (TypeError, ValueError):
                dur = 0
            if dur <= 0:
                dur = 60
            end = min(24 * 60, start + dur)
        by_date.setdefault(date_str, []).append((start, end))
    return by_date, None


def evaluate_vendor_availability(
    customer_availability: Dict[str, List[int]],
    vendor_availability: Dict[str, Any],
    vendor_id: int = 0,
) -> tuple[bool, Dict[str, Any]]:
    """Evaluate availability and return (is_available, structured_diagnostics)."""
    diagnostics: Dict[str, Any] = {
        "vendor_id": vendor_id,
        "has_vendor_schedule": bool(vendor_availability),
        "customer_availability": customer_availability,
        "date_checks": [],
        "decision": "unknown",
    }

    if not customer_availability:
        diagnostics["decision"] = "no_customer_slots"
        return True, diagnostics

    has_vendor_schedule = bool(vendor_availability)
    busy_by_date, busy_load_error = _load_vendor_busy_ranges(vendor_id, list(customer_availability.keys()))
    diagnostics["busy_ranges"] = {
        date: _format_ranges(ranges) for date, ranges in busy_by_date.items()
    }
    if busy_load_error:
        diagnostics["busy_load_error"] = busy_load_error

    for date_str, customer_hours in customer_availability.items():
        date_detail: Dict[str, Any] = {
            "date": date_str,
            "customer_hours": list(customer_hours),
            "customer_ranges": _format_ranges([(h * 60, h * 60 + 60) for h in customer_hours]),
            "slot_checks": [],
        }

        try:
            day_name = datetime.strptime(date_str, "%Y-%m-%d").strftime("%A")
            date_detail["day_name"] = day_name
        except ValueError:
            date_detail["result"] = "invalid_date"
            diagnostics["date_checks"].append(date_detail)
            continue

        if has_vendor_schedule:
            vendor_slots = _vendor_slots_for_day(vendor_availability, day_name)
            slot_ranges = _slot_ranges_minutes(vendor_slots)
            date_detail["vendor_slots"] = vendor_slots
            date_detail["vendor_ranges"] = _format_ranges(slot_ranges)
            if not slot_ranges:
                date_detail["result"] = "no_vendor_slots_on_day"
                diagnostics["date_checks"].append(date_detail)
                continue
        else:
            # No weekly schedule data: allow all day, then filter only by booked jobs.
            slot_ranges = [(0, 24 * 60)]
            date_detail["vendor_slots"] = ["all_day(no_weekly_schedule)"]
            date_detail["vendor_ranges"] = _format_ranges(slot_ranges)

        busy_ranges = busy_by_date.get(date_str, [])
        date_detail["busy_ranges"] = _format_ranges(busy_ranges)

        for hour in customer_hours:
            start = int(hour) * 60
            end = start + 60
            within_schedule = any(
                _ranges_overlap(start, end, s_start, s_end)
                for s_start, s_end in slot_ranges
            )
            conflicts_existing = any(
                _ranges_overlap(start, end, b_start, b_end)
                for b_start, b_end in busy_ranges
            ) if within_schedule else False
            slot_ok = within_schedule and not conflicts_existing
            date_detail["slot_checks"].append({
                "hour": int(hour),
                "range": f"{_minutes_to_hhmm(start)}-{_minutes_to_hhmm(end)}",
                "within_schedule": within_schedule,
                "conflicts_existing": conflicts_existing,
                "slot_ok": slot_ok,
            })
            if slot_ok:
                date_detail["result"] = "slot_available"
                diagnostics["date_checks"].append(date_detail)
                diagnostics["decision"] = "available"
                diagnostics["matched_date"] = date_str
                diagnostics["matched_hour"] = int(hour)
                return True, diagnostics

        date_detail["result"] = "no_open_slot_on_date"
        diagnostics["date_checks"].append(date_detail)

    diagnostics["decision"] = "no_non_conflicting_slot"
    return False, diagnostics


def check_availability_overlap(
    customer_availability: Dict[str, List[int]],
    vendor_availability: Dict[str, Any],
    vendor_id: int = 0,
) -> bool:
    """Return True if any customer slot overlaps vendor schedule and not-booked jobs.

    *customer_availability*: ``{"2026-02-16": [16]}`` (hours)
    *vendor_availability*: ``{"Monday": ["9:00-12:00", "13:00-17:00"]}``

    If either side has no data we assume there **is** overlap (optimistic).
    """
    is_available, _ = evaluate_vendor_availability(
        customer_availability,
        vendor_availability,
        vendor_id=vendor_id,
    )
    return is_available


# ─── Text helpers ────────────────────────────────────────────────────────

def _status(rid: str, t: str) -> str:
    return f"TYPE=status\nRID={rid}\nTEXT={t}"


def _deal_msg(rid: str, t: str) -> str:
    return f"TYPE=deal_closed\nRID={rid}\nTEXT={t}"


def _terminated_msg(rid: str, t: str) -> str:
    return f"TYPE=terminated\nRID={rid}\nTEXT={t}"


# ─── Agent Factory ───────────────────────────────────────────────────────


def create_orchestrator_agent(
    *,
    seed: str,
    max_rounds: int = 8,
    consensus_mode: bool = False,
    port: Optional[int] = None,
    mailbox: bool = False,
    network: Optional[str] = None,
    readme_path: Optional[str] = None,
    publish_agent_details: bool = False,
    registration_policy: Optional[Any] = None,
    event_queue: Optional[asyncio.Queue] = None,
    on_deal_callback: Optional[Any] = None,
) -> Agent:
    """Return a fully-wired orchestrator Agent.

    *consensus_mode*: when True the orchestrator waits for **all** vendor
    negotiations to finish before picking the best deal and notifying the
    customer.  When False (default / production) the first deal closes the
    entire request immediately.

    *preload_vendors*: optional list of vendor registry dicts to bootstrap
    from Supabase on startup (keys: name, services, aggression, sender, vendor_id).

    *on_deal_callback*: optional callable(vendor_name, vendor_id, consumer_addr,
    service, price, rounds) invoked when a deal closes, e.g. to write to Supabase.
    """

    kwargs: Dict[str, Any] = {"name": "orchestrator", "seed": seed}
    if port is not None:
        kwargs["port"] = port
    if mailbox:
        kwargs["mailbox"] = True
    if network:
        kwargs["network"] = network
    if readme_path:
        kwargs["readme_path"] = readme_path
    if publish_agent_details:
        kwargs["publish_agent_details"] = True
        kwargs["metadata"] = {
            "role": "orchestrator",
            "category": "agent_marketplace",
            "features": "vendor_discovery,matching,chat_routing,convergence",
            "protocol": "chat",
        }

    if registration_policy is not None:
        kwargs["registration_policy"] = registration_policy

    agent = Agent(**kwargs)
    vendor_registry: Dict[str, Dict[str, Any]] = {}
    requests: Dict[str, Dict[str, Any]] = {}
    selector_agent = VendorSelectorAgent()

    def _push_event(evt: Dict[str, Any]) -> None:
        """Push a real-time event to the WebSocket queue (non-blocking)."""
        if event_queue is not None:
            try:
                event_queue.put_nowait(evt)
            except Exception:
                pass

    # ── consensus helpers (only used when consensus_mode=True) ──

    async def _check_all_resolved(ctx: Context, rid: str, req: Dict) -> None:
        for va in req["vendors"]:
            if ensure_vendor_state(req, va)["active"]:
                return
        req["closed"] = True

        deals, failed = [], []
        for va in req["vendors"]:
            vs = ensure_vendor_state(req, va)
            vn = vendor_registry.get(va, {}).get("name", va)
            if vs["outcome"] == "deal":
                deals.append({"name": vn, "address": va,
                              "price": vs["deal_price"], "rounds": vs["rounds"]})
            else:
                failed.append({"name": vn, "address": va,
                               "outcome": vs["outcome"] or "unknown", "rounds": vs["rounds"]})

        if not deals:
            await ctx.send(req["customer"], make_chat_message(
                _terminated_msg(rid, "All vendor negotiations ended with no agreement.")))
            return

        deals.sort(key=lambda d: d["price"])
        winner = deals[0]
        lines = [f"CONSENSUS: {len(deals)} deal(s), {len(failed)} failed."]
        for i, d in enumerate(deals, 1):
            tag = " << SELECTED" if i == 1 else ""
            lines.append(f"  {i}. {d['name']}  ${d['price']}  ({d['rounds']} rounds){tag}")
        for d in failed:
            lines.append(f"  X. {d['name']}  {d['outcome']}  ({d['rounds']} rounds)")
        lines.append(f"Best deal: {winner['name']} at ${winner['price']}.")

        await ctx.send(req["customer"], make_chat_message("\n".join([
            "TYPE=deal_closed", f"RID={rid}",
            f"WINNER={winner['name']}", f"WINNER_PRICE={winner['price']}",
            f"TEXT={chr(10).join(lines)}",
        ])))
        await ctx.send(winner["address"], make_chat_message(
            f"TYPE=deal_closed\nRID={rid}\nTEXT=You won the bid at ${winner['price']}."))
        for d in deals[1:]:
            await ctx.send(d["address"], make_chat_message(
                f"TYPE=terminated\nRID={rid}\nTEXT=Another vendor was selected at ${winner['price']}."))
        ctx.logger.info("CONSENSUS  rid=%s  winner=%s  price=$%s  deals=%d  failed=%d",
                        rid, winner["name"], winner["price"], len(deals), len(failed))
        if on_deal_callback:
            w_id = vendor_registry.get(winner['address'], {}).get('vendor_id')
            on_deal_callback(
                vendor_name=winner['name'], vendor_id=w_id,
                consumer_addr=req['customer'],
                service=req['service'], price=winner['price'], rounds=winner['rounds'],
            )

    # ── apply convergence ──

    async def _apply_convergence(ctx: Context, rid: str, va: str,
                                 req: Dict, vs: Dict) -> None:
        action, price, reason = await check_convergence(req, vs, max_rounds)
        if action == "continue":
            return

        vn = vendor_registry.get(va, {}).get("name", va)
        v_id = int(vendor_registry.get(va, {}).get("vendor_id") or 0)

        if action == "deal":
            vs["active"] = False
            vs["outcome"] = "deal"
            vs["deal_price"] = price

            if consensus_mode:
                await ctx.send(req["customer"], make_chat_message("\n".join([
                    "TYPE=vendor_result", f"RID={rid}", f"VENDOR={va}",
                    f"VENDOR_ID={v_id}",
                    f"VENDOR_NAME={vn}", "OUTCOME=deal", f"PRICE={price}",
                    f"ROUNDS={vs['rounds']}",
                    f"TEXT=Deal with {vn} at ${price}. {reason}",
                ])))
                ctx.logger.info("VENDOR DEAL  rid=%s  vendor=%s  price=$%s", rid, vn, price)
                await _check_all_resolved(ctx, rid, req)
            else:
                req["closed"] = True
                for v in req["vendors"]:
                    ensure_vendor_state(req, v)["active"] = False
                await ctx.send(req["customer"], make_chat_message(
                    _deal_msg(rid, f"Deal closed with {vn} at ${price}. {reason}")))
                await ctx.send(va, make_chat_message(
                    f"TYPE=deal_closed\nRID={rid}\nTEXT=Confirmed at ${price}. {reason}"))
                ctx.logger.info("DEAL  rid=%s  vendor=%s  price=$%s", rid, vn, price)
                if on_deal_callback:
                    on_deal_callback(
                        vendor_name=vn, vendor_id=v_id,
                        consumer_addr=req['customer'],
                        service=req['service'], price=price, rounds=vs['rounds'],
                    )
                if on_deal_callback:
                    on_deal_callback(
                        vendor_name=vn, vendor_id=v_id,
                        consumer_addr=req["customer"],
                        service=req["service"], price=price, rounds=vs["rounds"],
                    )
            return

        if action == "terminate":
            vs["active"] = False
            vs["outcome"] = "terminated"

            if consensus_mode:
                await ctx.send(req["customer"], make_chat_message("\n".join([
                    "TYPE=vendor_result", f"RID={rid}", f"VENDOR={va}",
                    f"VENDOR_ID={v_id}",
                    f"VENDOR_NAME={vn}", "OUTCOME=terminated", "PRICE=0",
                    f"ROUNDS={vs['rounds']}",
                    f"TEXT=Negotiation with {vn} terminated: {reason}",
                ])))
                await ctx.send(va, make_chat_message(
                    f"TYPE=terminated\nRID={rid}\nTEXT={reason}"))
                ctx.logger.info("TERMINATED  rid=%s  vendor=%s", rid, vn)
                await _check_all_resolved(ctx, rid, req)
            else:
                await ctx.send(req["customer"], make_chat_message(
                    _terminated_msg(rid, f"Negotiation with {vn} terminated: {reason}")))
                await ctx.send(va, make_chat_message(
                    f"TYPE=terminated\nRID={rid}\nTEXT={reason}"))
                ctx.logger.info("TERMINATED  rid=%s  vendor=%s", rid, vn)
                if not any(ensure_vendor_state(req, v)["active"] for v in req["vendors"]):
                    req["closed"] = True
                    await ctx.send(req["customer"], make_chat_message(
                        _terminated_msg(rid, "All vendor negotiations ended with no agreement.")))

    # ── protocol handlers ──

    chat_proto = Protocol(spec=chat_protocol_spec)

    @agent.on_event("startup")
    async def on_startup(ctx: Context) -> None:
        ctx.logger.info("Orchestrator ready  address=%s", agent.address)
        if not os.getenv("AGENTVERSE_KEY") and mailbox:
            ctx.logger.warning("AGENTVERSE_KEY is not set.")

    @chat_proto.on_message(model=ChatMessage)
    async def handle_chat(ctx: Context, sender: str, msg: ChatMessage) -> None:
        text = extract_text(msg)
        fields = parse_fields(text)
        mt = fields.get("TYPE", "").lower()

        await ctx.send(sender, ChatAcknowledgement(
            timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id))

        # ── vendor registration ──
        if mt == "vendor_register":
            va = fields.get("VENDOR", sender)
            avail_raw = fields.get("WEEKLY_AVAILABILITY", "")
            vendor_id_raw = fields.get("VENDOR_ID", "")
            vendor_id = int(vendor_id_raw) if vendor_id_raw.isdigit() else 0
            try:
                weekly_avail = json.loads(avail_raw) if avail_raw else {}
            except (json.JSONDecodeError, TypeError):
                weekly_avail = {}
            vendor_registry[va] = {
                "name": fields.get("NAME", "Vendor"),
                "vendor_id": vendor_id,
                "services": services_from_csv(fields.get("SERVICES", "")),
                "aggression": fields.get("AGGRESSION", ""),
                "pricing_strategy": fields.get("STRATEGY", "maximize_jobs"),
                "sender": sender,
                "weekly_availability": weekly_avail,
            }
            ctx.logger.info("Registered vendor %s  vendor_id=%s  address=%s  services=%s",
                            fields.get("NAME", "Vendor"),
                            vendor_id,
                            va,
                            vendor_registry[va]["services"])
            _push_event({
                "type": "log",
                "agent": "orchestrator",
                "text": f"Registered vendor {fields.get('NAME', 'Vendor')}  services={vendor_registry[va]['services']}",
            })
            return

        # ── new service request ──
        if mt == "request":
            rid = fields.get("RID", str(uuid4()))
            data = parse_request_text(text, fields)
            notes_text = data.get("notes") or ""
            if not data["service"]:
                err_text = "No vendors found because the LLM failed to match vendors: missing service in request."
                ctx.logger.error(
                    "REQUEST_INVALID  rid=%s  sender=%s  reason=missing_service",
                    rid,
                    sender,
                )
                await ctx.send(sender, make_chat_message(_terminated_msg(rid, err_text)))
                return
            ctx.logger.info(
                "REQUEST_IN  rid=%s  sender=%s  service=%s  budget=$%s  urgency=%s  city=%s  notes_len=%d  has_availability_header=%s",
                rid,
                sender,
                data["service"],
                data["budget"],
                data["urgency"],
                data.get("city", ""),
                len(notes_text),
                "CUSTOMER_AVAILABILITY_NEXT_7_DAYS" in notes_text,
            )

            requested_city = data.get("city", "")
            normalized_city = normalize_city(requested_city)
            if normalized_city and normalized_city != "palo alto":
                err_text = f"No vendors found for {data['service']} in {requested_city}."
                ctx.logger.info(
                    "CITY_FILTER_NO_MATCH  rid=%s  service=%s  city=%s",
                    rid,
                    data["service"],
                    requested_city,
                )
                await ctx.send(sender, make_chat_message(_terminated_msg(rid, err_text)))
                return

            try:
                matched, selector_source = await selector_agent.select(
                    service=data["service"],
                    notes=data["notes"],
                    budget=data["budget"],
                    vendor_registry=vendor_registry,
                )
            except VendorSelectionError as exc:
                err_text = f"No vendors found because the LLM failed to match vendors. {exc}"
                ctx.logger.error(
                    "SELECTOR_ERROR  rid=%s  service=%s  error=%s",
                    rid,
                    data["service"],
                    exc,
                )
                await ctx.send(sender, make_chat_message(_terminated_msg(rid, err_text)))
                return
            if not matched:
                await ctx.send(sender, make_chat_message(
                    _terminated_msg(rid, f"No vendors found for {data['service']}.")))
                return
            matched_names = [vendor_registry.get(va, {}).get("name", va) for va in matched]
            ctx.logger.info(
                "SELECTOR_RESULT  rid=%s  source=%s  matched_count=%d  matched_names=%s",
                rid,
                selector_source,
                len(matched),
                sorted(matched_names),
            )

            # ── Cross-check customer availability with vendor schedules ──
            customer_avail = parse_customer_availability(data.get("notes", ""))
            selected_slot_count = sum(len(hours) for hours in customer_avail.values())
            ctx.logger.info(
                "CUSTOMER_AVAILABILITY_PARSED  rid=%s  slot_count=%d  dates=%s",
                rid,
                selected_slot_count,
                sorted(customer_avail.keys()),
            )
            if not customer_avail and "CUSTOMER_AVAILABILITY_NEXT_7_DAYS" in (data.get("notes") or ""):
                ctx.logger.warning(
                    "CUSTOMER_AVAILABILITY_PARSE_EMPTY  rid=%s  notes contained availability header but parsed no slots",
                    rid,
                )
            available_vendors: Set[str] = set()
            unavailable_vendors: Set[str] = set()

            if customer_avail:
                for va in matched:
                    vendor_avail = vendor_registry.get(va, {}).get(
                        "weekly_availability", {}
                    )
                    vendor_id = int(vendor_registry.get(va, {}).get("vendor_id") or 0)
                    vendor_name = vendor_registry.get(va, {}).get("name", va)
                    is_available, diagnostics = evaluate_vendor_availability(
                        customer_avail,
                        vendor_avail,
                        vendor_id=vendor_id,
                    )
                    if diagnostics.get("busy_load_error"):
                        ctx.logger.warning(
                            "SCHEDULE_FILTER_BUSY_LOAD_ERROR  rid=%s  vendor=%s  vendor_id=%s  error=%s",
                            rid,
                            vendor_name,
                            vendor_id,
                            diagnostics.get("busy_load_error"),
                        )
                    date_checks = diagnostics.get("date_checks", [])
                    slot_checks = sum(
                        len(d.get("slot_checks", []))
                        for d in date_checks
                        if isinstance(d, dict)
                    )
                    ctx.logger.info(
                        "SCHEDULE_FILTER  rid=%s  vendor=%s  vendor_id=%s  available=%s  decision=%s  checked_dates=%d  checked_slots=%d  matched=%s@%s",
                        rid,
                        vendor_name,
                        vendor_id,
                        is_available,
                        diagnostics.get("decision"),
                        len(date_checks),
                        slot_checks,
                        diagnostics.get("matched_date", "-"),
                        diagnostics.get("matched_hour", "-"),
                    )
                    ctx.logger.debug(
                        "SCHEDULE_FILTER_DIAGNOSTICS  rid=%s  vendor=%s  diagnostics=%s",
                        rid,
                        vendor_name,
                        json.dumps(diagnostics, sort_keys=True),
                    )
                    if is_available:
                        available_vendors.add(va)
                    else:
                        unavailable_vendors.add(va)
            else:
                # Customer didn't specify availability → all pass
                available_vendors = set(matched)
                ctx.logger.info(
                    "SCHEDULE_FILTER_SKIPPED  rid=%s  reason=no_customer_slots  vendors=%s",
                    rid,
                    sorted(vendor_registry.get(va, {}).get("name", va) for va in matched),
                )

            # Include ALL matched vendors in the request (for counting)
            requests[rid] = {
                "customer": sender, **data,
                "vendors": matched, "closed": False, "vendor_states": {},
            }
            for va in matched:
                ensure_vendor_state(requests[rid], va)

            ctx.logger.info(
                "NEW REQUEST  rid=%s  service=%s  budget=$%s  matched=%d  "
                "available=%d  unavailable=%d  selector=%s  customer_slots=%d",
                rid, data["service"], data["budget"], len(matched),
                len(available_vendors), len(unavailable_vendors), selector_source, selected_slot_count,
            )
            _push_event({
                "type": "log",
                "agent": "orchestrator",
                "text": (
                    f"NEW REQUEST  service={data['service']}  budget=${data['budget']}  "
                    f"matched={len(matched)} vendors  selector={selector_source}"
                    + (f"  ({len(unavailable_vendors)} have no schedule overlap)"
                       if unavailable_vendors else "")
                ),
            })
            _push_event({
                "type": "step",
                "step": "matching",
                "status": "done",
                "detail": (
                    f"Matched {len(matched)} vendors for {data['service']}"
                    + (f" ({len(unavailable_vendors)} unavailable for your times)"
                       if unavailable_vendors else "")
                ),
                "vendor_count": len(matched),
                "vendor_names": [
                    vendor_registry.get(va, {}).get("name", va) for va in matched
                ],
            })
            await ctx.send(sender, make_chat_message(
                _status(rid, f"Matched {len(matched)} vendors for {data['service']}.")))

            # ── Immediately mark schedule-unavailable vendors ──
            for va in unavailable_vendors:
                vs = ensure_vendor_state(requests[rid], va)
                vs["active"] = False
                vs["outcome"] = "no_availability"
                vn = vendor_registry.get(va, {}).get("name", va)
                v_id = int(vendor_registry.get(va, {}).get("vendor_id") or 0)
                await ctx.send(sender, make_chat_message("\n".join([
                    "TYPE=vendor_result", f"RID={rid}", f"VENDOR={va}",
                    f"VENDOR_ID={v_id}",
                    f"VENDOR_NAME={vn}", "OUTCOME=no_availability",
                    "PRICE=0", "ROUNDS=0",
                    f"TEXT={vn} has no availability matching your schedule.",
                ])))
                ctx.logger.info(
                    "SCHEDULE UNAVAILABLE  rid=%s  vendor=%s", rid, vn
                )

            # ── If no vendors are available, close immediately ──
            if not available_vendors:
                requests[rid]["closed"] = True
                await ctx.send(sender, make_chat_message(
                    _terminated_msg(
                        rid,
                        "No vendors have availability matching your schedule.",
                    )
                ))
                return

            # ── Send RFQs only to available vendors ──
            for va in available_vendors:
                services = vendor_registry.get(va, {}).get("services", [])
                vendor_name = vendor_registry.get(va, {}).get("name", va)
                pricing_key = await pick_pricing_key(
                    requested_service=data["service"],
                    notes=data["notes"],
                    vendor_name=vendor_name,
                    vendor_services=services,
                    rid=rid,
                )
                ctx.logger.info(
                    "PRICING_KEY  rid=%s  vendor=%s  key=%r",
                    rid,
                    vendor_name,
                    pricing_key,
                )
                await ctx.send(va, make_chat_message("\n".join([
                    "TYPE=request", f"RID={rid}",
                    f"SERVICE={data['service']}", f"BUDGET={data['budget']}",
                    f"URGENCY={data['urgency']}", f"NOTES={data['notes']}",
                    f"PRICING_KEY={pricing_key}",
                    "TEXT=Please send your opening offer in natural language and include a price.",
                ])))
            return

        # ── everything below needs a valid RID ──
        rid = fields.get("RID", "")
        if not rid or rid not in requests:
            return
        req = requests[rid]
        if req["closed"]:
            return

        # ── vendor unavailable ──
        if mt == "vendor_unavailable":
            va = fields.get("VENDOR", sender)
            vs = ensure_vendor_state(req, va)
            vs["active"] = False
            vs["outcome"] = "unavailable"
            vn = vendor_registry.get(va, {}).get("name", va)
            v_id = int(vendor_registry.get(va, {}).get("vendor_id") or 0)
            if consensus_mode:
                await ctx.send(req["customer"], make_chat_message("\n".join([
                    "TYPE=vendor_result", f"RID={rid}", f"VENDOR={va}",
                    f"VENDOR_ID={v_id}",
                    f"VENDOR_NAME={vn}", "OUTCOME=unavailable", "PRICE=0", "ROUNDS=0",
                    f"TEXT={fields.get('TEXT', f'{vn} unavailable.')}",
                ])))
                await _check_all_resolved(ctx, rid, req)
            else:
                await ctx.send(req["customer"], make_chat_message(
                    _status(rid, fields.get("TEXT", f"Vendor {va} unavailable."))))
                if not any(ensure_vendor_state(req, v)["active"] for v in req["vendors"]):
                    req["closed"] = True
                    await ctx.send(req["customer"], make_chat_message(
                        _terminated_msg(rid, "All vendors unavailable or inactive.")))
            return

        # ── vendor quote / counter ──
        if mt == "vendor_message":
            va = fields.get("VENDOR", sender)
            if va not in req["vendors"]:
                return
            vs = ensure_vendor_state(req, va)
            if not vs["active"]:
                return
            price = int(fields["PRICE"]) if fields.get("PRICE", "").isdigit() else extract_price(text)
            vs["latest_vendor_price"] = price
            vs["rounds"] += 1
            if price > 0:
                vs["recent_vendor_prices"].append(price)
                vs["recent_vendor_prices"] = vs["recent_vendor_prices"][-5:]
            vn = vendor_registry.get(va, {}).get("name", "Vendor")
            mt_text = fields.get("TEXT", text)
            vs["transcript"].append(f"Vendor: {mt_text}")
            vs["transcript"] = vs["transcript"][-20:]
            ctx.logger.info("[Round %s] %s → $%s: %s", vs["rounds"], vn, price, mt_text)
            _push_event({
                "type": "log",
                "agent": "orchestrator",
                "text": f"[Round {vs['rounds']}] {vn} → ${price}: {mt_text}",
            })
            await ctx.send(req["customer"], make_chat_message("\n".join([
                "TYPE=vendor_message", f"RID={rid}", f"VENDOR={va}",
                f"PRICE={price}", f"TEXT={vn}: {mt_text}",
            ])))
            await _apply_convergence(ctx, rid, va, req, vs)
            return

        # ── customer counter-offer ──
        if mt == "customer_message":
            va = fields.get("VENDOR", "")
            if va not in req["vendors"]:
                return
            vs = ensure_vendor_state(req, va)
            if not vs["active"]:
                return
            price = int(fields["PRICE"]) if fields.get("PRICE", "").isdigit() else extract_price(text)
            vs["latest_customer_price"] = price
            if price > 0:
                vs["recent_customer_prices"].append(price)
                vs["recent_customer_prices"] = vs["recent_customer_prices"][-5:]
            mt_text = fields.get("TEXT", text)
            vs["transcript"].append(f"Customer: {mt_text}")
            vs["transcript"] = vs["transcript"][-20:]
            vn = vendor_registry.get(va, {}).get("name", va)
            ctx.logger.info("[Round %s] Customer → %s @ $%s: %s",
                            vs["rounds"], vn, price, mt_text)
            _push_event({
                "type": "log",
                "agent": "orchestrator",
                "text": f"[Round {vs['rounds']}] Customer → {vn} @ ${price}: {mt_text}",
            })
            await ctx.send(va, make_chat_message("\n".join([
                "TYPE=customer_message", f"RID={rid}", f"VENDOR={va}",
                f"PRICE={price}", f"TEXT={mt_text}",
            ])))
            await _apply_convergence(ctx, rid, va, req, vs)

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

    # ── Load vendors from Supabase for pre-seeding the registry ──
    _preloaded: list = []
    try:
        from db_helpers import load_all_vendors, vendor_row_to_agent_config, create_job
        _rows = load_all_vendors()
        for _r in _rows:
            _cfg = vendor_row_to_agent_config(_r)
            _preloaded.append({
                "vendor_id": _cfg["vendor_id"],
                "name": _cfg["name"],
                "services": _cfg["services"],
                "aggression": _cfg["aggression"],
            })
        print(f"[orchestrator] Pre-loaded {len(_preloaded)} vendors from Supabase")
    except Exception as _e:
        print(f"[orchestrator] Supabase pre-load skipped: {_e}")

    # ── Deal callback: write job to Supabase ──
    def _on_deal(**kwargs):
        try:
            from db_helpers import create_job as _cj
            _cj(
                vendor_id=kwargs.get("vendor_id") or 0,
                consumer_name=str(kwargs.get("consumer_addr", "unknown")),
                job_type=kwargs.get("service", "unknown"),
                price=kwargs.get("price", 0),
            )
        except Exception as exc:
            print(f"[orchestrator] Failed to write job to Supabase: {exc}")

    _agent = create_orchestrator_agent(
        seed=os.getenv("ORCHESTRATOR_SEED", "orchestrator_seed_treehacks_2026"),
        max_rounds=int(os.getenv("MAX_NEGOTIATION_ROUNDS", "8")),
        port=int(os.getenv("ORCHESTRATOR_PORT", "8001")),
        mailbox=True,
        network="testnet",
        readme_path="README_ORCHESTRATOR.md",
        publish_agent_details=True,
        preload_vendors=_preloaded if _preloaded else None,
        on_deal_callback=_on_deal,
    )
    fund_agent_if_low(_agent.wallet.address())
    _agent.run()
