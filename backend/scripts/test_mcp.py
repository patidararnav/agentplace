#!/usr/bin/env python3
"""
Quick test that the MCP server's Supabase-backed tools work.
Run from backend/ with venv activated:
    python scripts/test_mcp.py

Does not test the MCP transport (stdio/SSE); it calls the tool logic directly.
"""
import os
import sys

# Run from backend/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

def main():
    from dotenv import load_dotenv
    load_dotenv(os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))

    print("1. Testing Supabase connection (same as MCP server uses)...")
    from supabase_client import get_supabase, TABLE_VENDOR, TABLE_JOBS, TABLE_CONSUMER
    sb = get_supabase()
    r = sb.table(TABLE_VENDOR).select("*", count="exact").limit(1).execute()
    print(f"   OK — VendorData: count={r.count if hasattr(r, 'count') else 'N/A'}, sample rows: {len(r.data)}")

    print("2. Calling MCP tool 'get_all_vendors' (same code as mcp_server)...")
    from mcp_server import get_all_vendors
    out = get_all_vendors()
    data = __import__("json").loads(out)
    print(f"   OK — get_all_vendors() returned {len(data) if isinstance(data, list) else 'object'} items")

    print("3. Calling MCP tool 'search_vendors_by_service' for 'plumbing'...")
    from mcp_server import search_vendors_by_service
    out2 = search_vendors_by_service("plumbing")
    data2 = __import__("json").loads(out2)
    count = len(data2) if isinstance(data2, list) else 0
    print(f"   OK — search_vendors_by_service('plumbing') returned {count} vendors")

    print("\nMCP server logic and Supabase are working. To test the actual MCP transport:")
    print("  • Stdio:  python mcp_server.py   (then use an MCP client to list/call tools)")
    print("  • SSE:    python mcp_server.py --transport sse --port 8200")
    print("            Then connect an MCP client to http://localhost:8200/sse (or the path FastMCP advertises)")
    return 0

if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print(f"FAIL: {e}", file=sys.stderr)
        sys.exit(1)
