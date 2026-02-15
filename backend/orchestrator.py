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
from vendor_selector import VendorSelectorAgent


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
    if not service:
        for kw in ["plumbing", "leaky faucet", "septic tank", "electrical", "roofing"]:
            if kw in text.lower():
                service = kw
                break
    budget_s = fields.get("BUDGET", "")
    budget = int(budget_s) if budget_s.isdigit() else max(1, extract_price(text))
    urgency_s = fields.get("URGENCY", "")
    urgency = int(urgency_s) if urgency_s.isdigit() else 3
    return {
        "service": service or "plumbing",
        "budget": budget if budget > 0 else 200,
        "urgency": max(1, min(5, urgency)),
        "notes": fields.get("NOTES", ""),
    }


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

    Returns ``{day_name: [hour_ints]}`` e.g. ``{"Monday": [8, 9, 10]}``.
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
            date_obj = datetime.strptime(date_str, "%Y-%m-%d")
            day_name = date_obj.strftime("%A")  # "Monday", "Tuesday", etc.
        except ValueError:
            continue
        hours: List[int] = []
        for slot in slots_str.split(","):
            slot = slot.strip()
            if slot in _SLOT_TO_HOUR:
                hours.append(_SLOT_TO_HOUR[slot])
        if hours:
            if day_name not in result:
                result[day_name] = []
            result[day_name].extend(hours)
    return result


def check_availability_overlap(
    customer_availability: Dict[str, List[int]],
    vendor_availability: Dict[str, Any],
) -> bool:
    """Return True if any customer slot overlaps a vendor's schedule.

    *customer_availability*: ``{"Monday": [8, 9, 10]}`` (hours)
    *vendor_availability*: ``{"Monday": ["9:00-12:00", "13:00-17:00"]}``

    If either side has no data we assume there **is** overlap (optimistic).
    """
    if not customer_availability:
        return True  # customer didn't pick slots → assume OK
    if not vendor_availability:
        return True  # vendor has no schedule data → assume OK

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

    for day_name, customer_hours in customer_availability.items():
        vendor_day_raw = (
            vendor_availability.get(day_name)
            or vendor_availability.get(day_name.lower())
            or vendor_availability.get(day_name.upper())
        )
        vendor_slots = _normalize_vendor_slots(vendor_day_raw)
        if not vendor_slots:
            continue
        for slot_str in vendor_slots:
            if not isinstance(slot_str, str) or "-" not in slot_str:
                continue
            try:
                start_str, end_str = slot_str.split("-", 1)
                start_hour = int(start_str.split(":")[0])
                end_hour = int(end_str.split(":")[0])
            except (ValueError, IndexError):
                continue
            for hour in customer_hours:
                if start_hour <= hour < end_hour:
                    return True
    return False


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

        if action == "deal":
            vs["active"] = False
            vs["outcome"] = "deal"
            vs["deal_price"] = price

            if consensus_mode:
                await ctx.send(req["customer"], make_chat_message("\n".join([
                    "TYPE=vendor_result", f"RID={rid}", f"VENDOR={va}",
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
                    v_id = vendor_registry.get(va, {}).get('vendor_id')
                    on_deal_callback(
                        vendor_name=vn, vendor_id=v_id,
                        consumer_addr=req['customer'],
                        service=req['service'], price=price, rounds=vs['rounds'],
                    )
                if on_deal_callback:
                    v_id = vendor_registry.get(va, {}).get("vendor_id")
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
        print(f"[DEBUG] Orchestrator on_startup FIRED  address={agent.address}", flush=True)
        ctx.logger.info("Orchestrator ready  address=%s", agent.address)
        if not os.getenv("AGENTVERSE_KEY") and mailbox:
            ctx.logger.warning("AGENTVERSE_KEY is not set.")

    @chat_proto.on_message(model=ChatMessage)
    async def handle_chat(ctx: Context, sender: str, msg: ChatMessage) -> None:
        text = extract_text(msg)
        fields = parse_fields(text)
        mt = fields.get("TYPE", "").lower()
        print(f"[DEBUG] Orchestrator handle_chat  TYPE={mt}  sender={sender[:20]}…", flush=True)

        await ctx.send(sender, ChatAcknowledgement(
            timestamp=datetime.now(timezone.utc), acknowledged_msg_id=msg.msg_id))

        # ── vendor registration ──
        if mt == "vendor_register":
            va = fields.get("VENDOR", sender)
            avail_raw = fields.get("WEEKLY_AVAILABILITY", "")
            try:
                weekly_avail = json.loads(avail_raw) if avail_raw else {}
            except (json.JSONDecodeError, TypeError):
                weekly_avail = {}
            vendor_registry[va] = {
                "name": fields.get("NAME", "Vendor"),
                "services": services_from_csv(fields.get("SERVICES", "")),
                "aggression": fields.get("AGGRESSION", ""),
                "pricing_strategy": fields.get("STRATEGY", "maximize_jobs"),
                "sender": sender,
                "weekly_availability": weekly_avail,
            }
            ctx.logger.info("Registered vendor %s  services=%s",
                            fields.get("NAME", "Vendor"),
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
            matched, selector_source = await selector_agent.select(
                service=data["service"],
                notes=data["notes"],
                budget=data["budget"],
                vendor_registry=vendor_registry,
            )
            if not matched:
                await ctx.send(sender, make_chat_message(
                    _terminated_msg(rid, f"No vendors found for {data['service']}.")))
                return

            # ── Cross-check customer availability with vendor schedules ──
            customer_avail = parse_customer_availability(data.get("notes", ""))
            available_vendors: Set[str] = set()
            unavailable_vendors: Set[str] = set()

            if customer_avail:
                for va in matched:
                    vendor_avail = vendor_registry.get(va, {}).get(
                        "weekly_availability", {}
                    )
                    if check_availability_overlap(customer_avail, vendor_avail):
                        available_vendors.add(va)
                    else:
                        unavailable_vendors.add(va)
            else:
                # Customer didn't specify availability → all pass
                available_vendors = set(matched)

            # Include ALL matched vendors in the request (for counting)
            requests[rid] = {
                "customer": sender, **data,
                "vendors": matched, "closed": False, "vendor_states": {},
            }
            for va in matched:
                ensure_vendor_state(requests[rid], va)

            ctx.logger.info(
                "NEW REQUEST  rid=%s  service=%s  budget=$%s  matched=%d  "
                "available=%d  unavailable=%d  selector=%s",
                rid, data["service"], data["budget"], len(matched),
                len(available_vendors), len(unavailable_vendors), selector_source,
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
                await ctx.send(sender, make_chat_message("\n".join([
                    "TYPE=vendor_result", f"RID={rid}", f"VENDOR={va}",
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
            if consensus_mode:
                await ctx.send(req["customer"], make_chat_message("\n".join([
                    "TYPE=vendor_result", f"RID={rid}", f"VENDOR={va}",
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
