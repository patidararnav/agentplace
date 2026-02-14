"""
Database helper functions for loading agent configurations from Supabase.

These functions translate Supabase rows into the parameter dicts that the
agent factory functions (create_vendor_agent, create_customer_agent, etc.)
expect.  They also provide write helpers for creating jobs and updating
records after a deal closes.
"""

import json
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

from supabase_client import (
    TABLE_CONSUMER,
    TABLE_JOBS,
    TABLE_VENDOR,
    get_supabase,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════
#  READ helpers
# ═══════════════════════════════════════════════════════════════════════════


def load_all_vendors() -> List[Dict[str, Any]]:
    """Load all vendors from Supabase. Returns raw rows."""
    sb = get_supabase()
    result = sb.table(TABLE_VENDOR).select("*").execute()
    return result.data or []


def load_vendor(vendor_id: int) -> Optional[Dict[str, Any]]:
    """Load a single vendor by ID."""
    sb = get_supabase()
    result = (
        sb.table(TABLE_VENDOR)
        .select("*")
        .eq("vendor_id", vendor_id)
        .maybe_single()
        .execute()
    )
    return result.data


def load_vendors_for_service(service_type: str) -> List[Dict[str, Any]]:
    """Load all vendors whose job_types include the given service."""
    all_vendors = load_all_vendors()
    needle = service_type.strip().lower()
    matches = []
    for row in all_vendors:
        job_types = row.get("job_types") or []
        for jt in job_types:
            if isinstance(jt, dict) and needle in jt.get("type", "").lower():
                matches.append(row)
                break
    return matches


def vendor_row_to_agent_config(row: Dict[str, Any]) -> Dict[str, Any]:
    """Convert a Supabase VendorData row into kwargs for create_vendor_agent.

    Returns a dict with keys: name, services, base_prices, aggression, vendor_id.
    """
    job_types = row.get("job_types") or []
    services = []
    base_prices: Dict[str, int] = {}
    for jt in job_types:
        if isinstance(jt, dict):
            svc = jt.get("type", "").strip().lower()
            price = int(jt.get("price", 150))
            if svc:
                services.append(svc)
                base_prices[svc] = price

    aggression = int(row.get("negotiation_aggression") or 2)
    aggression = max(1, min(5, aggression))

    return {
        "vendor_id": int(row.get("vendor_id", 0)),
        "name": row.get("name", "Vendor"),
        "services": services,
        "base_prices": base_prices,
        "aggression": aggression,
        "max_distance_miles": int(row.get("max_distance_miles") or 0),
        "home_location": row.get("home_location") or {"lat": 0, "lng": 0},
        "experience_years": int(row.get("experience_years") or 0),
        "average_rating": row.get("average_rating"),
        "weekly_availability": row.get("weekly_availability") or {},
    }


def load_consumer(consumer_name: str) -> Optional[Dict[str, Any]]:
    """Load a single consumer by name."""
    sb = get_supabase()
    result = (
        sb.table(TABLE_CONSUMER)
        .select("*")
        .eq("consumer_name", consumer_name)
        .maybe_single()
        .execute()
    )
    return result.data


# ═══════════════════════════════════════════════════════════════════════════
#  WRITE helpers (called after deal closure)
# ═══════════════════════════════════════════════════════════════════════════


def create_job(
    vendor_id: int,
    consumer_name: str,
    job_type: str,
    price: int,
    duration_minutes: int = 60,
    date: Optional[str] = None,
    start_time: str = "09:00",
    status: int = 5,  # 5 = Booked
) -> Optional[Dict[str, Any]]:
    """Create a new job in Supabase and update vendor/consumer job_ids.

    Returns the created job row, or None on failure.
    """
    sb = get_supabase()

    # Generate next job_id
    existing = (
        sb.table(TABLE_JOBS)
        .select("job_id")
        .order("job_id", desc=True)
        .limit(1)
        .execute()
    )
    next_id = ((existing.data[0]["job_id"] if existing.data else 0) + 1)

    if date is None:
        date = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")

    # Calculate end_time from start_time + duration
    try:
        st = datetime.strptime(start_time, "%H:%M")
        et = st + timedelta(minutes=duration_minutes)
        end_time = et.strftime("%H:%M")
    except ValueError:
        end_time = "10:00"

    row = {
        "job_id": next_id,
        "vendor_id": vendor_id,
        "consumer_name": consumer_name,
        "type": job_type,
        "date": date,
        "start_time": start_time,
        "end_time": end_time,
        "price": price,
        "duration_minutes": duration_minutes,
        "status": status,
    }

    try:
        result = sb.table(TABLE_JOBS).insert(row).execute()
    except Exception as e:
        logger.error("Failed to create job: %s", e)
        return None

    # Update vendor's job_ids
    try:
        vendor = (
            sb.table(TABLE_VENDOR)
            .select("job_ids")
            .eq("vendor_id", vendor_id)
            .maybe_single()
            .execute()
        )
        if vendor.data:
            job_ids = vendor.data.get("job_ids") or []
            job_ids.append(next_id)
            sb.table(TABLE_VENDOR).update({"job_ids": job_ids}).eq(
                "vendor_id", vendor_id
            ).execute()
    except Exception as e:
        logger.warning("Failed to update vendor job_ids: %s", e)

    # Update consumer's job_ids + job_count
    try:
        consumer = (
            sb.table(TABLE_CONSUMER)
            .select("job_ids, job_count")
            .eq("consumer_name", consumer_name)
            .maybe_single()
            .execute()
        )
        if consumer.data:
            c_ids = consumer.data.get("job_ids") or []
            c_ids.append(next_id)
            sb.table(TABLE_CONSUMER).update(
                {"job_ids": c_ids, "job_count": len(c_ids)}
            ).eq("consumer_name", consumer_name).execute()
    except Exception as e:
        logger.warning("Failed to update consumer job_ids: %s", e)

    logger.info(
        "Created job #%d: vendor=%d consumer=%s type=%s price=$%d",
        next_id, vendor_id, consumer_name, job_type, price,
    )
    return result.data[0] if result.data else row


def update_job_status(job_id: int, status: int) -> bool:
    """Update a job's status. Returns True on success."""
    sb = get_supabase()
    try:
        sb.table(TABLE_JOBS).update({"status": status}).eq("job_id", job_id).execute()
        return True
    except Exception as e:
        logger.error("Failed to update job %d status: %s", job_id, e)
        return False
