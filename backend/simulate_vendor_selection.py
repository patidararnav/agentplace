#!/usr/bin/env python3
"""
End-to-end local simulation of the agentplace negotiation marketplace.

Runs one orchestrator, multiple vendor agents, and one customer agent in a
single Bureau.  All agents are created via the same factory functions used
by the production scripts (orchestrator.py, vendor.py, customer.py) — zero
duplicated logic.

Usage:
    python simulate_vendor_selection.py --config simulation_config.example.json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
from contextlib import suppress
from pathlib import Path
from typing import Any, Dict, List

from uagents import Bureau

from customer import create_customer_agent
from orchestrator import create_orchestrator_agent
from vendor import create_vendor_agent

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s: %(message)s",
)
log = logging.getLogger("simulation")


# ─── Configuration ────────────────────────────────────────────────────────


def load_config(path: Path) -> Dict[str, Any]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    c = raw["customer"]
    customer = {
        "name": c["name"],
        "seed": c["seed"],
        "service": c["service"].lower(),
        "budget": c["budget"],
        "urgency": max(1, min(5, c.get("urgency", 3))),
        "aggression": max(1, min(5, c.get("aggression", 3))),
        "notes": c.get("notes", ""),
    }

    vendors: List[Dict[str, Any]] = []
    for v in raw["vendors"]:
        services = [s.lower() for s in v.get("services", v.get("specialties", []))]
        bp_raw = v.get("base_prices", {})
        base_prices = {k.lower(): int(val) for k, val in bp_raw.items()} if bp_raw else {}
        if not base_prices:
            base_prices = {s: v.get("base_price", 150) for s in services}
        vendors.append({
            "name": v["name"],
            "seed": v["seed"],
            "services": services,
            "base_prices": base_prices,
            "aggression": max(1, min(5, v.get("aggression", 2))),
        })

    return {
        "bureau_port": raw.get("bureau_port", 8100),
        "max_rounds": raw.get("max_rounds", 8),
        "startup_delay": raw.get("startup_delay", 3.0),
        "timeout_seconds": raw.get("timeout_seconds", 90),
        "customer": customer,
        "vendors": vendors,
    }


# ─── Simulation Runner ───────────────────────────────────────────────────


async def run_simulation(
    config_path: Path,
    timeout_seconds: int | None = None,
) -> Dict[str, Any]:
    cfg = load_config(config_path)
    timeout = timeout_seconds or cfg["timeout_seconds"]

    result: Dict[str, Any] = {
        "config": {
            "service": cfg["customer"]["service"],
            "budget": cfg["customer"]["budget"],
            "urgency": cfg["customer"]["urgency"],
            "customer_aggression": cfg["customer"]["aggression"],
            "vendors": [v["name"] for v in cfg["vendors"]],
            "max_rounds": cfg["max_rounds"],
        }
    }
    finished = asyncio.Event()

    # ── create agents via the production factories ──

    orchestrator = create_orchestrator_agent(
        seed="orchestrator_sim_e2e_seed_2026",
        max_rounds=cfg["max_rounds"],
        consensus_mode=True,
    )

    vendor_agents = [
        create_vendor_agent(
            name=v["name"],
            seed=v["seed"],
            services=v["services"],
            base_prices=v["base_prices"],
            aggression=v["aggression"],
            orchestrator_address=orchestrator.address,
        )
        for v in cfg["vendors"]
    ]

    cust = cfg["customer"]
    customer = create_customer_agent(
        name=cust["name"],
        seed=cust["seed"],
        service=cust["service"],
        budget=cust["budget"],
        urgency=cust["urgency"],
        aggression=cust["aggression"],
        notes=cust["notes"],
        orchestrator_address=orchestrator.address,
        startup_delay=cfg["startup_delay"],
        result_sink=result,
        finished_event=finished,
    )

    # ── run Bureau ──

    bureau = Bureau(port=cfg["bureau_port"], log_level="INFO")
    bureau.add(orchestrator)
    for va in vendor_agents:
        bureau.add(va)
    bureau.add(customer)

    log.info(
        "Bureau starting on port %s  |  %d vendor(s)  |  timeout %ss",
        cfg["bureau_port"], len(vendor_agents), timeout,
    )

    run_task = asyncio.create_task(bureau.run_async())
    try:
        await asyncio.wait_for(finished.wait(), timeout=timeout)
    except asyncio.TimeoutError:
        result["outcome"] = "timeout"
        result["outcome_text"] = f"Simulation timed out after {timeout}s."
        log.warning("Simulation timed out after %ss", timeout)
    finally:
        run_task.cancel()
        with suppress(asyncio.CancelledError):
            await run_task

    return result


# ─── Display ──────────────────────────────────────────────────────────────


def display_results(result: Dict[str, Any]) -> None:
    cfg = result.get("config", {})
    vendor_results = result.get("vendor_results", [])
    outcome = result.get("outcome", "unknown")
    winner = result.get("winner", "")
    winner_price = result.get("winner_price", 0)

    deals = sorted(
        [v for v in vendor_results if v["outcome"] == "deal"],
        key=lambda v: v["price"],
    )
    non_deals = [v for v in vendor_results if v["outcome"] != "deal"]

    print()
    print("=" * 64)
    print("  SIMULATION RESULT")
    print("=" * 64)
    print(f"  Service:    {cfg.get('service', '?')}")
    print(f"  Budget:     ${cfg.get('budget', '?')}")
    print(f"  Urgency:    {cfg.get('urgency', '?')}/5")
    print(f"  Aggression: {cfg.get('customer_aggression', '?')}/5")
    print(f"  Vendors:    {', '.join(cfg.get('vendors', []))}")
    print(f"  Max rounds: {cfg.get('max_rounds', '?')}")
    print("-" * 64)

    if vendor_results:
        print("  VENDOR RESULTS")
        print()
        print(
            f"  {'Rank':<6}{'Vendor':<18}{'Price':>7}"
            f"{'Rounds':>9}  {'Outcome'}"
        )
        print(
            f"  {'----':<6}{'------':<18}{'-----':>7}"
            f"{'------':>9}  {'-------'}"
        )
        rank = 1
        for v in deals:
            tag = "  << SELECTED" if v["vendor_name"] == winner else ""
            print(
                f"  {str(rank) + '.':<6}{v['vendor_name']:<18}"
                f"{'$' + str(v['price']):>7}"
                f"{v['rounds']:>9}  DEAL{tag}"
            )
            rank += 1
        for v in non_deals:
            print(
                f"  {'X.':<6}{v['vendor_name']:<18}"
                f"{'--':>7}"
                f"{v['rounds']:>9}  {v['outcome'].upper()}"
            )
        print()

    print("-" * 64)
    if outcome == "deal" and winner:
        print(f"  WINNER:  {winner} at ${winner_price}")
    elif outcome == "no_deal":
        print("  RESULT:  No deal reached with any vendor.")
    elif outcome == "timeout":
        print(f"  RESULT:  {result.get('outcome_text', 'Timed out.')}")
    else:
        print(f"  RESULT:  {outcome.upper()}")
    print("=" * 64)


# ─── CLI ──────────────────────────────────────────────────────────────────


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="End-to-end simulation of the agentplace marketplace.",
    )
    parser.add_argument(
        "--config", default="simulation_config.example.json",
        help="Path to JSON config file.",
    )
    parser.add_argument(
        "--timeout-seconds", type=int, default=None,
        help="Hard timeout in seconds (overrides config value).",
    )
    parser.add_argument(
        "--result-json", default="",
        help="Optional path to write machine-readable results JSON.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    result = asyncio.run(
        run_simulation(
            config_path=Path(args.config),
            timeout_seconds=args.timeout_seconds,
        )
    )
    display_results(result)
    if args.result_json:
        out = Path(args.result_json)
        out.write_text(json.dumps(result, indent=2), encoding="utf-8")
        print(f"Wrote JSON to {out}")


if __name__ == "__main__":
    main()
