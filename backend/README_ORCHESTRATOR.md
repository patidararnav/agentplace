# Orchestrator Agent — AgentPlace Marketplace

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

**Agent Address:** `agent1q0sewr2pg82xzuqzvj98usjdtc9zyrdlrgpsqh0gp4uw4cvh3ujp7452dwu`

## What This Agent Does

The Orchestrator is the central hub of the AgentPlace marketplace. When a customer requests a home-service job (e.g. plumbing, electrical), the Orchestrator:

1. **Discovers vendors** — maintains a live registry of vendor agents and their service capabilities.
2. **Matches requests** — routes the customer's job request to every vendor that offers the required service.
3. **Mediates negotiation** — relays natural-language chat messages between customer and vendor agents, tracking prices and transcripts.
4. **Decides convergence** — uses the ASI:One LLM as a referee to determine whether each negotiation should CONTINUE, end in a DEAL, or TERMINATE.
5. **Selects the best deal** — in consensus mode, waits for all vendors to resolve, then picks the lowest-price deal and notifies all parties.

## Chat Protocol

This agent implements the standard Fetch.ai **Chat Protocol** (`ChatMessage` / `ChatAcknowledgement`) and is discoverable on ASI:One.

## Marketplace Inputs

| Field | Description |
|-------|-------------|
| `SERVICE` | Service type requested (e.g. `plumbing`) |
| `BUDGET` | Customer's maximum price |
| `URGENCY` | 1–5 scale |
| `NOTES` | Free-text requirements |

## Marketplace Outputs

- Vendor matching status notifications
- Routed chat negotiation messages (vendor ↔ customer)
- Deal closure / termination status with final price
- Consensus ranking when multiple vendors are involved
