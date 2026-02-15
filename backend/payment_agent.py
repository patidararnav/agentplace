"""
Payment utilities for AgentPlace — FET on-chain verification and shared models.

This module provides:
  - verify_fet_payment_to_agent()  — cosmpy-based on-chain verification
  - get_payment_request_payload()  — build frontend payload
  - TriggerRequestPayment  — message model used by buyer agent → vendor (seller)
  - FET_FUNDS / ACCEPTED_FUNDS constants

The *seller* protocol handlers live on each vendor agent (vendor.py).
The *buyer* agent (autonomous orchestrator) is in buyer_agent.py.
"""

import logging
import os
from typing import Any, Optional

from uagents import Model
from uagents_core.contrib.protocols.payment import Funds

log = logging.getLogger("payment_utils")

# ─── Constants ─────────────────────────────────────────────────────────────

FET_FUNDS = Funds(currency="FET", amount="0.1", payment_method="fet_direct")
ACCEPTED_FUNDS = [FET_FUNDS]


# ─── Trigger model (API → vendor seller) ──────────────────────────────────

class TriggerRequestPayment(Model):
    """Sent by the API (buyer identity) to a vendor agent so the vendor (seller) sends RequestPayment to the buyer."""
    job_id: int
    description: str | None = None
    recipient_address: str | None = None  # If set, customer pays this address; else vendor wallet.


# ─── FET verification (cosmpy) ─────────────────────────────────────────────


def verify_fet_payment_to_agent(
    transaction_id: str,
    expected_amount_fet: str,
    sender_fet_address: str,
    recipient_agent_wallet: Any = None,
    expected_recipient_address: Optional[str] = None,
    logger: Optional[logging.Logger] = None,
) -> bool:
    """Verify an on-chain FET transfer. Recipient is expected_recipient_address if set, else recipient_agent_wallet.address()."""
    _log = logger or log
    try:
        from cosmpy.aerial.client import LedgerClient, NetworkConfig

        if expected_recipient_address:
            expected_recipient = expected_recipient_address
        elif recipient_agent_wallet is not None:
            expected_recipient = str(recipient_agent_wallet.address())
        else:
            _log.error("Neither expected_recipient_address nor recipient_agent_wallet provided")
            return False

        testnet = os.getenv("FET_USE_TESTNET", "true").lower() == "true"
        network_config = (
            NetworkConfig.fetchai_stable_testnet()
            if testnet
            else NetworkConfig.fetchai_mainnet()
        )
        ledger = LedgerClient(network_config)
        expected_amount_micro = int(float(expected_amount_fet) * 10**18)

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


# ─── API helpers ───────────────────────────────────────────────────────────


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


