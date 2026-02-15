"""
Autonomous buyer agent for the Agent Payment Protocol.

The buyer agent owns the entire payment lifecycle:

  1. API sends StartPayment → buyer sends TriggerRequestPayment → vendor (seller)
  2. Vendor sends RequestPayment → buyer stores it, transitions to awaiting_commit
  3. API sends SubmitPaymentProof → buyer sends CommitPayment → vendor
  4. Vendor sends CompletePayment or CancelPayment → buyer updates state
  5. API sends DeclinePayment → buyer sends RejectPayment → vendor

The API only kicks things off and reads state — all protocol messages flow
between the buyer and vendor agents autonomously.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from uagents import Agent, Context, Model, Protocol
from uagents_core.contrib.protocols.payment import (
    CancelPayment,
    CommitPayment,
    CompletePayment,
    Funds,
    RejectPayment,
    RequestPayment,
    payment_protocol_spec,
)

from payment_agent import ACCEPTED_FUNDS, FET_FUNDS, TriggerRequestPayment

log = logging.getLogger("buyer_agent")

# ─── Internal message models (API → buyer agent) ─────────────────────────

class StartPayment(Model):
    """API tells buyer to begin payment for a job."""
    job_id: int
    seller_address: str
    seller_wallet: str
    seller_name: str = ""
    description: str = ""


class SubmitPaymentProof(Model):
    """API forwards tx hash + wallet so buyer can send CommitPayment to seller."""
    job_id: int
    transaction_id: str
    buyer_fet_wallet: str


class DeclinePayment(Model):
    """API tells buyer the customer declined — buyer sends RejectPayment to seller."""
    job_id: int
    reason: str = "Customer declined payment"


# ─── Per-job state machine ────────────────────────────────────────────────
# States: idle → requesting → awaiting_commit → committing → completed / failed / rejected

_job_states: Dict[str, Dict[str, Any]] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _get_or_create_state(job_id: int) -> Dict[str, Any]:
    key = str(job_id)
    if key not in _job_states:
        _job_states[key] = {
            "status": "idle",
            "seller_address": "",
            "seller_wallet": "",
            "seller_name": "",
            "payment_request": None,  # payload from RequestPayment
            "error": None,
            "events": [],
        }
    return _job_states[key]


def _add_event(state: Dict[str, Any], event: str, message_type: str, seller_name: str = "") -> None:
    state["events"].append({
        "event": event,
        "message_type": message_type,
        "seller_name": seller_name or state.get("seller_name", ""),
        "timestamp": _now_iso(),
    })


def _request_to_payload(msg: RequestPayment) -> Dict[str, Any]:
    """Convert RequestPayment to API payload (recipient_address, amount_fet, etc.)."""
    testnet = os.getenv("FET_USE_TESTNET", "true").lower() == "true"
    funds = msg.accepted_funds[0] if msg.accepted_funds else None
    amount = funds.amount if funds else "0.1"
    currency = funds.currency if funds else "FET"
    return {
        "recipient_address": msg.recipient,
        "amount_fet": amount,
        "currency": currency,
        "payment_method": funds.payment_method if funds else "fet_direct",
        "reference": msg.reference or "",
        "deadline_seconds": msg.deadline_seconds,
        "description": msg.description or "",
        "fet_network": "stable-testnet" if testnet else "mainnet",
    }


# ─── Exported state-read functions (called by server.py) ─────────────────


def get_payment_state(job_id: int) -> Dict[str, Any]:
    """Return the full payment state for a job (status, payment_request, events, error)."""
    state = _get_or_create_state(job_id)
    return {
        "job_id": job_id,
        "status": state["status"],
        "payment_request": state["payment_request"],
        "events": list(state["events"]),
        "error": state["error"],
        "seller_name": state.get("seller_name", ""),
    }


def get_stored_request(job_id: int) -> Optional[Dict[str, Any]]:
    """Backward compat: return stored payment request for this job_id if any."""
    state = _get_or_create_state(job_id)
    return state["payment_request"]


# ─── Agent factory ────────────────────────────────────────────────────────


def create_buyer_agent(
    *,
    seed: str,
    port: int,
    mailbox: bool = False,
    network: Optional[str] = "testnet",
    resolve: Any = None,
) -> Agent:
    """Create the autonomous buyer agent (payment protocol buyer role)."""
    kwargs: Dict[str, Any] = {
        "name": "payment_buyer",
        "seed": seed,
        "port": port,
    }
    if mailbox:
        kwargs["mailbox"] = True
    if network:
        kwargs["network"] = network
    if resolve is not None:
        kwargs["resolve"] = resolve

    agent = Agent(**kwargs)

    # ── Payment protocol (buyer role — standard Fetch.ai protocol) ──
    payment_proto = Protocol(spec=payment_protocol_spec, role="buyer")

    # ── Internal trigger protocol (API → buyer) ──
    trigger_proto = Protocol(name="AgentPlaceBuyerTrigger", version="0.1.0")

    # ── Handler: API says "start payment for this job" ──
    @trigger_proto.on_message(StartPayment)
    async def handle_start_payment(ctx: Context, sender: str, msg: StartPayment) -> None:
        state = _get_or_create_state(msg.job_id)
        state["status"] = "requesting"
        state["seller_address"] = msg.seller_address
        state["seller_wallet"] = msg.seller_wallet
        state["seller_name"] = msg.seller_name
        state["error"] = None

        ctx.logger.info(
            "[buyer] StartPayment job=%s → sending TriggerRequestPayment to seller %s",
            msg.job_id, msg.seller_address[:20] + "…",
        )

        # Buyer autonomously tells the vendor to begin the protocol
        trigger = TriggerRequestPayment(
            job_id=msg.job_id,
            description=msg.description,
            recipient_address=msg.seller_wallet,
        )
        try:
            await ctx.send(msg.seller_address, trigger)
            _add_event(state, "Buyer asked seller to request payment", "TriggerRequestPayment", msg.seller_name)
        except Exception as e:
            ctx.logger.error("[buyer] Failed to send TriggerRequestPayment: %s", e)
            state["status"] = "failed"
            state["error"] = f"Failed to contact seller: {e}"

    # ── Handler: Vendor (seller) sends RequestPayment ──
    @payment_proto.on_message(RequestPayment)
    async def on_request_payment(ctx: Context, sender: str, msg: RequestPayment) -> None:
        ref = (msg.reference or "").strip()
        if not ref:
            ctx.logger.warning("RequestPayment missing reference, ignoring")
            return

        state = _get_or_create_state(int(ref))
        payload = _request_to_payload(msg)
        state["payment_request"] = payload
        state["status"] = "awaiting_commit"
        _add_event(state, "RequestPayment (seller → buyer)", "RequestPayment")

        ctx.logger.info(
            "[buyer] Received RequestPayment for job %s from %s — now awaiting_commit",
            ref, sender[:20] + "…",
        )

    # ── Handler: API says "here's the tx hash, send CommitPayment" ──
    @trigger_proto.on_message(SubmitPaymentProof)
    async def handle_submit_proof(ctx: Context, sender: str, msg: SubmitPaymentProof) -> None:
        state = _get_or_create_state(msg.job_id)
        seller_address = state.get("seller_address", "")
        seller_wallet = state.get("seller_wallet", "")

        if not seller_address:
            ctx.logger.error("[buyer] SubmitPaymentProof for job %s but no seller_address", msg.job_id)
            state["error"] = "No seller address — request payment first"
            return

        state["status"] = "committing"
        state["error"] = None

        funds = Funds(currency="FET", amount="0.1", payment_method="fet_direct")
        commit_msg = CommitPayment(
            recipient=seller_address,
            transaction_id=msg.transaction_id,
            reference=str(msg.job_id),
            funds=funds,
            metadata={
                "buyer_fet_wallet": msg.buyer_fet_wallet,
                "expected_recipient": seller_wallet,
            },
        )

        ctx.logger.info(
            "[buyer] Sending CommitPayment to seller %s for job %s (tx=%s)",
            seller_address[:20] + "…", msg.job_id,
            msg.transaction_id[:16] + "…" if len(msg.transaction_id) > 16 else msg.transaction_id,
        )

        _add_event(state, "CommitPayment (buyer → seller)", "CommitPayment")

        try:
            await ctx.send(seller_address, commit_msg)
        except Exception as e:
            ctx.logger.error("[buyer] Failed to send CommitPayment: %s", e)
            state["status"] = "failed"
            state["error"] = f"Failed to send payment proof to seller: {e}"

    # ── Handler: Vendor confirms payment ──
    @payment_proto.on_message(CompletePayment)
    async def on_complete_payment(ctx: Context, sender: str, msg: CompletePayment) -> None:
        ctx.logger.info(
            "[buyer] Received CompletePayment from %s tx=%s",
            sender[:20] + "…", msg.transaction_id or "",
        )

        # Find the job by looking for a state in "committing" from this seller
        for key, state in _job_states.items():
            if state.get("seller_address") == sender and state["status"] == "committing":
                state["status"] = "completed"
                state["error"] = None
                _add_event(state, "CompletePayment (seller → buyer)", "CompletePayment")
                ctx.logger.info("[buyer] Job %s payment completed!", key)
                return

        # Fallback: log but can't match to job
        ctx.logger.warning("[buyer] CompletePayment from %s but no matching job in committing state", sender[:20] + "…")

    # ── Handler: Vendor rejects/cancels payment ──
    @payment_proto.on_message(CancelPayment)
    async def on_cancel_payment(ctx: Context, sender: str, msg: CancelPayment) -> None:
        ctx.logger.info(
            "[buyer] Received CancelPayment from %s reason=%s",
            sender[:20] + "…", msg.reason or "",
        )

        for key, state in _job_states.items():
            if state.get("seller_address") == sender and state["status"] == "committing":
                state["status"] = "failed"
                state["error"] = msg.reason or "Payment verification failed"
                _add_event(state, "CancelPayment (seller → buyer)", "CancelPayment")
                ctx.logger.info("[buyer] Job %s payment failed: %s", key, msg.reason)
                return

        ctx.logger.warning("[buyer] CancelPayment from %s but no matching job in committing state", sender[:20] + "…")

    # ── Handler: API says customer declined ──
    @trigger_proto.on_message(DeclinePayment)
    async def handle_decline(ctx: Context, sender: str, msg: DeclinePayment) -> None:
        state = _get_or_create_state(msg.job_id)
        seller_address = state.get("seller_address", "")

        if not seller_address:
            ctx.logger.error("[buyer] DeclinePayment for job %s but no seller_address", msg.job_id)
            state["error"] = "No seller address — request payment first"
            return

        ctx.logger.info("[buyer] Declining payment for job %s → RejectPayment to %s", msg.job_id, seller_address[:20] + "…")

        state["status"] = "rejected"
        _add_event(state, "RejectPayment (buyer → seller)", "RejectPayment")

        try:
            await ctx.send(seller_address, RejectPayment(reason=msg.reason))
        except Exception as e:
            ctx.logger.error("[buyer] Failed to send RejectPayment: %s", e)
            state["error"] = f"Failed to send decline: {e}"

    agent.include(payment_proto, publish_manifest=True)
    agent.include(trigger_proto)
    return agent
