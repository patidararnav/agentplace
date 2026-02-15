#!/usr/bin/env python3
"""
MCP Server for AgentPlace — exposes Supabase database operations as typed tools.

The agents (orchestrator, customer, vendor) can use these tools to query and
write vendor data, consumer data, and jobs from the shared Supabase database.

Run:
    python mcp_server.py                     # stdio mode (for MCP clients like Claude Desktop)
    python mcp_server.py --transport sse     # SSE mode (for web/agent integration)
    python mcp_server.py --transport sse --port 8200
"""

import json
import os
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from mcp.server.fastmcp import FastMCP

from supabase_client import (
    TABLE_CONSUMER,
    TABLE_JOBS,
    TABLE_VENDOR,
    get_supabase,
)

load_dotenv()

mcp = FastMCP(
    "AgentPlace Supabase",
    instructions=(
        "MCP server for the AgentPlace marketplace. "
        "Provides tools to query and manage vendors, consumers, and jobs "
        "stored in a Supabase (PostgreSQL) database."
    ),
)


# ═══════════════════════════════════════════════════════════════════════════
#  VENDOR TOOLS
# ═══════════════════════════════════════════════════════════════════════════


@mcp.tool()
def get_all_vendors() -> str:
    """Get all vendors from the database, ordered by vendor_id descending."""
    sb = get_supabase()
    result = sb.table(TABLE_VENDOR).select("*").order("vendor_id", desc=True).execute()
    return json.dumps(result.data, default=str)


@mcp.tool()
def get_vendor(vendor_id: int) -> str:
    """Get a single vendor by their vendor_id.

    Args:
        vendor_id: The unique vendor identifier.
    """
    sb = get_supabase()
    result = (
        sb.table(TABLE_VENDOR)
        .select("*")
        .eq("vendor_id", vendor_id)
        .maybe_single()
        .execute()
    )
    if result.data is None:
        return json.dumps({"error": f"Vendor {vendor_id} not found"})
    return json.dumps(result.data, default=str)


@mcp.tool()
def search_vendors_by_service(service_type: str) -> str:
    """Find all vendors that offer a specific service type.

    Searches the job_types JSONB array for entries matching the given service.
    Returns vendor profiles with their pricing, ratings, and availability.

    Args:
        service_type: The service to search for (e.g. "plumbing", "electrical", "cleaning").
    """
    sb = get_supabase()
    # Fetch all vendors and filter in Python (Supabase JSONB containment
    # with arrays of objects is tricky via the REST API)
    result = sb.table(TABLE_VENDOR).select("*").execute()
    matches = []
    needle = service_type.strip().lower()
    for row in result.data or []:
        job_types = row.get("job_types") or []
        for jt in job_types:
            if isinstance(jt, dict) and needle in (jt.get("type", "").lower()):
                matches.append(row)
                break
    return json.dumps(matches, default=str)


@mcp.tool()
def get_vendor_availability(vendor_id: int) -> str:
    """Get a vendor's weekly availability schedule.

    Returns a JSON object mapping day names to arrays of available time slots.

    Args:
        vendor_id: The unique vendor identifier.
    """
    sb = get_supabase()
    result = (
        sb.table(TABLE_VENDOR)
        .select("vendor_id, name, weekly_availability")
        .eq("vendor_id", vendor_id)
        .maybe_single()
        .execute()
    )
    if result.data is None:
        return json.dumps({"error": f"Vendor {vendor_id} not found"})
    return json.dumps(result.data, default=str)


@mcp.tool()
def get_vendor_reviews(vendor_id: int) -> str:
    """Get a vendor's reviews, average rating, and total ratings count.

    Args:
        vendor_id: The unique vendor identifier.
    """
    sb = get_supabase()
    result = (
        sb.table(TABLE_VENDOR)
        .select("vendor_id, name, reviews, average_rating, total_ratings")
        .eq("vendor_id", vendor_id)
        .maybe_single()
        .execute()
    )
    if result.data is None:
        return json.dumps({"error": f"Vendor {vendor_id} not found"})
    return json.dumps(result.data, default=str)


@mcp.tool()
def get_top_vendors(
    service_type: str,
    limit: int = 5,
) -> str:
    """Get the top-rated vendors for a service type, sorted by average_rating.

    Args:
        service_type: The service to filter by (e.g. "plumbing").
        limit: Maximum number of vendors to return (default 5).
    """
    sb = get_supabase()
    result = sb.table(TABLE_VENDOR).select("*").execute()
    needle = service_type.strip().lower()
    matches = []
    for row in result.data or []:
        job_types = row.get("job_types") or []
        for jt in job_types:
            if isinstance(jt, dict) and needle in jt.get("type", "").lower():
                matches.append(row)
                break
    # Sort by average_rating descending (handle None)
    matches.sort(
        key=lambda v: float(v.get("average_rating") or 0),
        reverse=True,
    )
    return json.dumps(matches[:limit], default=str)


@mcp.tool()
def create_vendor(
    name: str,
    job_types: str,
    weekly_availability: str,
    max_distance_miles: int,
    home_location_lat: float,
    home_location_lng: float,
    experience_years: int,
    negotiation_aggression: int,
    pricing_strategy: str = "maximize_jobs",
) -> str:
    """Create a new vendor in the database.

    Args:
        name: Vendor display name.
        job_types: JSON string array of objects: [{"type": "plumbing", "price": 150, "duration_minutes": 60}]
        weekly_availability: JSON string object mapping days to time slots: {"Monday": ["9:00-12:00", "13:00-17:00"]}
        max_distance_miles: Maximum service distance in miles.
        home_location_lat: Home location latitude.
        home_location_lng: Home location longitude.
        experience_years: Years of experience.
        negotiation_aggression: Aggression level 1-5 (1=flexible, 5=firm).
        pricing_strategy: 1/2/3 or maximize_jobs/high_value_only/yield_optimizer.
    """
    sb = get_supabase()
    # Generate next vendor_id
    existing = (
        sb.table(TABLE_VENDOR)
        .select("vendor_id")
        .order("vendor_id", desc=True)
        .limit(1)
        .execute()
    )
    next_id = ((existing.data[0]["vendor_id"] if existing.data else 0) + 1)

    strategy_token = str(pricing_strategy or "").strip().lower().replace("-", "_").replace(" ", "_")
    if strategy_token in {"2", "high_value_only", "high_value_jobs_only", "aggressive"}:
        strategy_code = 2
        normalized_strategy = "high_value_only"
    elif strategy_token in {"3", "yield_optimizer", "yield_optimization"}:
        strategy_code = 3
        normalized_strategy = "yield_optimizer"
    else:
        strategy_code = 1
        normalized_strategy = "maximize_jobs"

    row = {
        "vendor_id": next_id,
        "name": name,
        "job_types": json.loads(job_types),
        "weekly_availability": json.loads(weekly_availability),
        "max_distance_miles": max_distance_miles,
        "home_location": {"lat": home_location_lat, "lng": home_location_lng},
        "experience_years": experience_years,
        "negotiation_aggression": negotiation_aggression,
        "pricing_strategy": normalized_strategy,
        "strategy": strategy_code,
        "job_ids": [],
        "reviews": [],
        "average_rating": None,
        "total_ratings": None,
    }
    result = sb.table(TABLE_VENDOR).insert(row).execute()
    return json.dumps(result.data, default=str)


# ═══════════════════════════════════════════════════════════════════════════
#  CONSUMER TOOLS
# ═══════════════════════════════════════════════════════════════════════════


@mcp.tool()
def get_all_consumers() -> str:
    """Get all consumers from the database, ordered by job_count descending."""
    sb = get_supabase()
    result = (
        sb.table(TABLE_CONSUMER)
        .select("*")
        .order("job_count", desc=True)
        .execute()
    )
    return json.dumps(result.data, default=str)


@mcp.tool()
def get_consumer(consumer_name: str) -> str:
    """Get a single consumer by their name.

    Args:
        consumer_name: The consumer's name (primary key).
    """
    sb = get_supabase()
    result = (
        sb.table(TABLE_CONSUMER)
        .select("*")
        .eq("consumer_name", consumer_name)
        .maybe_single()
        .execute()
    )
    if result.data is None:
        return json.dumps({"error": f"Consumer '{consumer_name}' not found"})
    return json.dumps(result.data, default=str)


@mcp.tool()
def create_consumer(consumer_name: str) -> str:
    """Create a new consumer in the database.

    Args:
        consumer_name: The consumer's name (must be unique).
    """
    sb = get_supabase()
    row = {"consumer_name": consumer_name, "job_count": 0, "job_ids": []}
    result = sb.table(TABLE_CONSUMER).insert(row).execute()
    return json.dumps(result.data, default=str)


# ═══════════════════════════════════════════════════════════════════════════
#  JOB TOOLS
# ═══════════════════════════════════════════════════════════════════════════


@mcp.tool()
def get_all_jobs() -> str:
    """Get all jobs from the database, ordered by job_id."""
    sb = get_supabase()
    result = sb.table(TABLE_JOBS).select("*").order("job_id").execute()
    return json.dumps(result.data, default=str)


@mcp.tool()
def get_job(job_id: int) -> str:
    """Get a single job by its job_id.

    Args:
        job_id: The unique job identifier.
    """
    sb = get_supabase()
    result = (
        sb.table(TABLE_JOBS)
        .select("*")
        .eq("job_id", job_id)
        .maybe_single()
        .execute()
    )
    if result.data is None:
        return json.dumps({"error": f"Job {job_id} not found"})
    return json.dumps(result.data, default=str)


@mcp.tool()
def get_jobs_for_vendor(vendor_id: int) -> str:
    """Get all jobs assigned to a specific vendor.

    Args:
        vendor_id: The vendor's unique identifier.
    """
    sb = get_supabase()
    result = (
        sb.table(TABLE_JOBS)
        .select("*")
        .eq("vendor_id", vendor_id)
        .order("job_id")
        .execute()
    )
    return json.dumps(result.data, default=str)


@mcp.tool()
def get_jobs_for_consumer(consumer_name: str) -> str:
    """Get all jobs for a specific consumer.

    Args:
        consumer_name: The consumer's name.
    """
    sb = get_supabase()
    result = (
        sb.table(TABLE_JOBS)
        .select("*")
        .eq("consumer_name", consumer_name)
        .order("job_id")
        .execute()
    )
    return json.dumps(result.data, default=str)


@mcp.tool()
def create_job(
    vendor_id: int,
    consumer_name: str,
    job_type: str,
    date: str,
    start_time: str,
    end_time: str,
    price: int,
    duration_minutes: int,
    status: int = 1,
) -> str:
    """Create a new job in the database and update both vendor and consumer records.

    Status codes: 1=Pending, 2=Confirmed, 3=InProgress, 4=Completed, 5=Booked, 6=Cancelled.

    Args:
        vendor_id: The vendor assigned to this job.
        consumer_name: The consumer who requested this job.
        job_type: Type of service (e.g. "plumbing").
        date: Job date as string (e.g. "2026-02-20").
        start_time: Start time (e.g. "09:00").
        end_time: End time (e.g. "11:00").
        price: Agreed price in dollars.
        duration_minutes: Expected duration in minutes.
        status: Job status code (default 1=Pending).
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
    result = sb.table(TABLE_JOBS).insert(row).execute()

    # Update vendor's job_ids array
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

    # Update consumer's job_ids and job_count
    consumer = (
        sb.table(TABLE_CONSUMER)
        .select("job_ids, job_count")
        .eq("consumer_name", consumer_name)
        .maybe_single()
        .execute()
    )
    if consumer.data:
        c_job_ids = consumer.data.get("job_ids") or []
        c_job_ids.append(next_id)
        sb.table(TABLE_CONSUMER).update(
            {"job_ids": c_job_ids, "job_count": len(c_job_ids)}
        ).eq("consumer_name", consumer_name).execute()

    return json.dumps(result.data, default=str)


@mcp.tool()
def update_job_status(job_id: int, status: int) -> str:
    """Update a job's status.

    Status codes: 1=Pending, 2=Confirmed, 3=InProgress, 4=Completed, 5=Booked, 6=Cancelled.

    Args:
        job_id: The job to update.
        status: New status code.
    """
    sb = get_supabase()
    result = (
        sb.table(TABLE_JOBS)
        .update({"status": status})
        .eq("job_id", job_id)
        .execute()
    )
    return json.dumps(result.data, default=str)


@mcp.tool()
def update_job_price(job_id: int, price: int) -> str:
    """Update a job's agreed price (e.g. after negotiation).

    Args:
        job_id: The job to update.
        price: New price in dollars.
    """
    sb = get_supabase()
    result = (
        sb.table(TABLE_JOBS)
        .update({"price": price})
        .eq("job_id", job_id)
        .execute()
    )
    return json.dumps(result.data, default=str)


# ═══════════════════════════════════════════════════════════════════════════
#  RESOURCES (read-only context for agents)
# ═══════════════════════════════════════════════════════════════════════════


@mcp.resource("agentplace://schema")
def get_schema() -> str:
    """Return the database schema for reference."""
    return json.dumps(
        {
            "ConsumerData": {
                "consumer_name": "text (PK)",
                "job_count": "bigint",
                "job_ids": "jsonb (array of job_id ints)",
            },
            "JobsData": {
                "job_id": "bigint (PK)",
                "vendor_id": "bigint (FK to VendorData)",
                "consumer_name": "text (FK to ConsumerData)",
                "date": "text (YYYY-MM-DD)",
                "start_time": "text (HH:MM)",
                "end_time": "text (HH:MM)",
                "price": "bigint (dollars)",
                "type": "text (service type)",
                "duration_minutes": "bigint",
                "status": "bigint (1=Pending,2=Confirmed,3=InProgress,4=Completed,5=Booked,6=Cancelled)",
            },
            "VendorData": {
                "vendor_id": "bigint (PK)",
                "name": "text",
                "weekly_availability": "jsonb ({day: [time_slots]})",
                "max_distance_miles": "bigint",
                "home_location": "jsonb ({lat, lng})",
                "experience_years": "bigint",
                "negotiation_aggression": "bigint (1-5)",
                "pricing_strategy": "text (maximize_jobs|high_value_only|yield_optimizer)",
                "job_types": "jsonb ([{type, price, duration_minutes}])",
                "job_ids": "jsonb (array of job_id ints)",
                "reviews": "jsonb (array of strings)",
                "average_rating": "text (numeric string)",
                "total_ratings": "text (numeric string)",
            },
        },
        indent=2,
    )


# ═══════════════════════════════════════════════════════════════════════════
#  ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="AgentPlace MCP Server")
    parser.add_argument(
        "--transport",
        choices=["stdio", "sse"],
        default="stdio",
        help="Transport mode (default: stdio)",
    )
    parser.add_argument(
        "--port", type=int, default=8200, help="Port for SSE transport (default: 8200)"
    )
    args = parser.parse_args()

    if args.transport == "sse":
        import os
        os.environ.setdefault("MCP_SSE_PORT", str(args.port))
        mcp.run(transport="sse")
    else:
        mcp.run()
