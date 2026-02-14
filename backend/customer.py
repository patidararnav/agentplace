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
    # ── simulation hooks (optional) ──
    startup_delay: float = 0.0,
    result_sink: Optional[Dict[str, Any]] = None,
    finished_event: Optional[asyncio.Event] = None,
) -> Agent:
    """Return a fully-wired customer Agent.

    If *result_sink* is provided the agent populates it with structured
    negotiation results (vendor_results, outcome, winner, etc.).
    If *finished_event* is provided the agent sets it once all negotiations
    are resolved.
    """

    kwargs: Dict[str, Any] = {"name": name.lower().replace(" ", "-"), "seed": seed}
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
            "role": "customer",
            "category": "agent_marketplace",
            "job_type": service,
            "max_price": str(budget),
            "urgency": str(urgency),
            "aggression": str(aggression),
            "protocol": "chat",
        }

    agent = Agent(**kwargs)

    rid = str(uuid4())
    counters: Dict[str, int] = {}
    deal_closed = False
    terminated = False

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
            "Sending request  RID=%s  service=%s  budget=$%s",
            rid, service, budget,
        )
        await ctx.send(orchestrator_address, make_chat_message(_request_text()))

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
            ctx.logger.info("STATUS: %s", fields.get("TEXT", text))
            _append("statuses", fields.get("TEXT", text))
            return

        # ── per-vendor result (consensus mode) ──
        if mt == "vendor_result":
            vn = fields.get("VENDOR_NAME", "?")
            outcome = fields.get("OUTCOME", "?")
            price_s = fields.get("PRICE", "0")
            rounds_s = fields.get("ROUNDS", "0")
            ctx.logger.info("VENDOR RESULT: %s  [%s]", vn, outcome)
            _append("vendor_results", {
                "vendor_name": vn,
                "vendor_address": fields.get("VENDOR", ""),
                "outcome": outcome,
                "price": int(price_s) if price_s.isdigit() else 0,
                "rounds": int(rounds_s) if rounds_s.isdigit() else 0,
                "text": fields.get("TEXT", text),
            })
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
            _finish()
            return

        # ── terminated ──
        if mt == "terminated":
            txt = fields.get("TEXT", text)
            ctx.logger.info("TERMINATED: %s", txt)
            _append("terminations", txt)
            if any(p in txt for p in [
                "All vendor negotiations ended",
                "All vendors unavailable",
                "No vendors found",
            ]):
                terminated = True
                _record("outcome", "no_deal")
                _record("outcome_text", txt)
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

        body = await _customer_text(cp, vp)
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

    _agent = create_customer_agent(
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
