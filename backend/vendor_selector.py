"""
Vendor selection agent for choosing relevant vendors per customer request.

This module provides an LLM-based selector that matches customer service
requests to vendors based on their capabilities.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Set, Tuple

from chat_utils import LLMCallError, generate_text

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


class VendorSelectionError(RuntimeError):
    """Raised when vendor matching cannot be completed by the LLM."""


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
    """LLM-based selector.

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
        """Return ``(matched_addresses, source)`` where source is ``"llm"``.

        Raises:
            VendorSelectionError: LLM call fails, output is invalid, or no
                vendors are matched.
        """

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
        catalog_debug: List[Dict[str, Any]] = []

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
            catalog_debug.append({
                "idx": idx,
                "name": name,
                "address": address,
                "vendor_id": int(profile.get("vendor_id") or 0),
                "services": services,
            })

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
            "notes_len=%d  budget=$%s  catalog_size=%d",
            service, len(notes or ""), budget, len(catalog_lines),
        )

        # ── Call the LLM with structured-output-friendly params ──
        try:
            raw = await generate_text(
                system_prompt=VENDOR_SELECTOR_SYSTEM_PROMPT,
                user_prompt=prompt,
                max_tokens=300,
                temperature=0.2,
                strict=True,
            )
        except LLMCallError as exc:
            logger.error(
                "[VendorSelector] LLM call failed while matching vendors: %s",
                exc,
            )
            raise VendorSelectionError(
                "LLM failed to match vendors because the request to the model failed."
            ) from exc

        logger.info("[VendorSelector] LLM raw response: %s", raw[:500])

        # ── Parse LLM response ──
        parsed = _extract_json_object(raw)
        if not parsed:
            raise VendorSelectionError(
                "LLM failed to match vendors because it returned invalid JSON."
            )
        raw_ids = parsed.get("ids", parsed.get("selected_ids", []))
        reason = parsed.get("reason", "")

        # Normalise to a list of ints
        if isinstance(raw_ids, (int, float)):
            raw_ids = [raw_ids]
        if isinstance(raw_ids, str):
            # "0,2,5" → [0, 2, 5]
            raw_ids = [x.strip() for x in raw_ids.split(",") if x.strip()]

        normalized_ids: List[int] = []
        selected_addresses: List[str] = []
        for v in raw_ids:
            try:
                idx = int(v)
            except (ValueError, TypeError):
                continue
            normalized_ids.append(idx)
            if idx in idx_to_address:
                selected_addresses.append(idx_to_address[idx])

        selected_addresses = selected_addresses[: self.max_selected]
        selected_names = [
            vendor_registry.get(a, {}).get("name", a)
            for a in selected_addresses
        ]
        logger.info(
            "[VendorSelector] Parsed response ids_raw=%r ids_normalized=%s mapped_addresses=%s mapped_names=%s reason=%r",
            raw_ids,
            normalized_ids,
            selected_addresses,
            selected_names,
            reason,
        )
        logger.debug(
            "[VendorSelector] Catalog detail: %s",
            json.dumps(catalog_debug, sort_keys=True),
        )

        if selected_addresses:
            logger.info(
                "[VendorSelector] LLM selected %d vendors: %s  reason=%s",
                len(selected_addresses), selected_names, reason,
            )
            return set(selected_addresses), "llm"

        raise VendorSelectionError(
            "LLM failed to match vendors because it did not return any valid vendor IDs."
        )
