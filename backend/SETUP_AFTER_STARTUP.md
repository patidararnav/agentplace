# After Backend Startup

Once the backend is running (e.g. `uvicorn server:app --host 0.0.0.0 --port 8081`), do the following.

## 1. Register the payment agent in Agent Inspector (for FET payments)

1. Get the payment agent **address** and **endpoint**:
   - From backend logs: look for `[payment] address=agent1q... port=8300`
   - Or open in browser: **http://localhost:8081/api/agents/registration** and copy the `payment.address` and `payment.endpoint_uri`
2. Go to [Agent Inspector](https://agentverse.ai/inspect).
3. **Add agent**: use the payment agent’s **address** and **endpoint URI** `http://127.0.0.1:8300` (or your server URL in production).

Without this, the payment agent can still verify on-chain payments via the API; mailbox registration is needed only if you use Agentverse messaging for payments.

## 2. Ensure at least one vendor exists

- **From Supabase:** Vendors in the `VendorData` table are loaded at startup. Add rows there if needed.
- **Via API:**  
  `POST http://localhost:8081/api/vendors` with body (example):
  ```json
  {
    "name": "ProFlow Solutions",
    "services": ["plumbing", "leaky faucet", "Plumbing Repair"],
    "base_prices": {"plumbing": 150, "leaky faucet": 120},
    "aggression": 2
  }
  ```
- **Script:** Run `./backend/scripts/add_sample_vendor.sh` (backend must be on port 8081).

Then restart the backend if you added vendors only in Supabase so they are picked up at startup.

## 3. Test the payment flow

See [TEST_PAYMENT.md](TEST_PAYMENT.md) for end-to-end steps (request payment → send 0.1 FET on testnet → submit tx hash + wallet → job status 9).
