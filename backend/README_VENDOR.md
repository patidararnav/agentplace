# Vendor Agent — AgentPlace Marketplace

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

**Agent Address (default):** `agent1q2lsm8uvrxjpjssh3mfaafvfnvuw46tzl9fzqtpj7ltepmca57tuu08wqyz`

## What This Agent Does

The Vendor agent represents a home-service provider (plumber, electrician, etc.) in the AgentPlace marketplace. It:

1. **Registers with the Orchestrator** — advertises supported services, pricing, and negotiation style on startup.
2. **Responds to job requests** — generates a natural-language opening offer using the ASI:One LLM, with pricing driven by configurable base prices and aggression level.
3. **Negotiates via chat** — receives customer counter-offers and produces revised prices, moving toward a deal while respecting a calculated floor price.
4. **Confirms deals** — acknowledges closed deals or terminated negotiations from the Orchestrator.

## Chat Protocol

This agent implements the standard Fetch.ai **Chat Protocol** (`ChatMessage` / `ChatAcknowledgement`) and is discoverable on ASI:One.

## Configurable Parameters

| Parameter | Description |
|-----------|-------------|
| `VENDOR_NAME` | Display name (e.g. `LocalPlumbCo`) |
| `VENDOR_SERVICES` | Comma-separated service list |
| `VENDOR_BASE_PRICES` | `service:price` pairs (e.g. `plumbing:150`) |
| `VENDOR_AGGRESSION` | 1–5 scale (1 = flexible, 5 = firm) |

## Negotiation Behavior

- Lower aggression: accepts closer to base price, larger concessions per round.
- Higher aggression: holds near markup pricing, smaller concessions.
- Floor price accounts for urgency and aggression to ensure profitability.
