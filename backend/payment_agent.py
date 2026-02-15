"""
Payment agent (seller role) for AgentPlace — FET on-chain payments.

Uses uagents_core payment protocol and cosmpy to verify Fetch.ai ledger
transactions. When payment is verified, updates job status to 8 (Payment sent)
then 9 (Payment received).

Run with mailbox=True; register in Agent Inspector so the agent can receive
CommitPayment via Agentverse.
"""

import logging
import os
from typing import Any, Optional
from uuid import uuid4

from uagents import Agent, Context, Protocol
from uagents_core.contrib.protocols.payment import (
    CancelPayment,
    CommitPayment,
    CompletePayment,
    Funds,
    RequestPayment,
    RejectPayment,
    payment_protocol_spec,
)

from db_helpers import update_job_status

log = logging.getLogger("payment_agent")

# ─── FET verification (cosmpy) ─────────────────────────────────────────────


def verify_fet_payment_to_agent(
    transaction_id: str,
    expected_amount_fet: str,
    sender_fet_address: str,
    recipient_agent_wallet: Any,
    logger: Optional[logging.Logger] = None,
) -> bool:
    """Verify an on-chain FET transfer to the agent wallet. Returns True if valid."""
    _log = logger or log
    try:
        from cosmpy.aerial.client import LedgerClient, NetworkConfig

        testnet = os.getenv("FET_USE_TESTNET", "true").lower() == "true"
        network_config = (
            NetworkConfig.fetchai_stable_testnet()
            if testnet
            else NetworkConfig.fetchai_mainnet()
        )
        ledger = LedgerClient(network_config)
        expected_amount_micro = int(float(expected_amount_fet) * 10**18)
        expected_recipient = str(recipient_agent_wallet.address())

        _log.info(
            "Verifying payment of %s FET from %s to %s (tx=%s)",
            expected_amount_fet,
            sender_fet_address,
            expected_recipient,
            transaction_id[:16] + "..." if len(transaction_id) > 16 else transaction_id,
        )
        tx_response = ledger.query_tx(transaction_id)
        if not tx_response.is_successful():
            _log.error("Transaction %s was not successful", transaction_id)
            return False

        recipient_found = False
        amount_found = False
        sender_found = False
        denom = "atestfet" if testnet else "afet"

        for event_type, event_attrs in tx_response.events.items():
            if event_type == "transfer":
                if event_attrs.get("recipient") == expected_recipient:
                    recipient_found = True
                if event_attrs.get("sender") == sender_fet_address:
                    sender_found = True
                amount_str = event_attrs.get("amount", "")
                if amount_str and amount_str.endswith(denom):
                    try:
                        amount_value = int(amount_str.replace(denom, ""))
                        if amount_value >= expected_amount_micro:
                            amount_found = True
                    except (ValueError, TypeError):
                        pass

        if recipient_found and amount_found and sender_found:
            _log.info("Payment verified: %s", transaction_id)
            return True
        _log.error(
            "Payment verification failed — recipient=%s amount=%s sender=%s",
            recipient_found,
            amount_found,
            sender_found,
        )
        return False
    except Exception as e:
        _log.exception("FET payment verification failed: %s", e)
        return False


# ─── Payment protocol (seller) ─────────────────────────────────────────────

PAYMENT_AGENT_WALLET: Optional[Any] = None

FET_FUNDS = Funds(currency="FET", amount="0.1", payment_method="fet_direct")
ACCEPTED_FUNDS = [FET_FUNDS]


def _set_agent_wallet(wallet: Any) -> None:
    global PAYMENT_AGENT_WALLET
    PAYMENT_AGENT_WALLET = wallet


payment_proto = Protocol(spec=payment_protocol_spec, role="seller")


@payment_proto.on_message(CommitPayment)
async def handle_commit_payment(ctx: Context, sender: str, msg: CommitPayment) -> None:
    """Verify on-chain FET payment and update job status; send CompletePayment or CancelPayment."""
    job_id_str = (msg.reference or "").strip()
    if not job_id_str or not job_id_str.isdigit():
        ctx.logger.error("CommitPayment missing or invalid reference (job_id): %s", msg.reference)
        await ctx.send(
            sender,
            CancelPayment(transaction_id=msg.transaction_id, reason="Missing job reference"),
        )
        return

    job_id = int(job_id_str)
    payment_verified = False

    if msg.funds.payment_method == "fet_direct" and msg.funds.currency == "FET":
        buyer_fet = None
        if isinstance(msg.metadata, dict):
            buyer_fet = msg.metadata.get("buyer_fet_wallet") or msg.metadata.get("buyer_fet_address")
        if not buyer_fet or not PAYMENT_AGENT_WALLET:
            ctx.logger.error("Missing buyer_fet_wallet in metadata or agent wallet")
        else:
            payment_verified = verify_fet_payment_to_agent(
                transaction_id=msg.transaction_id,
                expected_amount_fet=FET_FUNDS.amount,
                sender_fet_address=str(buyer_fet),
                recipient_agent_wallet=PAYMENT_AGENT_WALLET,
                logger=ctx.logger,
            )

    if payment_verified:
        update_job_status(job_id, 8)  # Payment sent
        update_job_status(job_id, 9)  # Payment received
        ctx.logger.info("Job %s payment verified; status updated to 8 then 9", job_id)
        await ctx.send(sender, CompletePayment(transaction_id=msg.transaction_id))
    else:
        await ctx.send(
            sender,
            CancelPayment(
                transaction_id=msg.transaction_id,
                reason="Payment verification failed",
            ),
        )


@payment_proto.on_message(RejectPayment)
async def handle_reject_payment(ctx: Context, sender: str, msg: RejectPayment) -> None:
    ctx.logger.info("Payment rejected by %s: %s", sender, msg.reason or "no reason")


# ─── Factory ──────────────────────────────────────────────────────────────


def create_payment_agent(
    *,
    seed: str,
    port: int,
    mailbox: bool = True,
    network: Optional[str] = "testnet",
) -> Agent:
    """Create and wire the payment agent (seller). Call set_agent_wallet after creation."""
    kwargs: dict[str, Any] = {
        "name": "payment_agent",
        "seed": seed,
        "port": port,
    }
    if mailbox:
        kwargs["mailbox"] = True
    if network:
        kwargs["network"] = network

    agent = Agent(**kwargs)
    agent.include(payment_proto, publish_manifest=True)
    _set_agent_wallet(agent.wallet)
    return agent


def get_payment_request_payload(
    job_id: int,
    recipient_address: str,
    description: str = "AgentPlace job payment",
) -> dict[str, Any]:
    """Build the payload for the frontend (amount, recipient, reference, deadline, network)."""
    testnet = os.getenv("FET_USE_TESTNET", "true").lower() == "true"
    return {
        "recipient_address": recipient_address,
        "amount_fet": FET_FUNDS.amount,
        "currency": FET_FUNDS.currency,
        "payment_method": FET_FUNDS.payment_method,
        "reference": str(job_id),
        "deadline_seconds": 300,
        "description": description,
        "fet_network": "stable-testnet" if testnet else "mainnet",
    }


def process_commit_payment_from_api(
    job_id: int,
    transaction_id: str,
    buyer_fet_wallet: str,
) -> tuple[bool, str]:
    """
    Verify FET payment and update job status. Used when the frontend submits
    commit-payment via the API (same logic as the agent's CommitPayment handler).
    Returns (True, "") on success, (False, "error message") on failure.
    """
    if not PAYMENT_AGENT_WALLET:
        log.error("Payment agent wallet not set")
        return False, "Payment agent not initialized"
    try:
        ok = verify_fet_payment_to_agent(
            transaction_id=transaction_id,
            expected_amount_fet=FET_FUNDS.amount,
            sender_fet_address=buyer_fet_wallet,
            recipient_agent_wallet=PAYMENT_AGENT_WALLET,
            logger=log,
        )
    except Exception as e:
        log.exception("FET verification threw: %s", e)
        msg = str(e).strip() or "Ledger error"
        if "DNS" in msg or "resolution failed" in msg or "UNAVAILABLE" in msg or "connect" in msg.lower():
            return False, "Fetch.ai ledger unreachable. Check network and try again."
        return False, f"Verification failed: {msg}"
    if ok:
        update_job_status(job_id, 8)
        update_job_status(job_id, 9)
        log.info("Job %s payment verified via API; status 8 then 9", job_id)
        return True, ""
    return False, "Transaction invalid or not found. Check tx hash, amount (0.1 FET), sender and recipient."
