"""
Database helper functions for loading agent configurations from Supabase.

These functions translate Supabase rows into the parameter dicts that the
agent factory functions (create_vendor_agent, create_customer_agent, etc.)
expect. They also provide write helpers used by backend API routes.
"""

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

PRICING_STRATEGY_MAXIMIZE_JOBS = "maximize_jobs"
PRICING_STRATEGY_HIGH_VALUE_ONLY = "high_value_only"
PRICING_STRATEGY_YIELD_OPTIMIZER = "yield_optimizer"

_PRICING_STRATEGY_CODE_TO_TOKEN = {
    1: PRICING_STRATEGY_MAXIMIZE_JOBS,
    2: PRICING_STRATEGY_HIGH_VALUE_ONLY,
    3: PRICING_STRATEGY_YIELD_OPTIMIZER,
}

_PRICING_STRATEGY_TOKEN_TO_CODE = {
    PRICING_STRATEGY_MAXIMIZE_JOBS: 1,
    PRICING_STRATEGY_HIGH_VALUE_ONLY: 2,
    PRICING_STRATEGY_YIELD_OPTIMIZER: 3,
}


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
    matches: List[Dict[str, Any]] = []
    for row in all_vendors:
        job_types = row.get("job_types") or []
        for jt in job_types:
            if isinstance(jt, dict) and needle in str(jt.get("type", "")).lower():
                matches.append(row)
                break
    return matches


def vendor_row_to_agent_config(row: Dict[str, Any]) -> Dict[str, Any]:
    """Convert a Supabase VendorData row into kwargs for create_vendor_agent.

    Returns a dict with keys: name, services, base_prices, aggression,
    pricing_strategy, vendor_id.
    """
    job_types = row.get("job_types") or []
    services: List[str] = []
    base_prices: Dict[str, int] = {}
    for jt in job_types:
        if isinstance(jt, dict):
            svc = str(jt.get("type", "")).strip().lower()
            price = int(jt.get("price", 150))
            if svc:
                services.append(svc)
                base_prices[svc] = price

    aggression = int(row.get("negotiation_aggression") or 2)
    aggression = max(1, min(5, aggression))
    raw_strategy = row.get("pricing_strategy")
    if raw_strategy is None:
        raw_strategy = row.get("strategy")
    strategy = _normalize_pricing_strategy(raw_strategy)

    return {
        "vendor_id": int(row.get("vendor_id", 0)),
        "name": row.get("name", "Vendor"),
        "services": services,
        "base_prices": base_prices,
        "aggression": aggression,
        "pricing_strategy": strategy,
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
#  WRITE helpers
# ═══════════════════════════════════════════════════════════════════════════


def _normalize_pricing_strategy(raw: Any) -> str:
    if isinstance(raw, (int, float)):
        return _PRICING_STRATEGY_CODE_TO_TOKEN.get(
            int(raw), PRICING_STRATEGY_MAXIMIZE_JOBS
        )

    token = str(raw or "").strip().lower().replace("-", "_").replace(" ", "_")
    if not token:
        return PRICING_STRATEGY_MAXIMIZE_JOBS
    if token.isdigit():
        return _PRICING_STRATEGY_CODE_TO_TOKEN.get(
            int(token), PRICING_STRATEGY_MAXIMIZE_JOBS
        )
    if token in {"maximize_number_of_jobs", "max_jobs"}:
        return PRICING_STRATEGY_MAXIMIZE_JOBS
    if token in {"high_value_jobs_only", "aggressive"}:
        return PRICING_STRATEGY_HIGH_VALUE_ONLY
    if token in {"yield_optimization"}:
        return PRICING_STRATEGY_YIELD_OPTIMIZER
    if token not in _PRICING_STRATEGY_TOKEN_TO_CODE:
        return PRICING_STRATEGY_MAXIMIZE_JOBS
    return token


def _pricing_strategy_code(raw: Any) -> int:
    token = _normalize_pricing_strategy(raw)
    return _PRICING_STRATEGY_TOKEN_TO_CODE.get(token, 1)


def _is_missing_column_error(exc: Exception, column: str) -> bool:
    message = str(exc).lower()
    return "column" in message and column.lower() in message


def _next_numeric_id(table_name: str, id_column: str) -> int:
    sb = get_supabase()
    existing = (
        sb.table(table_name)
        .select(id_column)
        .order(id_column, desc=True)
        .limit(1)
        .execute()
    )
    return ((existing.data[0][id_column] if existing.data else 0) + 1)


def _to_int_list(values: Any) -> List[int]:
    if not isinstance(values, list):
        return []
    out: List[int] = []
    for value in values:
        try:
            out.append(int(value))
        except (TypeError, ValueError):
            continue
    return out


def _normalize_job_types(job_types: Any) -> List[Dict[str, Any]]:
    if not isinstance(job_types, list):
        return []
    normalized: List[Dict[str, Any]] = []
    for jt in job_types:
        if not isinstance(jt, dict):
            continue
        service = str(jt.get("type") or "").strip()
        if not service:
            continue
        try:
            price = int(jt.get("price") or 0)
        except (TypeError, ValueError):
            price = 0
        try:
            duration = int(jt.get("duration_minutes") or 60)
        except (TypeError, ValueError):
            duration = 60
        normalized.append({
            "type": service,
            "price": max(0, price),
            "duration_minutes": max(1, duration),
        })
    return normalized


def create_or_update_vendor(payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Create or update a vendor row in Supabase by vendor_id."""
    sb = get_supabase()

    vendor_id = int(payload.get("vendor_id") or 0)
    if vendor_id <= 0:
        vendor_id = _next_numeric_id(TABLE_VENDOR, "vendor_id")

    name = str(payload.get("name") or f"Vendor {vendor_id}").strip() or f"Vendor {vendor_id}"
    weekly_availability = payload.get("weekly_availability")
    if not isinstance(weekly_availability, dict):
        weekly_availability = {}
    home_location = payload.get("home_location")
    if not isinstance(home_location, dict):
        home_location = {"lat": 0, "lng": 0}

    raw_strategy = payload.get("pricing_strategy")
    if raw_strategy is None:
        raw_strategy = payload.get("strategy")
    strategy_token = _normalize_pricing_strategy(raw_strategy)
    strategy_code = _pricing_strategy_code(raw_strategy)

    row: Dict[str, Any] = {
        "vendor_id": vendor_id,
        "name": name,
        "weekly_availability": weekly_availability,
        "max_distance_miles": int(payload.get("max_distance_miles") or 0),
        "home_location": {
            "lat": float(home_location.get("lat", 0)),
            "lng": float(home_location.get("lng", 0)),
        },
        "experience_years": int(payload.get("experience_years") or 0),
        "negotiation_aggression": max(1, min(5, int(payload.get("negotiation_aggression") or 1))),
        "pricing_strategy": strategy_token,
        "strategy": strategy_code,
        "job_types": _normalize_job_types(payload.get("job_types")),
        "job_ids": _to_int_list(payload.get("job_ids")),
        "reviews": [str(r) for r in (payload.get("reviews") or []) if str(r).strip()],
        "average_rating": (
            str(payload.get("average_rating"))
            if payload.get("average_rating") is not None
            else None
        ),
        "total_ratings": (
            str(payload.get("total_ratings"))
            if payload.get("total_ratings") is not None
            else None
        ),
    }

    existing = (
        sb.table(TABLE_VENDOR)
        .select("vendor_id")
        .eq("vendor_id", vendor_id)
        .maybe_single()
        .execute()
    )
    is_update = bool(existing.data)
    update_row = {k: v for k, v in row.items() if k != "vendor_id"}

    insert_row = dict(row)
    patch_row = dict(update_row)

    def _write() -> Dict[str, Any]:
        if is_update:
            result = (
                sb.table(TABLE_VENDOR)
                .update(patch_row)
                .eq("vendor_id", vendor_id)
                .select("*")
                .single()
                .execute()
            )
        else:
            result = sb.table(TABLE_VENDOR).insert(insert_row).select("*").single().execute()
        return result.data if result.data else row

    for _ in range(3):
        try:
            return _write()
        except Exception as exc:
            if _is_missing_column_error(exc, "pricing_strategy"):
                logger.warning(
                    "Vendor table missing pricing_strategy column; retrying without it for vendor_id=%s",
                    vendor_id,
                )
                insert_row.pop("pricing_strategy", None)
                patch_row.pop("pricing_strategy", None)
                continue
            if _is_missing_column_error(exc, "strategy"):
                logger.warning(
                    "Vendor table missing strategy column; retrying without it for vendor_id=%s",
                    vendor_id,
                )
                insert_row.pop("strategy", None)
                patch_row.pop("strategy", None)
                continue
            logger.error("Failed to upsert vendor %s: %s", vendor_id, exc)
            return None
    logger.error("Failed to upsert vendor %s: unsupported table schema", vendor_id)
    return None


def create_or_get_consumer(
    consumer_name: str,
    job_count: int = 0,
    job_ids: Optional[List[int]] = None,
) -> Optional[Dict[str, Any]]:
    """Return an existing consumer row, or create one when absent."""
    cleaned = str(consumer_name or "").strip()
    if not cleaned:
        return None

    existing = load_consumer(cleaned)
    if existing:
        return existing

    sb = get_supabase()
    row = {
        "consumer_name": cleaned,
        "job_count": max(0, int(job_count or 0)),
        "job_ids": _to_int_list(job_ids or []),
    }
    try:
        result = sb.table(TABLE_CONSUMER).insert(row).select("*").single().execute()
        return result.data if result.data else row
    except Exception as exc:
        logger.error("Failed to create consumer %s: %s", cleaned, exc)
        return None


def add_service_to_vendor(
    vendor_name: str,
    service_name: str,
    job_type: str,
    price: int,
    duration_minutes: int = 60,
) -> Optional[Dict[str, Any]]:
    """Add or update a single job_type entry for a vendor by name."""
    sb = get_supabase()
    cleaned_vendor = str(vendor_name or "").strip().lower()
    if not cleaned_vendor:
        return None

    target: Optional[Dict[str, Any]] = None
    for vendor in load_all_vendors():
        if str(vendor.get("name", "")).strip().lower() == cleaned_vendor:
            target = vendor
            break
    if target is None:
        return None

    normalized_type = str(job_type or service_name or "").strip()
    if not normalized_type:
        return None

    display_type = str(service_name or normalized_type).strip() or normalized_type
    updated_job_types = list(target.get("job_types") or [])
    replaced = False
    for idx, jt in enumerate(updated_job_types):
        if not isinstance(jt, dict):
            continue
        if str(jt.get("type", "")).strip().lower() == normalized_type.lower():
            updated_job_types[idx] = {
                "type": str(jt.get("type") or display_type),
                "price": max(0, int(price or 0)),
                "duration_minutes": max(1, int(duration_minutes or 60)),
            }
            replaced = True
            break
    if not replaced:
        updated_job_types.append({
            "type": display_type,
            "price": max(0, int(price or 0)),
            "duration_minutes": max(1, int(duration_minutes or 60)),
        })

    vendor_id = int(target.get("vendor_id") or 0)
    if vendor_id <= 0:
        return None
    try:
        result = (
            sb.table(TABLE_VENDOR)
            .update({"job_types": updated_job_types})
            .eq("vendor_id", vendor_id)
            .select("*")
            .single()
            .execute()
        )
        return result.data if result.data else {**target, "job_types": updated_job_types}
    except Exception as exc:
        logger.error("Failed to update job_types for vendor %s: %s", vendor_name, exc)
        return None


def create_job(
    vendor_id: int,
    consumer_name: str,
    job_type: str,
    price: int,
    duration_minutes: int = 60,
    date: Optional[str] = None,
    start_time: str = "09:00",
    status: int = 5,  # 5 = Booked
    vendor_name: Optional[str] = None,
) -> Optional[Dict[str, Any]]:
    """Create a new booked job in Supabase and update vendor/consumer job_ids."""
    sb = get_supabase()

    vendor_id = int(vendor_id or 0)
    cleaned_consumer_name = str(consumer_name or "").strip()
    cleaned_job_type = str(job_type or "").strip() or "unknown"
    if vendor_id <= 0:
        logger.error("Cannot create job without valid vendor_id (got %s)", vendor_id)
        return None
    if not cleaned_consumer_name:
        logger.error("Cannot create job without consumer_name")
        return None

    # Ensure related records exist before creating the job row.
    create_or_get_consumer(cleaned_consumer_name)
    vendor = load_vendor(vendor_id)
    if vendor is None:
        logger.warning(
            "Vendor %s missing when creating job; creating a default vendor row",
            vendor_id,
        )
        create_or_update_vendor({
            "vendor_id": vendor_id,
            "name": vendor_name or f"Vendor {vendor_id}",
            "weekly_availability": {},
            "max_distance_miles": 0,
            "home_location": {"lat": 0, "lng": 0},
            "experience_years": 0,
            "negotiation_aggression": 1,
            "pricing_strategy": "maximize_jobs",
            "job_types": [{
                "type": cleaned_job_type,
                "price": int(price or 0),
                "duration_minutes": int(duration_minutes or 60),
            }],
            "job_ids": [],
            "reviews": [],
            "average_rating": None,
            "total_ratings": None,
        })

    next_id = _next_numeric_id(TABLE_JOBS, "job_id")

    if date is None:
        date = (datetime.now() + timedelta(days=3)).strftime("%Y-%m-%d")

    # Calculate end_time from start_time + duration
    try:
        st = datetime.strptime(start_time, "%H:%M")
        et = st + timedelta(minutes=duration_minutes)
        end_time = et.strftime("%H:%M")
    except ValueError:
        start_time = "09:00"
        end_time = "10:00"

    row = {
        "job_id": next_id,
        "vendor_id": vendor_id,
        "consumer_name": cleaned_consumer_name,
        "type": cleaned_job_type,
        "date": date,
        "start_time": start_time,
        "end_time": end_time,
        "price": int(price or 0),
        "duration_minutes": max(1, int(duration_minutes or 60)),
        "status": int(status or 5),
    }

    try:
        result = sb.table(TABLE_JOBS).insert(row).select("*").single().execute()
    except Exception as exc:
        logger.error("Failed to create job: %s", exc)
        return None

    # Update vendor's job_ids
    try:
        vendor_result = (
            sb.table(TABLE_VENDOR)
            .select("job_ids")
            .eq("vendor_id", vendor_id)
            .maybe_single()
            .execute()
        )
        if vendor_result.data:
            job_ids = _to_int_list(vendor_result.data.get("job_ids"))
            if next_id not in job_ids:
                job_ids.append(next_id)
            sb.table(TABLE_VENDOR).update({"job_ids": job_ids}).eq(
                "vendor_id", vendor_id
            ).execute()
    except Exception as exc:
        logger.warning("Failed to update vendor job_ids: %s", exc)

    # Update consumer's job_ids + job_count
    try:
        consumer = (
            sb.table(TABLE_CONSUMER)
            .select("job_ids, job_count")
            .eq("consumer_name", cleaned_consumer_name)
            .maybe_single()
            .execute()
        )
        if consumer.data:
            c_ids = _to_int_list(consumer.data.get("job_ids"))
            if next_id not in c_ids:
                c_ids.append(next_id)
            sb.table(TABLE_CONSUMER).update(
                {"job_ids": c_ids, "job_count": len(c_ids)}
            ).eq("consumer_name", cleaned_consumer_name).execute()
        else:
            sb.table(TABLE_CONSUMER).insert({
                "consumer_name": cleaned_consumer_name,
                "job_count": 1,
                "job_ids": [next_id],
            }).execute()
    except Exception as exc:
        logger.warning("Failed to update consumer job_ids: %s", exc)

    logger.info(
        "Created job #%d: vendor=%d consumer=%s type=%s price=$%d",
        next_id, vendor_id, cleaned_consumer_name, cleaned_job_type, int(price or 0),
    )
    return result.data if result.data else row


def update_job_status(job_id: int, status: int) -> bool:
    """Update a job's status. Returns True on success."""
    sb = get_supabase()
    try:
        sb.table(TABLE_JOBS).update({"status": status}).eq("job_id", job_id).execute()
        return True
    except Exception as exc:
        logger.error("Failed to update job %d status: %s", job_id, exc)
        return False


def _remove_job_ids_from_vendor(vendor_id: int, remove_ids: set[int]) -> None:
    if vendor_id <= 0 or not remove_ids:
        return
    sb = get_supabase()
    try:
        row = (
            sb.table(TABLE_VENDOR)
            .select("job_ids")
            .eq("vendor_id", vendor_id)
            .maybe_single()
            .execute()
        )
        if not row.data:
            return
        current = _to_int_list(row.data.get("job_ids"))
        next_ids = [jid for jid in current if jid not in remove_ids]
        sb.table(TABLE_VENDOR).update({"job_ids": next_ids}).eq("vendor_id", vendor_id).execute()
    except Exception as exc:
        logger.warning("Failed to unlink jobs from vendor %s: %s", vendor_id, exc)


def _remove_job_ids_from_consumer(consumer_name: str, remove_ids: set[int]) -> None:
    cleaned = str(consumer_name or "").strip()
    if not cleaned or not remove_ids:
        return
    sb = get_supabase()
    try:
        row = (
            sb.table(TABLE_CONSUMER)
            .select("job_ids, job_count")
            .eq("consumer_name", cleaned)
            .maybe_single()
            .execute()
        )
        if not row.data:
            return
        current = _to_int_list(row.data.get("job_ids"))
        next_ids = [jid for jid in current if jid not in remove_ids]
        sb.table(TABLE_CONSUMER).update(
            {"job_ids": next_ids, "job_count": len(next_ids)}
        ).eq("consumer_name", cleaned).execute()
    except Exception as exc:
        logger.warning("Failed to unlink jobs from consumer %s: %s", cleaned, exc)


def delete_job(job_id: int) -> bool:
    """Delete one job and unlink it from vendor + consumer job_ids arrays."""
    sb = get_supabase()
    try:
        existing = (
            sb.table(TABLE_JOBS)
            .select("job_id, vendor_id, consumer_name")
            .eq("job_id", job_id)
            .maybe_single()
            .execute()
        )
        row = existing.data or {}

        sb.table(TABLE_JOBS).delete().eq("job_id", job_id).execute()

        if row:
            remove_ids = {int(row.get("job_id") or job_id)}
            _remove_job_ids_from_vendor(int(row.get("vendor_id") or 0), remove_ids)
            _remove_job_ids_from_consumer(str(row.get("consumer_name") or ""), remove_ids)
        return True
    except Exception as exc:
        logger.error("Failed to delete job %d: %s", job_id, exc)
        return False


def delete_customer(consumer_name: str) -> bool:
    """Delete a consumer and all of their jobs, cleaning vendor references."""
    cleaned = str(consumer_name or "").strip()
    if not cleaned:
        return False
    sb = get_supabase()
    try:
        jobs_result = (
            sb.table(TABLE_JOBS)
            .select("job_id, vendor_id")
            .eq("consumer_name", cleaned)
            .execute()
        )
        jobs = jobs_result.data or []
        remove_ids: set[int] = set()
        vendor_ids: set[int] = set()
        for row in jobs:
            try:
                remove_ids.add(int(row.get("job_id")))
            except (TypeError, ValueError):
                pass
            try:
                vid = int(row.get("vendor_id") or 0)
                if vid > 0:
                    vendor_ids.add(vid)
            except (TypeError, ValueError):
                pass

        sb.table(TABLE_JOBS).delete().eq("consumer_name", cleaned).execute()
        for vendor_id in vendor_ids:
            _remove_job_ids_from_vendor(vendor_id, remove_ids)

        sb.table(TABLE_CONSUMER).delete().eq("consumer_name", cleaned).execute()
        return True
    except Exception as exc:
        logger.error("Failed to delete consumer %s: %s", cleaned, exc)
        return False


def delete_vendor(vendor_id: int) -> bool:
    """Delete a vendor and all of their jobs, cleaning consumer references."""
    vendor_id = int(vendor_id or 0)
    if vendor_id <= 0:
        return False
    sb = get_supabase()
    try:
        jobs_result = (
            sb.table(TABLE_JOBS)
            .select("job_id, consumer_name")
            .eq("vendor_id", vendor_id)
            .execute()
        )
        jobs = jobs_result.data or []
        remove_ids: set[int] = set()
        consumer_names: set[str] = set()
        for row in jobs:
            try:
                remove_ids.add(int(row.get("job_id")))
            except (TypeError, ValueError):
                pass
            name = str(row.get("consumer_name") or "").strip()
            if name:
                consumer_names.add(name)

        sb.table(TABLE_JOBS).delete().eq("vendor_id", vendor_id).execute()
        for consumer_name in consumer_names:
            _remove_job_ids_from_consumer(consumer_name, remove_ids)

        sb.table(TABLE_VENDOR).delete().eq("vendor_id", vendor_id).execute()
        return True
    except Exception as exc:
        logger.error("Failed to delete vendor %d: %s", vendor_id, exc)
        return False


# ═══════════════════════════════════════════════════════════════════════════
#  ANALYTICS helpers
# ═══════════════════════════════════════════════════════════════════════════


def get_all_job_types_with_prices() -> List[Dict[str, Any]]:
    """Return all jobs with their type and price from the database."""
    sb = get_supabase()
    try:
        result = sb.table(TABLE_JOBS).select("price, type").execute()
        return result.data or []
    except Exception as exc:
        logger.warning("Failed to query jobs: %s", exc)
        return []


def compute_avg_price(rows: List[Dict[str, Any]], matched_types: List[str]) -> Dict[str, Any]:
    """Compute average price from rows whose type is in *matched_types*."""
    matched_lower = {t.strip().lower() for t in matched_types if t.strip()}
    prices: list[int] = []
    for row in rows:
        job_type = (row.get("type") or "").strip().lower()
        price = row.get("price")
        if price is None or price <= 0:
            continue
        if job_type in matched_lower:
            prices.append(int(price))

    avg = round(sum(prices) / len(prices)) if prices else 0
    return {
        "avg_price": avg,
        "job_count": len(prices),
        "matched_types": sorted(matched_lower),
    }
