# AgentPlace — AI-Powered Service Marketplace

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

> **TreeHacks 2026 — Fetch.ai Challenge**
>
> A multi-agent marketplace where autonomous AI agents negotiate home-service deals in natural language, powered by ASI:One LLM and deployed on Agentverse.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Quick Start (Local Dev)](#quick-start-local-dev)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)
- [Key Features](#key-features)
- [License](#license)

---

## How It Works

A **customer** asks for a service (e.g. "I need a plumber, budget $200"). The system:

1. **Customer Agent** sends the request to the **Orchestrator Agent** via the Fetch.ai Chat Protocol.
2. **Orchestrator** matches the request against its live **Vendor Registry** and fans out the job to every qualifying vendor.
3. Each **Vendor Agent** generates a natural-language opening offer (priced by configurable aggression and base rates) using the **ASI:One LLM**.
4. The **Customer Agent** reviews each vendor's quote. If over budget, it produces a counter-offer (also LLM-generated). If within budget, it accepts.
5. After each round, the **Orchestrator** checks convergence — using both a fast-path price-gap heuristic and an **ASI:One LLM referee** that reads the full negotiation transcript.
6. Once all vendors resolve (deal, terminated, or unavailable), the Orchestrator picks the **best deal** (lowest price) and notifies all parties.
7. The React frontend receives every event in real time via WebSocket and displays the live orchestration.

---

## Architecture

```
Browser (React + Vite)
  │
  │  HTTP POST /api/negotiate       WebSocket /ws/negotiate/:id
  │  HTTP POST /api/vendors          ↕ real-time events
  ▼
┌─────────────────────────────────────────────────────────────────┐
│  FastAPI Bridge Server  (uvicorn :8080)                         │
│                                                                 │
│  ┌──────────────┐    ┌────────────┐ ┌────────────┐ ┌────────┐  │
│  │ Orchestrator │◄──►│ Vendor A   │ │ Vendor B   │ │Vendor C│  │
│  │ (mailbox=T)  │    │ (local)    │ │ (local)    │ │(local) │  │
│  │ port 8001    │    │ port 8101  │ │ port 8102  │ │  8103  │  │
│  └──────┬───────┘    └────────────┘ └────────────┘ └────────┘  │
│         │                                                       │
│         │  Per-request:                                         │
│  ┌──────▼────────┐                                              │
│  │ Customer Agent │  (ephemeral, local, mailbox=False)          │
│  │ port 9200+     │                                             │
│  └────────────────┘                                             │
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────┐                                                │
│  │   ASI:One   │  LLM for negotiation text + convergence        │
│  │     LLM     │                                                │
│  └─────────────┘                                                │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
   Agentverse (testnet)
   Orchestrator mailbox registered + discoverable via ASI:One
```

**Agent registration strategy:**

| Agent | Mailbox | Endpoint | Setup |
|-------|---------|----------|-------|
| **Orchestrator** | `mailbox=True` (Agentverse) | Mailbox | One-time manual setup via [Agent Inspector](https://agentverse.ai/inspect) |
| **Payment agent** | `mailbox=True` (Agentverse) | `http://127.0.0.1:8300` (or your server URL) | Register address + endpoint in [Agent Inspector](https://agentverse.ai/inspect) |
| **Vendor agents** | `mailbox=False` | `http://127.0.0.1:<port>/submit` | Automatic — no manual setup |
| **Customer agents** | `mailbox=False` | `http://127.0.0.1:<port>/submit` | Automatic — ephemeral, created per request |

---

## Prerequisites

| Dependency | Version | Notes |
|------------|---------|-------|
| **Python** | 3.11+ | Backend agents + FastAPI server |
| **Node.js** | 20.19+ or 22+ | Vite requires modern Node |
| **npm** | 9+ | Frontend package manager |
| **Agentverse API key** | — | Get one at [agentverse.ai](https://agentverse.ai) |
| **ASI:One API key** | — | Get one at [asi1.ai/dashboard/api-keys](https://asi1.ai/dashboard/api-keys) |

---

## Quick Start (Local Dev)

### 1. Clone and install

```bash
git clone https://github.com/your-team/agentplace.git
cd agentplace
```

**Backend (Python):**

```bash
cd backend
python3 -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**Frontend (Node):**

```bash
# From the project root (not backend/)
npm install
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and fill in your keys:

```env
AGENTVERSE_KEY=your_agentverse_key_here
ASI1_API_KEY=your_asi1_api_key_here
```

### 3. SSL fix (macOS)

If you see `SSL: CERTIFICATE_VERIFY_FAILED` errors, run this before starting the backend:

```bash
export SSL_CERT_FILE=$(python -c "import certifi; print(certifi.where())")
```

### 4. Set up Agentverse (one-time)

Two agents use Agentverse and need manual registration in [Agent Inspector](https://agentverse.ai/inspect):

**Orchestrator**

1. Start the backend once (step 5 below).
2. Copy the orchestrator's address from the terminal logs (e.g. `Orchestrator … address=agent1q...`).
3. In Agent Inspector, create a mailbox for that address.
4. Restart the backend. You should see `Successfully registered as mailbox agent in Agentverse`.

**Payment agent** (for FET on-chain payment verification)

1. After the backend has started, copy the payment agent's address from the logs (e.g. `Payment agent … address=agent1q...`).
2. In Agent Inspector, add the payment agent with that **address** and **endpoint URI** `http://127.0.0.1:8300` (or your server's public URL and port in production).
3. Demo payers need testnet FET; use the [Fetch.ai Testnet Faucet](https://companion.sandbox-london-b.fetch-ai.com/dorado-1/agents#Agents) if needed.

### 5. Start the backend

```bash
cd backend
source venv/bin/activate
uvicorn server:app --port 8080 --host 0.0.0.0
```

You'll see color-coded terminal output:

```
━━━ AgentPlace Server Starting ━━━
[orchestrator]  address=agent1q0sewr2...  port=8001  mailbox=True
[vendor]  RapidRooter   address=agent1qvm5r...  port=8101
[vendor]  BudgetFix     address=agent1qgdh...   port=8102
[vendor]  PremiumPipes  address=agent1qga0...   port=8103
━━━ 4 persistent agents launched (orchestrator + 3 vendors) ━━━
```

**After the backend is up:** see [backend/SETUP_AFTER_STARTUP.md](backend/SETUP_AFTER_STARTUP.md) to register the payment agent in Agent Inspector and add at least one vendor via `POST /api/vendors` (or run `./backend/scripts/add_sample_vendor.sh`).

### 6. Start the frontend

In a separate terminal:

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

> Vite automatically proxies `/api` and `/ws` requests to the backend on port 8080.

---

## Usage

### Customer Flow

1. **Home page** — type a plain-English request like "Fix a leak under my kitchen sink, budget $200".
2. **Agent Orchestration** — watch the 4-step agent pipeline run in real time:
   - **Concierge** — parses your request into a structured job spec
   - **Matching** — routes the request to the orchestrator, which dispatches to vendors
   - **Negotiation** — agents negotiate with vendors via ASI:One LLM
   - **Ranking** — deals are ranked by price
3. **Results** — see the top vendor quotes with prices, savings percentages, and negotiation transcripts. Click "Agent reasoning" to see each agent's chain-of-thought.
4. **Accept** — book a vendor. The job moves to the calendar and fulfillment tracking.

### Vendor Flow

1. Click **"Vendor mode"** (top-right on the home page).
2. **Create a vendor** — fill in name, services, prices, aggression level. This:
   - Saves the vendor to Supabase
   - Spins up a live vendor agent on the backend (logged in the terminal)
3. **Add services** — add new service types to an existing vendor.
4. The vendor agent is now active and will participate in future customer negotiations.

### Data freshness and refresh

- **Vendor calendar**, **customer calendar**, and **job tracking** screens query Supabase and **poll every 5 seconds** so changes (e.g. from another tab or device) appear without refreshing the page.
- A full page refresh does refetch vendors and customers from the database; the calendar and tracking screens also refetch their data on load. The global "jobs" list in app context is backed by localStorage, so for the latest job data use the calendar or tracking views, which read from Supabase.

### Connecting local agents to Agentverse Inspector

To see your local orchestrator and vendor agents in the [Agentverse Inspector](https://agentverse.ai/inspect):

1. **Keep the backend running** — If you see `[Errno 10048] ... bind on address ('0.0.0.0', 8080)` then something else is using port 8080 and the server exits; agents shut down and the inspector has nothing to connect to. Stop the other process (e.g. close any other terminal running the backend, or run `Get-NetTCPConnection -LocalPort 8080` in PowerShell to find the PID and stop it) and start the backend again.

2. **Use the URL printed in the terminal** — After startup you’ll see a line like:
   ```text
   Agent inspector available at https://agentverse.ai/inspect/?uri=http%3A//127.0.0.1%3A8001&address=agent1q0sewr2...
   ```
   Open **that full URL** in Chrome. It points the inspector at your local orchestrator (port 8001).

3. **Or add the agent manually** — On [agentverse.ai/inspect](https://agentverse.ai/inspect), look for “Add agent”, “Connect”, or a field to enter an agent URL. Use:
   - **Orchestrator:** `http://127.0.0.1:8001`
   - **Vendors (optional):** `http://127.0.0.1:8100`, `http://127.0.0.1:8101`, … (one per vendor).

The inspector does not auto-discover localhost; you must use the link from the terminal or add the URL yourself.

### What shows in the terminal

Every agent action is logged with color codes:

```
[API]     POST /api/negotiate  session=0b45aa38  service=plumbing  budget=$200
[0b45aa38] Starting negotiation  service=plumbing  budget=$200
[0b45aa38] Customer agent created  address=agent1qfzr4...  port=9200
[0b45aa38] customer-agent @ $180: I'd like to request plumbing service...
[0b45aa38] vendor-agent   @ $210: We can offer plumbing at $210...
[0b45aa38] VENDOR RESULT: RapidRooter [deal] $195 (3 rounds)
[0b45aa38] VENDOR RESULT: BudgetFix [deal] $185 (2 rounds)
[0b45aa38] ✓ DONE  outcome=deal  winner=BudgetFix  price=$185
```

---

## API Reference

All endpoints are served by the FastAPI backend on port 8080. In dev, Vite proxies them automatically.

### Negotiation

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/negotiate` | Start a new negotiation. Body: `{ service, budget, urgency, aggression, notes }`. Returns `{ session_id }`. |
| `WS` | `/ws/negotiate/:session_id` | WebSocket stream of real-time negotiation events (step, log, negotiation_msg, vendor_result, done). |
| `GET` | `/api/session/:session_id` | Polling fallback — returns session status and result. |

### Vendor Management

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/vendors` | Register a new vendor agent. Body: `{ name, services, base_prices, aggression }`. Returns `{ name, address, port, services }`. |
| `POST` | `/api/vendors/service` | Add a service to an existing vendor. Body: `{ vendor_name, service_name, job_type, price, duration_minutes }`. |

### Debug / Health

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Health check. Returns `{ status, orchestrator }`. |
| `GET` | `/api/agents` | List all registered agents (orchestrator + vendors). |

---

## Project Structure

```
agentplace/
├── backend/
│   ├── server.py               # FastAPI bridge — launches agents, HTTP + WebSocket endpoints
│   ├── orchestrator.py         # Orchestrator agent factory (vendor registry, routing, convergence)
│   ├── vendor.py               # Vendor agent factory (pricing, negotiation, LLM responses)
│   ├── customer.py             # Customer agent factory (requests, counter-offers, deal tracking)
│   ├── chat_utils.py           # Shared utilities (ASI:One LLM client, message parsing)
│   ├── requirements.txt        # Python dependencies
│   ├── .env.example            # Environment variable template
│   └── .env                    # Your local config (git-ignored)
│
├── src/                        # React frontend (Vite + TypeScript)
│   ├── pages/
│   │   ├── PromptPage.tsx      # Home — customer enters plain-English request
│   │   ├── AgentMatchingPage.tsx  # Real-time agent orchestration visualization
│   │   ├── JobResponsePage.tsx # Top quotes with negotiation transcripts
│   │   ├── JobCalendarPage.tsx # Calendar of booked jobs
│   │   ├── FulfillmentPage.tsx # Job tracking / fulfillment timeline
│   │   ├── VendorDashboard.tsx # Vendor portal — view services, stats
│   │   ├── NewVendorPage.tsx   # Create vendor → Supabase + backend agent
│   │   └── NewServicePage.tsx  # Add service to vendor agent
│   ├── hooks/
│   │   └── useNegotiation.ts   # WebSocket hook — manages real-time negotiation state
│   ├── lib/
│   │   ├── api.ts              # Backend API client (startNegotiation, connectNegotiationWS)
│   │   └── supabase-data.ts    # Supabase CRUD (vendors, consumers, jobs)
│   ├── context/
│   │   └── AppContext.tsx       # Global state (negotiateParams, negotiationResults, etc.)
│   ├── types/
│   │   └── index.ts            # TypeScript interfaces
│   └── data/
│       └── mock.ts             # Default location only (all mock data removed)
│
├── vite.config.ts              # Vite config with proxy to backend :8080
├── package.json                # Frontend dependencies
└── README.md                   # This file
```

---

## Environment Variables

Create `backend/.env` from `backend/.env.example`. Key variables:

| Variable | Required | Description |
|----------|----------|-------------|
| `AGENTVERSE_KEY` | Yes | Agentverse API key for orchestrator + payment agent mailbox |
| `ASI1_API_KEY` | Yes | ASI:One API key for LLM negotiation + convergence |
| `ORCHESTRATOR_SEED` | No | Deterministic seed for orchestrator identity (default provided) |
| `ORCHESTRATOR_PORT` | No | Port for orchestrator local server (default: `8001`) |
| `MAX_NEGOTIATION_ROUNDS` | No | Max rounds before force-closing (default: `8`) |
| `PAYMENT_AGENT_SEED` | No | Seed for payment agent (default in .env.example) |
| `PAYMENT_AGENT_PORT` | No | Payment agent port (default: `8300`) |
| `FET_USE_TESTNET` | No | Use Fetch.ai testnet for payments (default: `true`) |

Vendor agents are configured in `server.py`'s `VENDOR_DEFS` array, or created dynamically via `POST /api/vendors`.

---

## Deployment

### Option A: Single-machine (recommended for demo)

Run both backend and frontend on the same machine:

```bash
# Terminal 1: Backend
cd backend && source venv/bin/activate
export SSL_CERT_FILE=$(python -c "import certifi; print(certifi.where())")
uvicorn server:app --port 8080 --host 0.0.0.0

# Terminal 2: Frontend
npm run dev -- --host    # Exposes on LAN
```

The Vite dev server proxies all `/api` and `/ws` traffic to the backend. Access at `http://<your-ip>:5173`.

### Option B: Production build

```bash
# Build the frontend
npm run build

# Serve the static files + API from one process
# (add StaticFiles mount to server.py, or use nginx)
pip install aiofiles
```

Add to `server.py`:

```python
from fastapi.staticfiles import StaticFiles
app.mount("/", StaticFiles(directory="../dist", html=True), name="static")
```

Then run:

```bash
cd backend
uvicorn server:app --port 8080 --host 0.0.0.0
```

Everything is served from port 8080.

### Option C: Docker

```dockerfile
FROM python:3.11-slim
WORKDIR /app

# Backend
COPY backend/ backend/
RUN pip install --no-cache-dir -r backend/requirements.txt

# Frontend (pre-built)
COPY dist/ dist/

EXPOSE 8080
CMD ["uvicorn", "backend.server:app", "--port", "8080", "--host", "0.0.0.0"]
```

```bash
npm run build
docker build -t agentplace .
docker run -p 8080:8080 --env-file backend/.env agentplace
```

---

## Key Features

- **Natural-language negotiation** — Vendor and customer agents converse in plain English via ASI:One LLM.
- **LLM-driven convergence** — ASI:One acts as a neutral referee, analyzing transcripts to decide DEAL / TERMINATE / CONTINUE.
- **Multi-vendor consensus** — The orchestrator negotiates with all matching vendors in parallel and selects the best outcome.
- **Real-time frontend** — WebSocket streams every negotiation event to the React UI as it happens.
- **Dynamic agent creation** — Create new vendor agents from the frontend form; they're live and negotiating within seconds.
- **Configurable agent personalities** — Aggression level (1–5) controls how flexible or firm each agent negotiates.
- **Agentverse integration** — Orchestrator is registered with a mailbox and discoverable via ASI:One.
- **Full terminal logging** — Every agent action is color-coded and timestamped in the backend terminal.
- **Factory-pattern architecture** — Agents are created via reusable factory functions (`create_vendor_agent()`, `create_customer_agent()`, `create_orchestrator_agent()`).

---

## License

MIT
