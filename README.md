# AgentPlace — AI-Powered Service Marketplace

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

> **TreeHacks 2026 — Fetch.ai Challenge**
>
> A multi-agent marketplace where autonomous AI agents negotiate home-service deals in natural language, powered by ASI:One LLM and deployed on Agentverse.

## Demo Video

<!-- TODO: Add 3-5 minute demo video link here -->

## How It Works

A **customer** asks for a service (e.g. "I need a plumber, budget $200"). The system:

1. **Customer Agent** sends the request to the **Orchestrator Agent** via the Fetch.ai Chat Protocol.
2. **Orchestrator** matches the request against its live **Vendor Registry** and fans out the job to every qualifying vendor.
3. Each **Vendor Agent** generates a natural-language opening offer (priced by configurable aggression and base rates) using the **ASI:One LLM**.
4. The **Customer Agent** reviews each vendor's quote. If over budget, it produces a counter-offer (also LLM-generated). If within budget, it accepts.
5. After each round, the **Orchestrator** checks convergence — using both a fast-path price-gap heuristic and an **ASI:One LLM referee** that reads the full negotiation transcript.
6. Once all vendors resolve (deal, terminated, or unavailable), the Orchestrator picks the **best deal** (lowest price) and notifies all parties.

```
┌──────────┐   Chat Protocol   ┌──────────────┐   Chat Protocol   ┌────────────┐
│ Customer │ ◄───────────────► │ Orchestrator │ ◄───────────────► │  Vendor A  │
│  Agent   │                   │    Agent     │                   │   Agent    │
└──────────┘                   │              │   Chat Protocol   ├────────────┤
                               │  ┌────────┐  │ ◄───────────────► │  Vendor B  │
                               │  │ASI:One │  │                   │   Agent    │
                               │  │ LLM    │  │   Chat Protocol   ├────────────┤
                               │  │Referee │  │ ◄───────────────► │  Vendor C  │
                               │  └────────┘  │                   │   Agent    │
                               └──────────────┘                   └────────────┘
```

## Agents on Agentverse

All agents are registered on Agentverse (testnet) and discoverable via ASI:One.

| Agent | Address | Agentverse Inspector |
|-------|---------|---------------------|
| **Orchestrator** | `agent1q0sewr2pg82xzuqzvj98usjdtc9zyrdlrgpsqh0gp4uw4cvh3ujp7452dwu` | [Inspect](https://agentverse.ai/inspect/?uri=http%3A//127.0.0.1%3A8001&address=agent1q0sewr2pg82xzuqzvj98usjdtc9zyrdlrgpsqh0gp4uw4cvh3ujp7452dwu) |
| **Vendor (LocalPlumbCo)** | `agent1q2lsm8uvrxjpjssh3mfaafvfnvuw46tzl9fzqtpj7ltepmca57tuu08wqyz` | [Inspect](https://agentverse.ai/inspect/?uri=http%3A//127.0.0.1%3A8000&address=agent1q2lsm8uvrxjpjssh3mfaafvfnvuw46tzl9fzqtpj7ltepmca57tuu08wqyz) |
| **Customer** | `agent1qtnplu75c503af54npnpynjvzc0zulcjj3d2lv9kuftaefetml7hykfg526` | [Inspect](https://agentverse.ai/inspect/?uri=http%3A//127.0.0.1%3A8002&address=agent1qtnplu75c503af54npnpynjvzc0zulcjj3d2lv9kuftaefetml7hykfg526) |

## Tech Stack

- **[uAgents](https://github.com/fetchai/uAgents)** — Fetch.ai agent framework with Chat Protocol
- **[Agentverse](https://agentverse.ai)** — Agent registration, mailbox networking, Almanac contract
- **[ASI:One](https://asi1.ai)** — LLM powering natural-language negotiation and convergence decisions
- **Python 3.11+**

## Key Features

- **Natural-language negotiation** — Vendor and customer agents converse in plain English, not rigid schemas.
- **LLM-driven convergence** — ASI:One acts as a neutral referee, analyzing transcripts to decide DEAL / TERMINATE / CONTINUE.
- **Multi-vendor consensus** — The orchestrator negotiates with all matching vendors in parallel and selects the best outcome.
- **Configurable agent personalities** — Aggression level (1–5) controls how flexible or firm each agent negotiates.
- **Chat Protocol compliance** — Full `ChatMessage` / `ChatAcknowledgement` protocol for ASI:One discoverability.
- **Factory-pattern architecture** — Agents are created via reusable factory functions, making it easy to deploy new vendor/customer instances.

## Quickstart

### Prerequisites

- Python 3.11+
- An [Agentverse](https://agentverse.ai) API key
- An [ASI:One](https://asi1.ai/dashboard/api-keys) API key

### Setup

```bash
git clone https://github.com/your-team/agentplace.git
cd agentplace
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env with your AGENTVERSE_KEY and ASI1_API_KEY
```

### Run on Agentverse (Production)

Start each agent in a **separate terminal**:

```bash
# Terminal 1 — Orchestrator
python orchestrator.py

# Terminal 2 — Vendor
python vendor.py

# Terminal 3 — Customer
python customer.py
```

Each agent will:
- Register on the Almanac contract (testnet)
- Connect to Agentverse mailbox
- Publish its Chat Protocol manifest for ASI:One discoverability

Run **multiple vendor agents** by overriding env vars per terminal:

```bash
VENDOR_NAME=QuickFixPro VENDOR_SEED=vendor2_seed VENDOR_PORT=8003 \
  VENDOR_SERVICES=plumbing,electrical VENDOR_BASE_PRICES=plumbing:180,electrical:200 \
  VENDOR_AGGRESSION=4 python vendor.py
```

### Local Simulation (Bureau)

For local testing without Agentverse:

```bash
python simulate_vendor_selection.py --config simulation_config.example.json
```

This runs all agents in a single process using `Bureau`, with consensus mode enabled to negotiate with all vendors and pick the best deal.

## Project Structure

```
agentplace/
├── orchestrator.py        # Orchestrator agent (vendor registry, routing, convergence)
├── vendor.py              # Vendor agent (pricing, negotiation, LLM responses)
├── customer.py            # Customer agent (requests, counter-offers, deal tracking)
├── chat_utils.py          # Shared utilities (LLM client, message parsing)
├── simulate_vendor_selection.py  # Local E2E simulation via Bureau
├── simulation_config.example.json  # Config for simulation scenarios
├── .env.example           # Environment variable template
├── requirements.txt       # Python dependencies
├── README.md              # This file
├── README_ORCHESTRATOR.md # Orchestrator agent README (published to Agentverse)
├── README_VENDOR.md       # Vendor agent README (published to Agentverse)
└── README_CUSTOMER.md     # Customer agent README (published to Agentverse)
```

## Environment Variables

See [`.env.example`](.env.example) for the full list. Key variables:

| Variable | Description |
|----------|-------------|
| `AGENTVERSE_KEY` | Agentverse API key for mailbox + registration |
| `ASI1_API_KEY` | ASI:One API key for LLM-powered negotiation |
| `ORCHESTRATOR_ADDRESS` | Orchestrator's agent address (shared by vendor/customer) |
| `ORCHESTRATOR_SEED` | Deterministic seed for orchestrator identity |
| `VENDOR_SEED` | Deterministic seed for vendor identity |
| `CUSTOMER_SEED` | Deterministic seed for customer identity |

## Architecture Highlights

### Reusable Factory Functions

Each agent module exports a factory function (`create_vendor_agent()`, `create_customer_agent()`, `create_orchestrator_agent()`) that returns a fully-wired `Agent` instance. This means:

- **Zero code duplication** — the simulation and production scripts use the exact same logic.
- **Easy deployment** — spin up new vendor/customer agents with a single function call.
- **Frontend-ready** — a web UI can import and instantiate agents programmatically.

### Convergence Algorithm

1. **Fast path**: If the vendor and customer prices are within a 4% band of the budget, close the deal immediately.
2. **Max rounds**: If negotiations exceed the configured limit, force a deal (if vendor is within budget) or terminate.
3. **LLM referee**: For rounds 3+, the ASI:One LLM analyzes the full transcript and returns `DEAL|PRICE|REASON`, `TERMINATE|0|REASON`, or `CONTINUE|0|REASON`.

## License

MIT
