#!/usr/bin/env bash
# Add one sample vendor agent so negotiation can run.
# Backend must be running on port 8081 (default).

set -e
BASE="${BASE_URL:-http://localhost:8081}"

curl -sS -X POST "$BASE/api/vendors" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ProFlow Solutions",
    "services": ["plumbing", "leaky faucet", "Plumbing Repair"],
    "base_prices": {"plumbing": 150, "leaky faucet": 120, "Plumbing Repair": 150},
    "aggression": 2
  }' | cat

echo ""
