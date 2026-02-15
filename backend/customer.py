"""
Customer agent for the agentplace negotiation marketplace.

Exports:
    customer_counter_price()  – compute a counter-offer
    create_customer_agent()   – factory returning a fully-wired Agent

Run standalone:  python customer.py   (reads config from .env)
"""

import asyncio
import os
import random
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
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


# ─── Counter-offer Logic (pure, importable) ──────────────────────────────


def customer_counter_price(
    budget: int,
    aggression: int,
    vendor_price: int,
    previous_counter: int,
) -> int:
    """Compute a counter-offer price given the vendor's latest price."""
    pressure = {1: 0.03, 2: 0.06, 3: 0.1, 4: 0.13, 5: 0.16}[aggression]
    target = int(budget * (1 - pressure))
    midpoint = int((vendor_price + target) / 2)
    proposal = min(budget, midpoint + random.randint(-2, 2))
    floor = int(budget * 0.7)
    proposal = max(floor, proposal)
    if previous_counter > 0:
        proposal = min(budget, max(proposal, previous_counter + random.randint(0, 2)))
    return proposal


# ─── Agent Factory ───────────────────────────────────────────────────────


def create_customer_agent(
    *,
    name: str = "customer",
    seed: str,
    service: str,
    budget: int,
    urgency: int = 3,
    aggression: int = 3,
    notes: str = "",
    orchestrator_address: str,
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
            "aggression": str(aggression),
            "protocol": "chat",
        }

    if registration_policy is not None:
        kwargs["registration_policy"] = registration_policy

    agent = Agent(**kwargs)

    rid = str(uuid4())
    counters: Dict[str, int] = {}
    deal_closed = False
    terminated = False
    expected_vendors: List[int] = [0]       # mutable; set from "Matched N vendors" status
    vendor_result_count: List[int] = [0]    # mutable; incremented on each vendor_result

    # ── LLM text generation ──

    sys_prompt = (
        f"You are a customer looking for {service} services. "
        f"Your maximum budget is ${budget} and your urgency is {urgency}/5. "
        f"Your negotiation style is {aggression}/5 (1 = very agreeable, 5 = very tough). "
        "Write brief, natural responses (1-3 sentences). You MUST mention the exact dollar "
        "amount given to you. Do NOT include any KEY=VALUE lines — write like a real person."
    )

    async def _customer_text(counter_price: int, vendor_price: int) -> str:
        if vendor_price <= budget:
            return await generate_text(
                sys_prompt,
                f"The vendor quoted ${vendor_price} which is within your budget of ${budget}. "
                "Accept the deal. Sound genuinely pleased.",
                f"That works for me at ${vendor_price}. Let's close this.",
            )
        return await generate_text(
            sys_prompt,
            f"The vendor quoted ${vendor_price} which is over your budget of ${budget}. "
            f"You want to counter at ${counter_price}. Write a friendly but firm counter-offer.",
            f"I appreciate the offer but could we do ${counter_price}?",
        )

    def _request_text() -> str:
        return "\n".join([
            "TYPE=request",
            f"RID={rid}",
            f"SERVICE={service}",
            f"BUDGET={budget}",
            f"URGENCY={urgency}",
            f"NOTES={notes}",
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
        print(f"[DEBUG] Customer {name} on_startup FIRED", flush=True)
        if not os.getenv("AGENTVERSE_KEY") and mailbox:
            ctx.logger.warning("AGENTVERSE_KEY is not set.")
        if startup_delay > 0:
            ctx.logger.info("Waiting %.1fs for vendors to register...", startup_delay)
            await asyncio.sleep(startup_delay)
        ctx.logger.info(
            "Sending request  RID=%s  service=%s  budget=$%s",
            rid, service, budget,
        )
        print(f"[DEBUG] Customer {name} sending request to orchestrator...", flush=True)
        result = await ctx.send(orchestrator_address, make_chat_message(_request_text()))
        print(f"[DEBUG] Customer {name} ctx.send() returned: {result}", flush=True)

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
            ctx.logger.info("VENDOR RESULT: %s  [%s]", vn, outcome)
            vr = {
                "vendor_name": vn,
                "vendor_address": fields.get("VENDOR", ""),
                "outcome": outcome,
                "price": int(price_s) if price_s.isdigit() else 0,
                "rounds": int(rounds_s) if rounds_s.isdigit() else 0,
                "text": fields.get("TEXT", text),
            }
            _append("vendor_results", vr)
            _push_event({"type": "vendor_result", **vr})

            # ── Auto-finish when ALL vendors have reported ──
            vendor_result_count[0] += 1
            ctx.logger.info(
                "Vendor results: %d / %d expected",
                vendor_result_count[0], expected_vendors[0],
            )
            if expected_vendors[0] > 0 and vendor_result_count[0] >= expected_vendors[0]:
                ctx.logger.info("All %d vendor results received — finishing", expected_vendors[0])
                all_results = result_sink.get("vendor_results", []) if result_sink else []
                deals = [r for r in all_results if r.get("outcome") == "deal"]
                if deals:
                    best = min(deals, key=lambda d: d.get("price", float("inf")))
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
            if any(p in txt for p in [
                "All vendor negotiations ended",
                "All vendors unavailable",
                "No vendors found",
            ]):
                terminated = True
                _record("outcome", "no_deal")
                _record("outcome_text", txt)
                _push_event({"type": "done", "outcome": "no_deal", "text": txt})
                _finish()
            return

        # ── vendor message → counter-offer ──
        if mt != "vendor_message":
            return
        if deal_closed or terminated:
            return

        va = fields.get("VENDOR", "")
        if not va:
            return

        vp = int(fields["PRICE"]) if fields.get("PRICE", "").isdigit() else extract_price(text)
        prev = counters.get(va, 0)
        cp = customer_counter_price(budget, aggression, vp, prev)
        if vp <= budget:
            cp = vp
        counters[va] = cp

        # Push vendor message event
        vendor_text = fields.get("TEXT", text)
        _push_event({
            "type": "negotiation_msg",
            "role": "vendor-agent",
            "vendor_address": va,
            "vendor_name": vendor_text.split(":")[0] if ":" in vendor_text else "Vendor",
            "price": vp,
            "text": vendor_text,
        })

        body = await _customer_text(cp, vp)

        # Push customer counter event
        _push_event({
            "type": "negotiation_msg",
            "role": "customer-agent",
            "vendor_address": va,
            "price": cp,
            "text": body,
        })

        await ctx.send(
            orchestrator_address,
            make_chat_message("\n".join([
                "TYPE=customer_message",
                f"RID={rid}",
                f"VENDOR={va}",
                f"PRICE={cp}",
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
        aggression=max(1, min(5, int(os.getenv("CUSTOMER_AGGRESSION", "3")))),
        notes=os.getenv(
            "CUSTOMER_NOTES",
            "Need someone reliable and quick. Please include labor/materials in quote.",
        ),
        orchestrator_address=os.getenv(
            "ORCHESTRATOR_ADDRESS",
            "agent1q0sewr2pg82xzuqzvj98usjdtc9zyrdlrgpsqh0gp4uw4cvh3ujp7452dwu",
        ),
        port=int(os.getenv("CUSTOMER_PORT", "8002")),
        mailbox=True,
        network="testnet",
        readme_path="README_CUSTOMER.md",
        publish_agent_details=True,
    )
    fund_agent_if_low(_agent.wallet.address())
    _agent.run()
