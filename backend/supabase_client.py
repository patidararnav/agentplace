"""
Shared Supabase client for the AgentPlace backend.

Usage:
    from supabase_client import get_supabase

    sb = get_supabase()
    result = sb.table("VendorData").select("*").execute()
"""

import os
from typing import Optional

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

_client: Optional[Client] = None

SUPABASE_URL = os.getenv(
    "SUPABASE_URL", "https://acfjkjogsrqsctiymsxr.supabase.co"
)
SUPABASE_KEY = os.getenv(
    "SUPABASE_SERVICE_KEY",
    os.getenv("SUPABASE_ANON_KEY", ""),
)

# Table names (match the frontend)
TABLE_VENDOR = os.getenv("SUPABASE_TABLE_VENDOR", "VendorData")
TABLE_CONSUMER = os.getenv("SUPABASE_TABLE_CONSUMER", "ConsumerData")
TABLE_JOBS = os.getenv("SUPABASE_TABLE_JOBS", "JobsData")


def get_supabase() -> Client:
    """Return a singleton Supabase client."""
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY (or SUPABASE_ANON_KEY) "
                "must be set in .env"
            )
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client
