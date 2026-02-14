# Customer Agent — AgentPlace Marketplace

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

**Agent Address (default):** `agent1qtnplu75c503af54npnpynjvzc0zulcjj3d2lv9kuftaefetml7hykfg526`

## What This Agent Does

The Customer agent represents a homeowner or service requester in the AgentPlace marketplace. It:

1. **Submits a service request** — sends a natural-language job request to the Orchestrator with budget, urgency, and notes.
2. **Reviews vendor offers** — receives routed vendor messages containing prices and natural-language quotes.
3. **Sends counter-offers** — uses the ASI:One LLM to generate friendly but firm counter-offers when quotes exceed budget.
4. **Accepts deals** — when a vendor's price is within budget, accepts and lets the Orchestrator's convergence logic finalize.
5. **Receives consensus results** — in multi-vendor scenarios, receives per-vendor outcomes and the final best-deal selection.

## Chat Protocol

This agent implements the standard Fetch.ai **Chat Protocol** (`ChatMessage` / `ChatAcknowledgement`) and is discoverable on ASI:One.

## Configurable Parameters

| Parameter | Description |
|-----------|-------------|
| `JOB_TYPE` | Service needed (e.g. `plumbing`, `leaky faucet`) |
| `MAX_PRICE` | Maximum budget in dollars |
| `URGENCY` | 1–5 scale (1 = low, 5 = emergency) |
| `CUSTOMER_AGGRESSION` | 1–5 scale (1 = agreeable, 5 = tough) |
| `CUSTOMER_NOTES` | Free-text requirements for the vendor |
