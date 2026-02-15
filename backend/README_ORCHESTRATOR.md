# Orchestrator Agent — AgentPlace Marketplace

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

## TreeHacks 2026 — Fetch.ai Challenge

This is the **Orchestrator agent** for the TreeHacks 2026 submission.

**Agent Address:** `agent1q0sewr2pg82xzuqzvj98usjdtc9zyrdlrgpsqh0gp4uw4cvh3ujp7452dwu`

## What this agent does

The Orchestrator is the control-plane agent for AgentPlace. It:

1. Receives a structured service request from the customer agent.
2. Loads and matches vendor agents by service capability.
3. Routes negotiation messages through a structured multi-step workflow.
4. Tracks per-vendor negotiation state (active, deal, terminated, timeout).
5. Applies dual convergence logic:
   - fast local pricing heuristics,
   - ASI:One LLM arbitration for ambiguous / non-monotonic negotiation cases.
6. Produces a consensus outcome and forwards best-result summaries.
7. Emits real-time events for frontend visibility.

## Agentverse / protocol compliance

- Chat Protocol implemented with:
  - `ChatMessage`
  - `ChatAcknowledgement`
  - `chat_protocol_spec`
- Mailbox enabled (`publish_agent_details=True`) so it can be discovered and routed by Agentverse/ASI:One.
- Discoverable endpoint setup supported via Agent Inspector for TreeHacks and judge evaluation.

## Inputs handled

- `service`: service keyword extracted from the user request (`plumbing`, `cleaning`, etc.)
- `budget`: user budget constraint
- `urgency`: 1–5 urgency score
- `notes`: free text requirements / context
- optional negotiation context carried in message transcripts

## Outputs / side effects

- Vendor assignment and dispatch events
- Real-time bid updates per vendor
- Convergence state transitions (continue/deal/terminate)
- Final best-deal ranking event for the customer and frontend
- Persistent status events suitable for WS streaming and dashboard rendering

## Message flow (high level)

1. Customer agent sends job request to orchestrator.
2. Orchestrator matches compatible vendors from in-memory registry + DB-backed vendor set.
3. Each vendor receives the request and replies with offers through Chat Protocol messages.
4. Customer agent counteroffers and accepts/rejects as needed.
5. Orchestrator checks for convergence.
6. If converged, orchestrator sends final outcome to each active party.

## Environment configuration

`backend/.env` supports:

- `AGENTVERSE_KEY` (required)
- `CLAUDE_API_KEY` or `ASI1_API_KEY` (LLM provider)
- `ORCHESTRATOR_SEED` (default seed available in env example)
- `ORCHESTRATOR_PORT` (default: `8001`)

## Local run

The orchestrator is usually launched by the backend bridge:

```bash
cd backend
source venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8080
```

Startup logs should include entries like:

- `Orchestrator ... address=agent1q... mailbox=True`
- `━━━ 4 persistent agents launched ... ━━━` (or more, depending on vendors)

## Agentverse registration (manual)

1. Start backend once.
2. Copy Orchestrator address from logs.
3. In Agent Inspector, register the address and local URI (`http://127.0.0.1:8001` or public equivalent).
4. Confirm discoverability via your expected Agentverse view.

## How to verify protocol discovery

- Ensure `mailbox=True` on startup logs.
- Confirm Agent Inspector contains a live entry for the orchestrator.
- Send/receive a simple negotiation request through frontend and observe WS event stream updates.

## API references used with this agent

From the same codebase:

- `POST /api/negotiate`
- `WS /ws/negotiate/{session_id}`
- `POST /api/vendors`
- `GET /api/agents`
- `GET /api/agents/registration`

## Why this fits TreeHacks judging

- **Functionality & technical implementation:** multi-agent negotiation pipeline with convergence state handling.
- **Use of Fetch.ai technology:** Chat Protocol + Agentverse registration + ASI:One-backed arbitration.
- **Impact:** marketplace bargaining automation with transparent, machine-readable outcomes.
- **Presentation readiness:** event-streamed status updates suitable for demo walkthrough.

## Notes

- This orchestrator README is scoped to the TreeHacks/Fetch.ai agent submission format.
- Keep this file in this repository for judges to find agent identity and behavior quickly.
