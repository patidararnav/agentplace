"""
Vendor agent for the agentplace negotiation marketplace.

Exports:
    vendor_floor_price()    – minimum acceptable price
    vendor_opening_price()  – first offer for a service request
    vendor_revised_price()  – revised price after a customer counter
    create_vendor_agent()   – factory returning a fully-wired Agent

Run standalone:  python vendor.py   (reads config from .env)
"""

import os
import random
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

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


def vendor_floor_price(
    base_prices: Dict[str, int],
    aggression: int,
    service: str,
    urgency: int,
) -> int:
    """Minimum price the vendor will accept."""
    base = base_prices.get(service, next(iter(base_prices.values()), 150))
    urgency_markup = max(0, urgency - 3) * 0.1
    discount = {1: 0.12, 2: 0.08, 3: 0.04, 4: 0.02, 5: 0.0}[aggression]
    return max(1, int(base * (1 + urgency_markup) * (1 - discount)))


def vendor_opening_price(
    base_prices: Dict[str, int],
    aggression: int,
    service: str,
    urgency: int,
) -> int:
    """Opening offer for a service request."""
    base = base_prices.get(service, next(iter(base_prices.values()), 150))
    markup = {1: 0.04, 2: 0.08, 3: 0.14, 4: 0.2, 5: 0.28}[aggression]
    urgency_markup = max(0, urgency - 3) * 0.1
    floor = vendor_floor_price(base_prices, aggression, service, urgency)
    return max(
        floor,
        int(base * (1 + markup + urgency_markup)) + random.randint(-4, 8),
    )


def vendor_revised_price(
    aggression: int,
    current: int,
    customer_price: int,
    floor: int,
) -> int:
    """Revised price after a customer counter-offer."""
    concession = {1: 0.58, 2: 0.46, 3: 0.34, 4: 0.22, 5: 0.14}[aggression]
    spread = max(0, current - customer_price)
    move = max(1, int(spread * concession))
    return max(floor, current - move + random.randint(-2, 2))


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
) -> Agent:
    """Return a fully-wired vendor Agent ready to run or add to a Bureau."""

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
            "services": ",".join(sorted(set(services))),
            "aggression": str(aggression),
            "protocol": "chat",
        }

    agent = Agent(**kwargs)
    supported = set(services)
    deal_state: Dict[str, Dict[str, Any]] = {}

    # ── LLM text generation ──

    sys_prompt = (
        f"You are {name}, a professional {', '.join(services)} service vendor. "
        f"Your negotiation style is {aggression}/5 (1 = very flexible, 5 = very firm). "
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
            svc = fields.get("SERVICE", "").strip().lower()
            urg = int(fields.get("URGENCY", "3")) if fields.get("URGENCY", "").isdigit() else 3
            if svc not in supported:
                await ctx.send(sender, make_chat_message("\n".join([
                    "TYPE=vendor_unavailable", f"RID={rid}",
                    f"VENDOR={agent.address}",
                    f"TEXT=I do not currently provide {svc}.",
                ])))
                return
            offer = vendor_opening_price(base_prices, aggression, svc, urg)
            deal_state[rid] = {"service": svc, "urgency": urg, "last_offer": offer}
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
            cp = int(fields["PRICE"]) if fields.get("PRICE", "").isdigit() else extract_price(text)
            if cp <= 0:
                cp = max(1, int(cur * 0.9))
            floor = vendor_floor_price(base_prices, aggression, svc, urg)
            new = vendor_revised_price(aggression, cur, cp, floor)
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

    _agent = create_vendor_agent(
        name=os.getenv("VENDOR_NAME", "LocalPlumbCo"),
        seed=os.getenv("VENDOR_SEED", "vendor_seed_treehacks_2026"),
        services=services_from_csv(os.getenv("VENDOR_SERVICES", "plumbing,leaky faucet")),
        base_prices=_parse_base_prices(
            os.getenv("VENDOR_BASE_PRICES", "plumbing:150,leaky faucet:180,septic tank:500")
        ),
        aggression=max(1, min(5, int(os.getenv("VENDOR_AGGRESSION", "2")))),
        orchestrator_address=os.getenv(
            "ORCHESTRATOR_ADDRESS",
            "agent1q0sewr2pg82xzuqzvj98usjdtc9zyrdlrgpsqh0gp4uw4cvh3ujp7452dwu",
        ),
        port=int(os.getenv("VENDOR_PORT", "8000")),
        mailbox=True,
        network="testnet",
        readme_path="README_VENDOR.md",
        publish_agent_details=True,
    )
    fund_agent_if_low(_agent.wallet.address())
    _agent.run()
