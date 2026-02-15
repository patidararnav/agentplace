"""
FastAPI bridge server for the agentplace frontend.

Architecture
────────────
•  On startup the server launches a **persistent orchestrator** and
   one persistent vendor agent per vendor row in Supabase. Vendors can
   also be added manually via API and stay alive for the lifetime of
   the process.

•  Per negotiation request from the frontend the server spins up an
   **ephemeral customer agent** (also mailbox-registered) that talks to
   the orchestrator via Agentverse.  Events are streamed to the React
   frontend over a WebSocket so the UI updates in real time.

•  Every agent action is logged to the terminal with colour-coded output.

Usage
─────
    cd backend
    uvicorn server:app --reload --port 8080

    # Frontend (separate terminal):
    cd ../ && npm run dev          # Vite proxies /api + /ws → :8080
"""

from __future__ import annotations

import asyncio
import logging
import os
import sys
from contextlib import suppress
from typing import Any, Dict
from uuid import uuid4

from dotenv import load_dotenv
from fastapi import Body, FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Ensure the backend package is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from customer import create_customer_agent
from db_helpers import load_all_vendors, vendor_row_to_agent_config
from orchestrator import create_orchestrator_agent
from db_helpers import load_job
from buyer_agent import (
    StartPayment,
    SubmitPaymentProof,
    DeclinePayment,
    create_buyer_agent,
    get_payment_state,
    get_stored_request,
)
from vendor import create_vendor_agent
from uagents.communication import send_message
from uagents.resolver import GlobalResolver, Resolver
from uagents_core.identity import Identity

load_dotenv()

# Use API-only registration (fast, no testnet funds needed).
# The default policy also does ledger/blockchain registration which
# requires calling the faucet (~5 s per agent).  For local dev the
# Almanac REST API is sufficient for agent discovery.
from uagents.registration import AlmanacApiRegistrationPolicy

try:
    from uagents.setup import fund_agent_if_low
except ImportError:
    fund_agent_if_low = None  # type: ignore

# ─── Logging ──────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format=(
        "\033[90m%(asctime)s\033[0m %(levelname)-8s "
        "\033[1m%(name)s\033[0m: %(message)s"
    ),
    datefmt="%H:%M:%S",
)
# Show DEBUG for the uagents registration loop so we can see what's happening
logging.getLogger("uagents.registration").setLevel(logging.DEBUG)
logging.getLogger("uagents.agent").setLevel(logging.DEBUG)
log = logging.getLogger("server")

# ─── Configuration ────────────────────────────────────────────────────────

ORCHESTRATOR_SEED = os.getenv("ORCHESTRATOR_SEED", "orchestrator_seed_treehacks_2026")
ORCHESTRATOR_PORT = int(os.getenv("ORCHESTRATOR_PORT", "8001"))
VENDOR_PORT_START = int(os.getenv("VENDOR_PORT_START", "8100"))
MAX_ROUNDS = int(os.getenv("MAX_NEGOTIATION_ROUNDS", "5"))

BUYER_AGENT_PORT = int(os.getenv("BUYER_AGENT_PORT", "9300"))
# Identity used when the API sends CommitPayment / TriggerRequestPayment (buyer in payment protocol)
_API_PAYER_SEED = "api_payer_agentplace_2026"
_api_payer_identity: Identity | None = None


class _LocalAgentResolver(Resolver):
    """Resolves locally-running agents (buyer + all vendor agents) to their HTTP endpoints."""

    def __init__(self) -> None:
        self._endpoints: dict[str, str] = {}  # agent_address → http endpoint
        self._global = GlobalResolver()

    def register(self, address: str, endpoint: str) -> None:
        self._endpoints[address] = endpoint

    async def resolve(self, destination: str) -> tuple[str | None, list[str]]:
        ep = self._endpoints.get(destination)
        if ep:
            return destination, [ep]
        return await self._global.resolve(destination)

# Port range for ephemeral customer agents (one per session)
_CUSTOMER_PORT_START = 9200
_next_customer_port = _CUSTOMER_PORT_START

# Vendor definitions are populated from Supabase at startup.
VENDOR_DEFS: list[dict[str, Any]] = []

# ─── FastAPI app ──────────────────────────────────────────────────────────

app = FastAPI(title="AgentPlace Bridge")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Agent references (populated on startup) ─────────────────────────────

_orchestrator_agent = None          # The persistent orchestrator Agent
_orchestrator_address: str = ""     # Its Agentverse address
_buyer_agent = None                 # Buyer agent (payment protocol; receives RequestPayment)
_vendor_agents: list = []           # Persistent vendor Agents
_agent_tasks: list = []             # Background asyncio tasks running agents
_local_resolver: _LocalAgentResolver | None = None  # Resolver for buyer + all vendor agents

# ─── In-memory session store ─────────────────────────────────────────────

sessions: Dict[str, Dict[str, Any]] = {}


# ─── Startup / Shutdown ──────────────────────────────────────────────────


@app.on_event("startup")
async def on_startup() -> None:
    """Create and launch persistent orchestrator, buyer agent, and all Supabase vendor agents (each vendor is a payment seller)."""
    global _orchestrator_agent, _orchestrator_address, _buyer_agent, _api_payer_identity, _local_resolver

    log.info("\033[36m━━━ AgentPlace Server Starting ━━━\033[0m")

    # ── Orchestrator ──
    _orchestrator_agent = create_orchestrator_agent(
        seed=ORCHESTRATOR_SEED,
        max_rounds=MAX_ROUNDS,
        consensus_mode=True,
        port=ORCHESTRATOR_PORT,
        mailbox=True,
        network="testnet",
        publish_agent_details=True,
        registration_policy=AlmanacApiRegistrationPolicy(),
    )
    _orchestrator_address = _orchestrator_agent.address

    log.info(
        "\033[34m[orchestrator]\033[0m address=%s  port=%s  mailbox=True",
        _orchestrator_address, ORCHESTRATOR_PORT,
    )
    _agent_tasks.append(asyncio.create_task(_run_agent(_orchestrator_agent, "orchestrator")))

    # ── Buyer agent (payment protocol buyer; receives RequestPayment from vendor sellers) ──
    _local_resolver = _LocalAgentResolver()

    _buyer_agent = create_buyer_agent(
        seed=_API_PAYER_SEED,
        port=BUYER_AGENT_PORT,
        mailbox=False,
        network="testnet",
        resolve=_local_resolver,
    )
    _api_payer_identity = Identity.from_seed(_API_PAYER_SEED, 0)
    _local_resolver.register(_buyer_agent.address, f"http://127.0.0.1:{BUYER_AGENT_PORT}/submit")
    log.info(
        "\033[35m[buyer]\033[0m address=%s  port=%s  (payment protocol buyer)",
        _buyer_agent.address, BUYER_AGENT_PORT,
    )
    _agent_tasks.append(asyncio.create_task(_run_agent(_buyer_agent, "payment_buyer")))

    # ── Vendors (auto-load every vendor from Supabase) — each is a payment seller ──
    try:
        rows = load_all_vendors()
    except Exception as exc:
        rows = []
        log.warning("\033[31m[vendor]\033[0m Failed to load vendors from Supabase: %s", exc)

    global _next_vendor_port
    _next_vendor_port = VENDOR_PORT_START

    for row in rows:
        try:
            cfg = vendor_row_to_agent_config(row)
            services = [s for s in cfg["services"] if s]
            base_prices = cfg["base_prices"] or {}
            if not services:
                log.warning(
                    "\033[33m[vendor]\033[0m Skipping vendor_id=%s (%s): no services configured",
                    cfg["vendor_id"], cfg["name"],
                )
                continue

            # Ensure every service has a usable fallback price.
            for svc in services:
                if int(base_prices.get(svc, 0)) <= 0:
                    base_prices[svc] = 150

            port = _next_vendor_port
            _next_vendor_port += 1
            seed = f"vendor_supabase_{cfg['vendor_id']}_{port}"

            VENDOR_DEFS.append({
                "vendor_id": cfg["vendor_id"],
                "name": cfg["name"],
                "seed": seed,
                "port": port,
                "services": services,
                "base_prices": base_prices,
                "aggression": cfg["aggression"],
                "pricing_strategy": cfg.get("pricing_strategy", "maximize_jobs"),
                "weekly_availability": cfg.get("weekly_availability", {}),
            })
        except Exception as exc:
            log.warning("\033[33m[vendor]\033[0m Skipping malformed vendor row: %s", exc)

    for vdef in VENDOR_DEFS:
        va = create_vendor_agent(
            name=vdef["name"],
            seed=vdef["seed"],
            services=vdef["services"],
            base_prices=vdef["base_prices"],
            aggression=vdef["aggression"],
            orchestrator_address=_orchestrator_address,
            port=vdef["port"],
            mailbox=False,          # local endpoint only – no manual inspector setup
            network="testnet",
            publish_agent_details=False,
            registration_policy=AlmanacApiRegistrationPolicy(),
            weekly_availability=vdef.get("weekly_availability", {}),
            pricing_strategy=vdef.get("pricing_strategy", "maximize_jobs"),
            vendor_id=int(vdef.get("vendor_id", 0) or 0),
            resolve=_local_resolver,
        )

        _vendor_agents.append(va)
        _local_resolver.register(va.address, f"http://127.0.0.1:{vdef['port']}/submit")
        log.info(
            "\033[32m[vendor]\033[0m %s  address=%s  port=%s  services=%s  (seller)",
            vdef["name"], va.address, vdef["port"], vdef["services"],
        )
        _agent_tasks.append(asyncio.create_task(_run_agent(va, vdef["name"])))

    log.info(
        "\033[36m━━━ %d persistent agents launched (orchestrator + buyer + %d vendor-sellers) ━━━\033[0m",
        1 + 1 + len(_vendor_agents), len(_vendor_agents),
    )
    log.info(
        "\033[36m    Orchestrator: %s\033[0m", _orchestrator_address,
    )
    if not _vendor_agents:
        log.info("\033[33m[vendor]\033[0m No vendors launched from Supabase.")


@app.on_event("shutdown")
async def on_shutdown() -> None:
    """Cancel all background agent tasks."""
    log.info("\033[33mShutting down agents…\033[0m")
    for t in _agent_tasks:
        t.cancel()
    for t in _agent_tasks:
        with suppress(asyncio.CancelledError):
            await t


def _task_belongs_to_agent(task: asyncio.Task, agent: Any) -> bool:
    """
    Return True when an asyncio task belongs to the given uAgents agent.

    This lets us cancel only agent-owned background tasks during cleanup,
    instead of canceling every task in uvicorn's shared event loop.
    """
    coro = task.get_coro()
    frame = getattr(coro, "cr_frame", None)
    if frame is None:
        return False

    locals_map = frame.f_locals
    local_self = locals_map.get("self")
    if local_self is agent:
        return True

    agent_components = {
        component
        for component in (
            getattr(agent, "_server", None),
            getattr(agent, "_mailbox_client", None),
            getattr(agent, "_wallet_messaging_client", None),
            getattr(agent, "_dispenser", None),
        )
        if component is not None
    }
    if local_self is not None and local_self in agent_components:
        return True

    # Interval tasks are spawned by uagents._run_interval(context_factory=agent._build_context, ...)
    context_factory = locals_map.get("context_factory")
    if getattr(context_factory, "__self__", None) is agent:
        return True

    return False


async def _cancel_agent_tasks(agent: Any) -> None:
    """Cancel outstanding asyncio tasks owned by a specific agent."""
    current = asyncio.current_task()
    to_cancel = [
        t for t in asyncio.all_tasks()
        if t is not current and not t.done() and _task_belongs_to_agent(t, agent)
    ]
    for t in to_cancel:
        t.cancel()
    if to_cancel:
        await asyncio.gather(*to_cancel, return_exceptions=True)


async def _run_agent_once(agent: Any) -> None:
    """
    Run one uAgents lifecycle safely on the shared uvicorn loop.

    Mirrors uagents.Agent.run_async() without the problematic global
    asyncio.all_tasks() cancellation.
    """
    agent.setup()

    run_tasks: list[asyncio.Task] = []
    if not (agent._use_mailbox and not agent._rest_handlers):
        run_tasks.append(asyncio.create_task(agent.start_server()))
    if agent._use_mailbox and agent._mailbox_client is not None:
        run_tasks.append(asyncio.create_task(agent._mailbox_client.run()))

    try:
        await asyncio.gather(*run_tasks, return_exceptions=True)
    finally:
        with suppress(Exception):
            await agent._shutdown()
        await _cancel_agent_tasks(agent)


async def _run_agent(agent, label: str) -> None:
    """Run a single agent's async loop, restarting on transient errors."""
    # Fix: ensure the agent's internal loop reference matches the *running* loop.
    # Agent.__init__ captures the loop at construction time, but when running
    # inside uvicorn the actual loop may differ (e.g. uvloop).
    running_loop = asyncio.get_running_loop()
    if agent._loop is not running_loop:
        log.warning(
            "\033[33m[%s]\033[0m Loop mismatch detected! "
            "agent._loop=%s  running_loop=%s  — patching",
            label, id(agent._loop), id(running_loop),
        )
        agent._loop = running_loop

    while True:
        try:
            await _run_agent_once(agent)
            # If the agent exits unexpectedly without cancellation, restart it.
            log.warning("\033[33m[%s]\033[0m Agent exited unexpectedly — restarting in 1s", label)
            await asyncio.sleep(1)
        except asyncio.CancelledError:
            log.info("\033[33m[%s]\033[0m Agent task cancelled", label)
            raise
        except Exception as exc:
            log.error("\033[31m[%s]\033[0m Agent crashed: %s — restarting in 3s", label, exc)
            await asyncio.sleep(3)


# ─── Request / Response models ───────────────────────────────────────────


class NegotiateRequest(BaseModel):
    service: str = "plumbing"
    budget: int = 200
    urgency: int = 3
    aggression: int = 3
    notes: str = ""


class NegotiateResponse(BaseModel):
    session_id: str


# ─── Per-request negotiation ─────────────────────────────────────────────


async def run_negotiation(
    session_id: str,
    params: NegotiateRequest,
    event_queue: asyncio.Queue,
) -> None:
    """Spin up an ephemeral customer agent that negotiates via Agentverse."""
    global _next_customer_port

    log.info(
        "\033[36m[%s]\033[0m Starting negotiation  service=%s  budget=$%s  "
        "urgency=%s  aggression=%s  orchestrator=%s",
        session_id[:8], params.service, params.budget,
        params.urgency, params.aggression, _orchestrator_address[:20] + "…",
    )

    result: Dict[str, Any] = {
        "config": {
            "service": params.service,
            "budget": params.budget,
            "urgency": params.urgency,
            "customer_aggression": params.aggression,
            "vendors": [v["name"] for v in VENDOR_DEFS],
        }
    }
    finished = asyncio.Event()

    # ── Step: concierge ──
    event_queue.put_nowait({
        "type": "step", "step": "concierge", "status": "active",
        "detail": f"Parsing request: {params.service}, budget=${params.budget}",
    })
    event_queue.put_nowait({
        "type": "step", "step": "concierge", "status": "done",
        "detail": f"Job spec: {params.service}, budget=${params.budget}, urgency={params.urgency}/5",
    })

    # ── Step: matching ──
    event_queue.put_nowait({
        "type": "step", "step": "matching", "status": "active",
        "detail": f"Routing to orchestrator ({_orchestrator_address[:16]}…) via Agentverse mailbox…",
    })

    # ── Create ephemeral customer agent ──
    cust_port = _next_customer_port
    _next_customer_port += 1
    cust_seed = f"customer_ws_{session_id}"

    customer = create_customer_agent(
        name=f"web-{session_id[:8]}",
        seed=cust_seed,
        service=params.service.lower(),
        budget=params.budget,
        urgency=params.urgency,
        aggression=params.aggression,
        notes=params.notes or f"Requesting {params.service} service",
        orchestrator_address=_orchestrator_address,
        port=cust_port,
        mailbox=False,          # ephemeral – receives replies on local HTTP
        network="testnet",
        startup_delay=4.0,      # give vendors time to register
        result_sink=result,
        finished_event=finished,
        event_queue=event_queue,
        registration_policy=AlmanacApiRegistrationPolicy(),
    )

    # Fix event-loop mismatch (same issue as persistent agents)
    running_loop = asyncio.get_running_loop()
    if customer._loop is not running_loop:
        customer._loop = running_loop

    log.info(
        "\033[33m[%s]\033[0m Customer agent created  address=%s  port=%s  mailbox=False (ephemeral)",
        session_id[:8], customer.address, cust_port,
    )

    event_queue.put_nowait({
        "type": "step", "step": "matching", "status": "done",
        "detail": f"Customer agent registered on Agentverse, sending request to orchestrator",
    })
    event_queue.put_nowait({
        "type": "step", "step": "negotiation", "status": "active",
        "detail": "Agents negotiating with vendors via Agentverse mailbox…",
    })

    # ── Run the customer agent ──
    agent_task = asyncio.create_task(_run_agent(customer, f"customer-{session_id[:8]}"))
    try:
        await asyncio.wait_for(finished.wait(), timeout=90)
    except asyncio.TimeoutError:
        result["outcome"] = "timeout"
        result["outcome_text"] = "Negotiation timed out."
        log.warning("\033[33m[%s]\033[0m Timed out after 90s", session_id[:8])
    finally:
        agent_task.cancel()
        with suppress(asyncio.CancelledError):
            await agent_task

    # ── Wrap up ──
    event_queue.put_nowait({
        "type": "step", "step": "negotiation", "status": "done",
        "detail": "All negotiations complete",
    })
    event_queue.put_nowait({
        "type": "step", "step": "ranking", "status": "active",
        "detail": "Ranking final offers…",
    })

    vendor_results = result.get("vendor_results", [])
    deals = sorted(
        [v for v in vendor_results if v.get("outcome") == "deal"],
        key=lambda v: v.get("price", 0),
    )

    log.info(
        "\033[32;1m[%s]\033[0m Negotiation complete: %s  winner=%s  price=$%s  "
        "(%d deals, %d total vendor results)",
        session_id[:8],
        result.get("outcome", "unknown"),
        result.get("winner", "none"),
        result.get("winner_price", 0),
        len(deals), len(vendor_results),
    )

    # Re-push vendor results so the frontend has them even if earlier
    # vendor_result events were missed during the WebSocket stream.
    for vr in vendor_results:
        event_queue.put_nowait({"type": "vendor_result", **vr})

    event_queue.put_nowait({
        "type": "step", "step": "ranking", "status": "done",
        "detail": f"{len(deals)} deal(s) ranked",
    })

    event_queue.put_nowait({
        "type": "done",
        "outcome": result.get("outcome", "unknown"),
        "outcome_text": result.get("outcome_text", ""),
        "winner": result.get("winner", ""),
        "winner_price": result.get("winner_price", 0),
        "vendor_results": vendor_results,
        "config": result.get("config", {}),
    })

    sessions[session_id]["result"] = result
    sessions[session_id]["status"] = "done"


# ─── Routes ──────────────────────────────────────────────────────────────


@app.post("/api/negotiate", response_model=NegotiateResponse)
async def start_negotiation(req: NegotiateRequest) -> NegotiateResponse:
    """Start a new negotiation session and return its ID."""
    session_id = str(uuid4())
    event_queue: asyncio.Queue = asyncio.Queue()

    sessions[session_id] = {
        "status": "running",
        "params": req.model_dump(),
        "event_queue": event_queue,
        "result": None,
    }

    log.info(
        "\033[35m[API]\033[0m POST /api/negotiate  session=%s  service=%s  budget=$%s",
        session_id[:8], req.service, req.budget,
    )

    asyncio.create_task(run_negotiation(session_id, req, event_queue))
    return NegotiateResponse(session_id=session_id)


@app.websocket("/ws/negotiate/{session_id}")
async def negotiate_ws(ws: WebSocket, session_id: str) -> None:
    """Stream real-time negotiation events to the frontend."""
    await ws.accept()

    if session_id not in sessions:
        await ws.send_json({"type": "error", "text": "Session not found"})
        await ws.close()
        return

    session = sessions[session_id]
    event_queue: asyncio.Queue = session["event_queue"]

    log.info("\033[35m[WS]\033[0m Client connected  session=%s", session_id[:8])

    try:
        while True:
            try:
                event = await asyncio.wait_for(event_queue.get(), timeout=2.0)
                await ws.send_json(event)

                etype = event.get("type", "")
                if etype == "log":
                    log.info(
                        "\033[33m[%s]\033[0m \033[1m%s\033[0m: %s",
                        session_id[:8], event.get("agent", "?"), event.get("text", ""),
                    )
                elif etype == "negotiation_msg":
                    role = event.get("role", "?")
                    color = "\033[34m" if role == "customer-agent" else "\033[32m"
                    log.info(
                        "%s[%s]\033[0m %s @ $%s: %s",
                        color, session_id[:8], role,
                        event.get("price", 0), event.get("text", "")[:100],
                    )
                elif etype == "vendor_result":
                    log.info(
                        "\033[36m[%s]\033[0m VENDOR RESULT: %s [%s] $%s (%s rounds)",
                        session_id[:8],
                        event.get("vendor_name", "?"),
                        event.get("outcome", "?"),
                        event.get("price", 0),
                        event.get("rounds", 0),
                    )
                elif etype == "done":
                    log.info(
                        "\033[32;1m[%s] ✓ DONE\033[0m  outcome=%s  winner=%s  price=$%s",
                        session_id[:8],
                        event.get("outcome", "?"),
                        event.get("winner", "none"),
                        event.get("winner_price", 0),
                    )
                    await asyncio.sleep(0.5)
                    break

            except asyncio.TimeoutError:
                try:
                    await ws.send_json({"type": "heartbeat"})
                except Exception:
                    break

    except WebSocketDisconnect:
        log.info("\033[35m[WS]\033[0m Client disconnected  session=%s", session_id[:8])
    except Exception as e:
        log.error("\033[31m[WS]\033[0m Error  session=%s: %s", session_id[:8], e)


@app.get("/api/session/{session_id}")
async def get_session(session_id: str) -> Dict[str, Any]:
    """Polling fallback — returns current session status / result."""
    if session_id not in sessions:
        return {"error": "Session not found"}
    s = sessions[session_id]
    return {"status": s["status"], "params": s["params"], "result": s.get("result")}


@app.get("/api/agents")
async def list_agents() -> Dict[str, Any]:
    """Return the addresses of all persistent agents (for debugging)."""
    return {
        "orchestrator": _orchestrator_address,
        "payment_buyer": _buyer_agent.address if _buyer_agent else None,
        "vendors": [
            {"name": vdef["name"], "address": va.address, "role": "seller"}
            for vdef, va in zip(VENDOR_DEFS, _vendor_agents)
        ],
    }


@app.get("/api/agents/registration")
async def agent_registration() -> Dict[str, Any]:
    """
    Return addresses and endpoint URIs for Agent Inspector registration.
    Use this when you can't see backend logs — open in browser or curl.
    """
    return {
        "orchestrator": {
            "address": _orchestrator_address,
            "note": "Create a mailbox for this address in Agent Inspector.",
        },
        "vendors": [
            {
                "name": vdef["name"],
                "address": va.address,
                "endpoint_uri": f"http://127.0.0.1:{vdef['port']}",
                "role": "payment seller",
            }
            for vdef, va in zip(VENDOR_DEFS, _vendor_agents)
        ],
    }


# ─── Payment (FET) — thin wrappers; agents do the real work ────────────────


def _get_seller_for_job(job: Dict[str, Any]) -> tuple[Any, str, str, str] | None:
    """
    Find the vendor agent (seller) for a job.
    Returns (vendor_agent, address, wallet_address, vendor_name) or None.
    """
    vendor_id = int(job.get("vendor_id", 0) or 0)
    if not vendor_id:
        return None
    for vdef, va in zip(VENDOR_DEFS, _vendor_agents):
        if int(vdef.get("vendor_id", 0) or 0) == vendor_id:
            return va, va.address, str(va.wallet.address()), str(vdef.get("name", "Vendor"))
    return None


class CommitPaymentRequest(BaseModel):
    """Body for POST /api/jobs/:id/commit-payment."""
    transaction_id: str
    buyer_fet_wallet: str


class RejectPaymentRequest(BaseModel):
    """Body for POST /api/jobs/:id/reject-payment (optional)."""
    reason: str | None = None


@app.get("/api/jobs/{job_id}/payment-status")
async def payment_status(job_id: int) -> Dict[str, Any]:
    """
    Unified payment state endpoint.
    Returns buyer agent's state machine for this job: status, payment_request, events, error.
    The frontend polls this instead of separate event/status endpoints.
    """
    return get_payment_state(job_id)


@app.get("/api/jobs/{job_id}/payment-protocol-events")
async def get_payment_protocol_events(job_id: int) -> Dict[str, Any]:
    """Backward compat: return events from the buyer agent's state."""
    state = get_payment_state(job_id)
    return {"job_id": job_id, "events": state.get("events", [])}


@app.post("/api/jobs/{job_id}/request-payment")
async def request_payment(job_id: int) -> Dict[str, Any]:
    """
    Thin wrapper: tell the buyer agent to start payment for this job.
    The buyer agent autonomously contacts the vendor (seller).
    """
    if _api_payer_identity is None or _local_resolver is None or _buyer_agent is None:
        return {"error": "Payment system not ready"}
    job = load_job(job_id)
    if not job:
        return {"error": f"Job {job_id} not found"}

    seller = _get_seller_for_job(job)
    if seller is None:
        return {"error": "No vendor agent found for this job"}
    _, seller_address, seller_wallet, seller_name = seller

    description = f"AgentPlace job #{job_id} — {job.get('type', 'service')} (${job.get('price', 0)})"

    # Send StartPayment to the buyer agent — it handles the rest autonomously
    msg = StartPayment(
        job_id=job_id,
        seller_address=seller_address,
        seller_wallet=seller_wallet,
        seller_name=seller_name,
        description=description,
    )
    try:
        await send_message(
            destination=_buyer_agent.address,
            message=msg,
            response_type=None,
            sender=_api_payer_identity,
            resolver=_local_resolver,
            sync=False,
            timeout=10,
        )
    except Exception as e:
        log.warning("\033[35m[API]\033[0m request-payment → buyer agent failed: %s", e)
        return {"error": f"Failed to reach buyer agent: {e}"}

    log.info(
        "\033[35m[API]\033[0m POST /api/jobs/%s/request-payment → StartPayment sent to buyer agent (seller=%s)",
        job_id, seller_name,
    )
    return {"started": True, "job_id": job_id, "seller_name": seller_name}


@app.post("/api/jobs/{job_id}/reject-payment")
async def reject_payment(job_id: int, body: RejectPaymentRequest | None = Body(None)) -> Dict[str, Any]:
    """
    Thin wrapper: tell the buyer agent the customer declined.
    The buyer agent sends RejectPayment to the vendor autonomously.
    """
    if _api_payer_identity is None or _local_resolver is None or _buyer_agent is None:
        return {"success": False, "error": "Payment system not ready"}

    reason = (body.reason if body else None) or "Customer declined payment"
    msg = DeclinePayment(job_id=job_id, reason=reason)
    try:
        await send_message(
            destination=_buyer_agent.address,
            message=msg,
            response_type=None,
            sender=_api_payer_identity,
            resolver=_local_resolver,
            sync=False,
            timeout=10,
        )
    except Exception as e:
        log.warning("\033[35m[API]\033[0m reject-payment → buyer agent failed: %s", e)
        return {"success": False, "error": str(e)}

    log.info("\033[35m[API]\033[0m POST /api/jobs/%s/reject-payment → DeclinePayment sent to buyer agent", job_id)
    return {"success": True, "submitted": True}


@app.get("/api/payment-agent/status")
async def payment_agent_status() -> Dict[str, Any]:
    """Return whether vendor seller agents are ready (for UI)."""
    testnet = os.getenv("FET_USE_TESTNET", "true").lower() == "true"
    if not _vendor_agents:
        return {"ready": False, "recipient_address": None, "fet_network": None}
    return {
        "ready": True,
        "recipient_address": str(_vendor_agents[0].wallet.address()) if _vendor_agents else None,
        "fet_network": "stable-testnet" if testnet else "mainnet",
        "seller_count": len(_vendor_agents),
    }


@app.post("/api/jobs/{job_id}/commit-payment")
async def commit_payment(job_id: int, body: CommitPaymentRequest) -> Dict[str, Any]:
    """
    Thin wrapper: tell the buyer agent to send CommitPayment to the seller.
    The buyer agent sends the message and the vendor verifies on-chain.
    Poll GET /payment-status to see when CompletePayment or CancelPayment arrives.
    """
    log.info(
        "\033[35m[API]\033[0m POST /api/jobs/%s/commit-payment  tx=%s",
        job_id, body.transaction_id[:16] + "…" if len(body.transaction_id) > 16 else body.transaction_id,
    )
    if _api_payer_identity is None or _local_resolver is None or _buyer_agent is None:
        return {"success": False, "error": "Payment system not ready"}

    msg = SubmitPaymentProof(
        job_id=job_id,
        transaction_id=body.transaction_id,
        buyer_fet_wallet=body.buyer_fet_wallet,
    )
    try:
        await send_message(
            destination=_buyer_agent.address,
            message=msg,
            response_type=None,
            sender=_api_payer_identity,
            resolver=_local_resolver,
            sync=False,
            timeout=10,
        )
    except Exception as e:
        log.warning("\033[35m[API]\033[0m commit-payment → buyer agent failed: %s", e)
        return {"success": False, "error": f"Failed to reach buyer agent: {e}"}

    log.info(
        "\033[35m[API]\033[0m POST /api/jobs/%s/commit-payment → SubmitPaymentProof sent to buyer agent",
        job_id,
    )
    return {"submitted": True, "job_id": job_id}


# ─── Dynamic vendor registration ─────────────────────────────────────────

# Port counter for dynamically added vendor agents
_next_vendor_port = VENDOR_PORT_START


class CreateVendorRequest(BaseModel):
    vendor_id: int = 0
    name: str
    services: list[str]
    base_prices: Dict[str, int]
    aggression: int = 3
    pricing_strategy: str = "maximize_jobs"
    weekly_availability: Dict[str, Any] = Field(default_factory=dict)


class AddServiceRequest(BaseModel):
    vendor_name: str
    service_name: str
    job_type: str
    price: int = 0
    duration_minutes: int = 60


@app.post("/api/vendors")
async def register_vendor(req: CreateVendorRequest) -> Dict[str, Any]:
    """Dynamically spin up a new vendor agent and register it with the orchestrator."""
    global _next_vendor_port

    port = _next_vendor_port
    _next_vendor_port += 1
    seed = f"vendor_dynamic_{req.name.lower().replace(' ', '_')}_{port}"

    log.info(
        "\033[35m[API]\033[0m POST /api/vendors  name=%s  services=%s  aggression=%s  strategy=%s  port=%s",
        req.name, req.services, req.aggression, req.pricing_strategy, port,
    )

    va = create_vendor_agent(
        name=req.name,
        seed=seed,
        services=req.services,
        base_prices=req.base_prices,
        aggression=req.aggression,
        orchestrator_address=_orchestrator_address,
        port=port,
        mailbox=False,
        network="testnet",
        publish_agent_details=False,
        registration_policy=AlmanacApiRegistrationPolicy(),
        pricing_strategy=req.pricing_strategy,
        weekly_availability=req.weekly_availability or {},
        vendor_id=req.vendor_id or 0,
        resolve=_local_resolver,
    )

    # Fix event-loop mismatch (same issue as persistent agents)
    running_loop = asyncio.get_running_loop()
    if va._loop is not running_loop:
        va._loop = running_loop

    # Register with local resolver so buyer/API can reach this vendor seller
    if _local_resolver is not None:
        _local_resolver.register(va.address, f"http://127.0.0.1:{port}/submit")

    vdef = {
        "vendor_id": req.vendor_id,
        "name": req.name,
        "seed": seed,
        "port": port,
        "services": req.services,
        "base_prices": req.base_prices,
        "aggression": req.aggression,
        "pricing_strategy": req.pricing_strategy,
        "weekly_availability": req.weekly_availability or {},
    }
    VENDOR_DEFS.append(vdef)
    _vendor_agents.append(va)
    _agent_tasks.append(asyncio.create_task(_run_agent(va, req.name)))

    log.info(
        "\033[32;1m[API]\033[0m Vendor agent launched  name=%s  address=%s  port=%s  services=%s",
        req.name, va.address, port, req.services,
    )

    return {
        "name": req.name,
        "address": va.address,
        "port": port,
        "services": req.services,
        "pricing_strategy": req.pricing_strategy,
    }


@app.post("/api/vendors/service")
async def add_vendor_service(req: AddServiceRequest) -> Dict[str, Any]:
    """Add a service to an existing vendor agent (metadata only for now)."""
    log.info(
        "\033[35m[API]\033[0m POST /api/vendors/service  vendor=%s  service=%s  price=$%s",
        req.vendor_name, req.job_type, req.price,
    )

    # Find the matching vendor definition and update its services
    for vdef in VENDOR_DEFS:
        if vdef["name"].lower() == req.vendor_name.lower():
            if req.job_type not in vdef["services"]:
                vdef["services"].append(req.job_type)
            vdef["base_prices"][req.job_type] = req.price
            log.info(
                "\033[32m[API]\033[0m Updated vendor %s — services now: %s",
                vdef["name"], vdef["services"],
            )
            return {"status": "updated", "vendor": vdef["name"], "services": vdef["services"]}

    return {"status": "vendor_not_found", "vendor": req.vendor_name}


@app.get("/api/avg-price")
async def avg_price(query: str = "", service: str = "plumbing") -> Dict[str, Any]:
    """Return the average price of similar past jobs, using LLM matching.

    Accepts a raw user query (e.g. 'leaky faucet in my kitchen') and/or
    a service keyword.  The LLM decides which job types from the database
    are relevant, and the average price is computed over those types.
    """
    import json as _json
    from chat_utils import generate_text
    from db_helpers import compute_avg_price, get_all_job_types_with_prices

    rows = get_all_job_types_with_prices()
    if not rows:
        return {"avg_price": 0, "job_count": 0, "matched_types": [], "query": query or service}

    # Collect distinct job types
    distinct_types = sorted({
        (r.get("type") or "").strip()
        for r in rows
        if (r.get("type") or "").strip()
    })

    if not distinct_types:
        return {"avg_price": 0, "job_count": 0, "matched_types": [], "query": query or service}

    user_text = query.strip() if query.strip() else service

    # Ask the LLM which job types are relevant to this query
    system_prompt = (
        "You are a job-type classifier. Given a customer's service request and "
        "a list of job types from a database, return ONLY the job types that are "
        "relevant to what the customer needs.\n\n"
        "Rules:\n"
        '- Match by intent, not exact wording. "leaky faucet" matches "Plumbing Repair" and "Pipe Leak Fix".\n'
        "- Include all reasonably related types (e.g. for a plumbing issue, include all plumbing-related types).\n"
        "- Do NOT include clearly unrelated types.\n"
        '- Return ONLY a JSON array of matching type strings, e.g. ["Plumbing Repair","Pipe Leak Fix"]\n'
        "- No markdown, no explanation, just the JSON array."
    )
    user_prompt = (
        f"Customer request: {user_text}\n\n"
        f"Available job types in database:\n{_json.dumps(distinct_types)}\n\n"
        "Which job types are relevant? Return only the JSON array."
    )

    raw = await generate_text(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        fallback="[]",
        max_tokens=200,
        temperature=0.1,
    )

    log.info("\033[35m[API]\033[0m avg-price LLM response: %s", raw[:300])

    # Parse the LLM response
    import re as _re
    matched_types: list[str] = []
    # Strip markdown fences if present
    cleaned = _re.sub(r"^```(?:json)?\s*", "", raw.strip())
    cleaned = _re.sub(r"\s*```$", "", cleaned)
    try:
        parsed = _json.loads(cleaned)
        if isinstance(parsed, list):
            matched_types = [str(t).strip() for t in parsed if str(t).strip()]
    except Exception:
        # Fallback: try to find a JSON array in the response
        m = _re.search(r"\[.*?\]", cleaned, flags=_re.DOTALL)
        if m:
            try:
                parsed = _json.loads(m.group(0))
                if isinstance(parsed, list):
                    matched_types = [str(t).strip() for t in parsed if str(t).strip()]
            except Exception:
                pass

    # If LLM returned nothing, fall back to substring matching
    if not matched_types:
        needle = (service or user_text).strip().lower()
        for t in distinct_types:
            tl = t.lower()
            if needle in tl or tl in needle:
                matched_types.append(t)

    result = compute_avg_price(rows, matched_types)
    result["query"] = user_text

    log.info(
        "\033[35m[API]\033[0m GET /api/avg-price  query=%r  matched=%s  avg=$%s  count=%d",
        user_text, result["matched_types"], result["avg_price"], result["job_count"],
    )
    return result


@app.get("/api/health")
async def health() -> Dict[str, str]:
    return {"status": "ok", "orchestrator": _orchestrator_address}
