"""
Vendor selection agent for choosing relevant vendors per customer request.

This module provides an LLM-based selector that intelligently matches customer
service requests to vendors based on their capabilities.  A deterministic
heuristic fallback ensures the system keeps working when the LLM is
unavailable.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Set, Tuple

from chat_utils import generate_text

logger = logging.getLogger(__name__)

# ─── LLM System Prompt ──────────────────────────────────────────────────

VENDOR_SELECTOR_SYSTEM_PROMPT = """\
You are a marketplace vendor-matching agent.  Your job is to decide which
vendors from a numbered catalog can fulfil a customer's service request.

Rules:
1. Match by **intent**, not exact wording.  "plumbing" matches vendors that
   offer "plumbing repair", "pipe leak fix", "drain cleaning", etc.
2. A vendor is relevant if ANY of its listed services could reasonably
   satisfy the customer's request.
3. Be inclusive when there is reasonable overlap, but do NOT include vendors
   from clearly unrelated categories (e.g. do not match a roofing company
   to a plumbing request).
4. If no vendor is relevant, return an empty list.
5. Return ONLY valid JSON — no markdown fences, no commentary.

You MUST respond with exactly this JSON format:
{"ids":[0,2,5],"reason":"short explanation"}

Where "ids" is a list of the INTEGER vendor numbers from the catalog.\
"""


# ─── Heuristic fallback ─────────────────────────────────────────────────

def _normalize_tokens(text: str) -> Set[str]:
    """Extract lowercase alpha-numeric tokens of length >= 3."""
    return {
        t for t in re.findall(r"[a-z0-9]+", (text or "").lower())
        if len(t) >= 3
    }


def _heuristic_select(
    *,
    service: str,
    notes: str,
    vendor_registry: Dict[str, Dict[str, Any]],
) -> Set[str]:
    """Deterministic fallback selector when LLM output is unavailable."""
    service_l = (service or "").strip().lower()
    request_tokens = _normalize_tokens(f"{service_l} {notes}")
    if service_l:
        request_tokens.add(service_l)

    matched: Set[str] = set()
    for address, profile in vendor_registry.items():
        services = [
            str(s).strip().lower()
            for s in profile.get("services", [])
            if str(s).strip()
        ]
        if not services:
            continue

        # Direct overlap between category/subservice strings.
        if any(service_l == svc or service_l in svc or svc in service_l for svc in services):
            matched.add(address)
            continue

        # Token overlap with requested intent.
        for svc in services:
            svc_tokens = _normalize_tokens(svc)
            if request_tokens & svc_tokens:
                matched.add(address)
                break

    return matched


# ─── JSON extraction helper ─────────────────────────────────────────────

def _extract_json_object(raw: str) -> Dict[str, Any]:
    """Robustly pull the first JSON object out of an LLM response."""
    text = (raw or "").strip()
    if not text:
        return {}

    # Strip markdown code fences if present
    text = re.sub(r"^```(?:json)?\s*", "", text)
    text = re.sub(r"\s*```$", "", text)

    try:
        obj = json.loads(text)
        return obj if isinstance(obj, dict) else {}
    except Exception:
        pass

    m = re.search(r"\{.*\}", text, flags=re.DOTALL)
    if not m:
        return {}
    try:
        obj = json.loads(m.group(0))
        return obj if isinstance(obj, dict) else {}
    except Exception:
        return {}


# ─── Vendor Selector Agent ──────────────────────────────────────────────

class VendorSelectorAgent:
    """LLM-based selector with robust fallback behavior.

    Instead of asking the LLM to reproduce long agent addresses, we map
    vendors to short numeric IDs in the prompt and map back after the LLM
    responds.  This dramatically improves accuracy.
    """

    def __init__(self, max_selected: int = 8) -> None:
        self.max_selected = max(1, int(max_selected))

    async def select(
        self,
        *,
        service: str,
        notes: str,
        budget: int,
        vendor_registry: Dict[str, Dict[str, Any]],
    ) -> Tuple[Set[str], str]:
        """Return ``(matched_addresses, source)`` where source is
        ``"llm"`` or ``"heuristic"``."""

        if not vendor_registry:
            return set(), "empty_registry"

        # ── Build a numbered catalog with short IDs ──
        # Sort for determinism so the same registry always produces the
        # same catalog numbering.
        sorted_addresses: List[str] = sorted(
            vendor_registry.keys(),
            key=lambda a: (vendor_registry[a].get("name", "").lower(), a),
        )

        catalog_lines: List[str] = []
        idx_to_address: Dict[int, str] = {}

        for idx, address in enumerate(sorted_addresses):
            profile = vendor_registry[address]
            services = sorted({
                str(s).strip().lower()
                for s in profile.get("services", [])
                if str(s).strip()
            })
            if not services:
                continue
            name = str(profile.get("name", "Vendor"))
            catalog_lines.append(
                f"  {idx}. {name} — services: {', '.join(services)}"
            )
            idx_to_address[idx] = address

        if not catalog_lines:
            return set(), "empty_catalog"

        # ── Build the user prompt ──
        prompt = (
            f"Customer request:\n"
            f"  Service needed: {service}\n"
            f"  Additional notes: {notes or '(none)'}\n"
            f"  Budget: ${max(0, int(budget))}\n\n"
            f"Vendor catalog (number — name — services):\n"
            + "\n".join(catalog_lines)
            + f"\n\nSelect up to {self.max_selected} vendors whose services "
            f"can fulfil this request.  Return ONLY the JSON."
        )

        logger.info(
            "[VendorSelector] Asking LLM to match service=%r  "
            "notes=%r  budget=$%s  catalog_size=%d",
            service, notes, budget, len(catalog_lines),
        )

        # ── Call the LLM with structured-output-friendly params ──
        raw = await generate_text(
            system_prompt=VENDOR_SELECTOR_SYSTEM_PROMPT,
            user_prompt=prompt,
            fallback='{"ids":[],"reason":"llm_unavailable"}',
            max_tokens=300,
            temperature=0.2,
        )

        logger.info("[VendorSelector] LLM raw response: %s", raw[:500])

        # ── Parse LLM response ──
        parsed = _extract_json_object(raw)
        raw_ids = parsed.get("ids", parsed.get("selected_ids", []))
        reason = parsed.get("reason", "")

        # Normalise to a list of ints
        if isinstance(raw_ids, (int, float)):
            raw_ids = [raw_ids]
        if isinstance(raw_ids, str):
            # "0,2,5" → [0, 2, 5]
            raw_ids = [x.strip() for x in raw_ids.split(",") if x.strip()]

        selected_addresses: List[str] = []
        for v in raw_ids:
            try:
                idx = int(v)
            except (ValueError, TypeError):
                continue
            if idx in idx_to_address:
                selected_addresses.append(idx_to_address[idx])

        selected_addresses = selected_addresses[: self.max_selected]

        if selected_addresses:
            names = [
                vendor_registry.get(a, {}).get("name", a)
                for a in selected_addresses
            ]
            logger.info(
                "[VendorSelector] LLM selected %d vendors: %s  reason=%s",
                len(selected_addresses), names, reason,
            )
            return set(selected_addresses), "llm"

        # ── Fallback to heuristic ──
        logger.info(
            "[VendorSelector] LLM returned no matches, falling back to heuristic"
        )
        heuristic = _heuristic_select(
            service=service,
            notes=notes,
            vendor_registry=vendor_registry,
        )
        if heuristic:
            names = [
                vendor_registry.get(a, {}).get("name", a) for a in heuristic
            ]
            logger.info(
                "[VendorSelector] Heuristic selected %d vendors: %s",
                len(heuristic), names,
            )
            return heuristic, "heuristic"

        return set(), "none"
