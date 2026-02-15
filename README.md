# AgentPlace — AI-Powered Service Marketplace

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

> **TreeHacks 2026 — Agent Place**

AgentPlace is a multi-agent marketplace for home services (plumbing, electrical, cleaning, etc.) where an end user negotiates in natural language and gets live, AI-mediated outcomes.

- Customer requests and budgets are parsed into a structured job.
- The Orchestrator routes jobs to matching vendors.
- Vendor agents negotiate pricing and scope.
- Customer agent counters and accepts deals.
- Converged outcomes flow into booking + fulfillment, with optional FET payment via Agent Payment Protocol.

## Agent roles and responsibilities

### 1) Orchestrator Agent
- Receives customer jobs.
- Finds matching vendors by service.
- Routes messages to vendors and tracks each negotiation loop.
- Runs convergence logic and chooses the best completed deal.
- Emits real-time progress events.
- Uses Claude LLM as backend for negotiation logic.

### 2) Vendor Agent(s)
- One per vendor (persistent vendors loaded from DB + dynamic creation).
- Replies with initial offer and counter-offers based on configured pricing/strategy.
- Handles negotiation messages from orchestrator/customer.

### 3) Customer Agent
- Represents the user in negotiation.
- Sends request, evaluates vendor terms, and sends counter-offers.
- Returns completion/accept outcome back to orchestrator.

### 4) Buyer/Payment Agent (platform-side)
- Supports optional FET monetization.
- Receives payment requests and verifies commit proofs via on-chain checks.
- Sends payment protocol events (`RequestPayment`, `CommitPayment`, `CompletePayment`, `CancelPayment`).

## Protocols and standards used

- **Fetch.ai Chat Protocol**: implemented in orchestrator, customer, and vendor agents.
- **ASI:One LLM**: used for negotiation/referee logic.
- **Fetch.ai Agentverse**: mailbox/discoverability for orchestrator and payment agent.
- **Agent Payment Protocol**: implemented (optional monetization flow).

## High-level workflow

1. User submits request on frontend (`/api/negotiate`).
2. Backend creates/uses an ephemeral customer agent.
3. Orchestrator selects matching vendor agents and opens negotiation channels.
4. Agents exchange chat messages via protocol.
5. Orchestrator decides per-vendor convergence and winner selection.
6. Frontend receives live events through WebSocket and renders:
   - negotiation progress
   - best quotes
   - job outcome + status.
7. If enabled, completion step can trigger FET payment flow.

## Project structure

```text
agentplace/
├── backend/
│   ├── server.py            # FastAPI bridge + websocket + agent lifecycle
│   ├── orchestrator.py      # Orchestrator logic
│   ├── customer.py          # Customer agent factory/behaviors
│   ├── vendor.py            # Vendor agent factory/negotiation/payment handling
│   ├── buyer_agent.py       # Payment buyer-side protocol handler
│   ├── payment_agent.py     # Shared payment models + verification helpers
│   ├── chat_utils.py        # Chat parsing and message helpers
│   ├── scripts/             # Utility scripts (e.g., sample vendor bootstrap)
│   └── ...
├── backend/README_ORCHESTRATOR.md
├── backend/README_CUSTOMER.md
├── backend/README_VENDOR.md
├── src/                    # Frontend (React + Vite)
└── package.json
```

## Quick start

### 1) Install dependencies

```bash
python3 -m venv backend/venv
source backend/venv/bin/activate
pip install -r backend/requirements.txt

npm install
```

### 2) Configure environment

```bash
cp backend/.env.example backend/.env
```

At minimum:

- `AGENTVERSE_KEY`
- `CLAUDE_API_KEY` (or set `LLM_PROVIDER=asi` + `ASI1_API_KEY`)

### 3) Start backend and frontend

```bash
# If you hit SSL certificate issues on macOS, run:
# export SSL_CERT_FILE=$(python -c "import certifi; print(certifi.where())")

# Backend
cd backend
source venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8080

# Frontend (new terminal)
cd ..
npm run dev
```

Frontend: `http://localhost:5173`

Backend/API: `http://localhost:8080`

## Useful endpoints

- `POST /api/negotiate` — start a negotiation session
- `WS /ws/negotiate/:session_id` — live negotiation stream
- `GET /api/session/:session_id` — session details
- `POST /api/vendors` — register a vendor agent
- `GET /api/agents` — running agent list
- `POST /api/jobs/{job_id}/request-payment` — trigger payment details
- `POST /api/jobs/{job_id}/commit-payment` — submit FET proof
- `GET /api/jobs/{job_id}/payment-status` — payment state

## Agentverse submission checklist

- Add this repo link + public URL in your TreeHacks submission fields.
- Keep `README`s with:
  - badges for Innovation Lab + Hackathon,
  - agent addresses and key behavior,
  - protocol stack and run instructions.
- For a full demo submission, include:
  - live code link,
  - 3–5 minute demo video,
  - any required API keys or setup notes for judges (non-secret placeholders only).

## Deployment notes

- Run both services on the same machine for demo simplicity (current architecture expects one backend plus one frontend).
- Browser real-time updates come from websocket events + API polling fallback.
- Supabase is used for persistence of vendors, consumers, and jobs.

## License

MIT
