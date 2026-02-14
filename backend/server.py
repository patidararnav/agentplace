"""
FastAPI bridge server for the agentplace frontend.

Architecture
────────────
•  On startup the server launches a **persistent orchestrator** and
   a pool of **persistent vendor agents**, each with its own Agentverse
   mailbox (mailbox=True, network="testnet").  They stay alive for the
   lifetime of the process and are discoverable on Agentverse / ASI:One.

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
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Ensure the backend package is importable
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from customer import create_customer_agent
from orchestrator import create_orchestrator_agent
from vendor import create_vendor_agent

load_dotenv()

# Fund helper — pays for Almanac registration on testnet
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
MAX_ROUNDS = int(os.getenv("MAX_NEGOTIATION_ROUNDS", "8"))

# Port range for ephemeral customer agents (one per session)
_CUSTOMER_PORT_START = 9200
_next_customer_port = _CUSTOMER_PORT_START

# Vendor definitions (each gets its own seed / port / mailbox)
VENDOR_DEFS = [
    {
        "name": "RapidRooter",
        "seed": "vendor_seed_rapid_rooter_2026",
        "port": 8101,
        "services": ["plumbing", "leaky faucet"],
        "base_prices": {"plumbing": 195, "leaky faucet": 160},
        "aggression": 2,
    },
    {
        "name": "BudgetFix",
        "seed": "vendor_seed_budget_fix_2026",
        "port": 8102,
        "services": ["plumbing", "electrical", "cleaning"],
        "base_prices": {"plumbing": 175, "electrical": 200, "cleaning": 120},
        "aggression": 1,
    },
    {
        "name": "PremiumPipes",
        "seed": "vendor_seed_premium_pipes_2026",
        "port": 8103,
        "services": ["plumbing", "septic tank", "roofing"],
        "base_prices": {"plumbing": 225, "septic tank": 500, "roofing": 400},
        "aggression": 4,
    },
]

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
_vendor_agents: list = []           # Persistent vendor Agents
_agent_tasks: list = []             # Background asyncio tasks running agents

# ─── In-memory session store ─────────────────────────────────────────────

sessions: Dict[str, Dict[str, Any]] = {}


# ─── Startup / Shutdown ──────────────────────────────────────────────────


@app.on_event("startup")
async def on_startup() -> None:
    """Create and launch the persistent orchestrator + vendor agents."""
    global _orchestrator_agent, _orchestrator_address

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
    )
    _orchestrator_address = _orchestrator_agent.address

    # Fund agents for Almanac registration (required on testnet)
    if fund_agent_if_low is not None:
        log.info("\033[33m[fund]\033[0m Checking orchestrator wallet…")
        try:
            fund_agent_if_low(_orchestrator_agent.wallet.address())
            log.info("\033[32m[fund]\033[0m Orchestrator funded OK")
        except Exception as exc:
            log.warning("\033[31m[fund]\033[0m Orchestrator funding failed: %s", exc)

    log.info(
        "\033[34m[orchestrator]\033[0m address=%s  port=%s  mailbox=True",
        _orchestrator_address, ORCHESTRATOR_PORT,
    )
    _agent_tasks.append(asyncio.create_task(_run_agent(_orchestrator_agent, "orchestrator")))

    # ── Vendors ──
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
        )

        # Fund vendor wallet for Almanac registration
        if fund_agent_if_low is not None:
            try:
                fund_agent_if_low(va.wallet.address())
            except Exception as exc:
                log.warning("\033[31m[fund]\033[0m %s funding failed: %s", vdef["name"], exc)

        _vendor_agents.append(va)
        log.info(
            "\033[32m[vendor]\033[0m %s  address=%s  port=%s  services=%s",
            vdef["name"], va.address, vdef["port"], vdef["services"],
        )
        _agent_tasks.append(asyncio.create_task(_run_agent(va, vdef["name"])))

    log.info(
        "\033[36m━━━ %d persistent agents launched (orchestrator + %d vendors) ━━━\033[0m",
        1 + len(_vendor_agents), len(_vendor_agents),
    )
    log.info(
        "\033[36m    Orchestrator: %s\033[0m", _orchestrator_address,
    )


@app.on_event("shutdown")
async def on_shutdown() -> None:
    """Cancel all background agent tasks."""
    log.info("\033[33mShutting down agents…\033[0m")
    for t in _agent_tasks:
        t.cancel()
    for t in _agent_tasks:
        with suppress(asyncio.CancelledError):
            await t


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
            await agent.run_async()
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
    )

    # Fund customer wallet for Almanac registration
    if fund_agent_if_low is not None:
        try:
            fund_agent_if_low(customer.wallet.address())
        except Exception as exc:
            log.warning("\033[31m[fund]\033[0m Customer %s funding failed: %s", session_id[:8], exc)

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
        await asyncio.wait_for(finished.wait(), timeout=180)
    except asyncio.TimeoutError:
        result["outcome"] = "timeout"
        result["outcome_text"] = "Negotiation timed out after 180s."
        log.warning("\033[33m[%s]\033[0m Timed out after 180s", session_id[:8])
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
        [v for v in vendor_results if v["outcome"] == "deal"],
        key=lambda v: v["price"],
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
        "vendors": [
            {"name": vdef["name"], "address": va.address}
            for vdef, va in zip(VENDOR_DEFS, _vendor_agents)
        ],
    }


# ─── Dynamic vendor registration ─────────────────────────────────────────

# Port counter for dynamically added vendor agents
_next_vendor_port = 8200


class CreateVendorRequest(BaseModel):
    name: str
    services: list[str]
    base_prices: Dict[str, int]
    aggression: int = 3


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
        "\033[35m[API]\033[0m POST /api/vendors  name=%s  services=%s  aggression=%s  port=%s",
        req.name, req.services, req.aggression, port,
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
    )

    # Fix event-loop mismatch (same issue as persistent agents)
    running_loop = asyncio.get_running_loop()
    if va._loop is not running_loop:
        va._loop = running_loop

    vdef = {
        "name": req.name,
        "seed": seed,
        "port": port,
        "services": req.services,
        "base_prices": req.base_prices,
        "aggression": req.aggression,
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


@app.get("/api/health")
async def health() -> Dict[str, str]:
    return {"status": "ok", "orchestrator": _orchestrator_address}
