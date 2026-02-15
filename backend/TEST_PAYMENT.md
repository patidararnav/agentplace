# Testing the Payment Agent (FET Flow)

End-to-end test for the fulfillment payment step: request payment details → pay 0.1 FET on-chain → submit tx + wallet → job status 9.

## Prerequisites

1. **Backend running** on port 8081:
   ```bash
   cd backend && source venv/bin/activate
   uvicorn server:app --host 0.0.0.0 --port 8081
   ```
2. **Frontend running** (Vite proxies `/api` to 8081):
   ```bash
   npm run dev
   ```
3. **A job at the payment step**: you need a job with status **7** (Project completed) so the fulfillment page shows the payment UI. Either:
   - Use an existing booked job, go to its fulfillment page, and click **Confirm completion** so it moves to status 7 and the payment step appears, or
   - Create a job in the app and progress it to “Project completed”, or
   - For a quick API-only test, use any real `job_id` from your DB (see “API-only test” below).

## 1. Check payment agent is ready

**Browser:** Open a job’s fulfillment page, confirm completion so you’re on the payment step. You should see:
- **“Payment agent ready (stable-testnet)”** in green.

**Or curl:**
```bash
curl http://localhost:8081/api/payment-agent/status
```
Expect: `{"ready":true,"recipient_address":"agent1q...","fet_network":"stable-testnet"}`.

## 2. Get payment details

**In the app:** On the payment step, click **“Get payment details”**. You should see:
- Amount: **0.1 FET**
- Recipient address (payment agent wallet)
- Network: **stable-testnet** (if `FET_USE_TESTNET=true`)

**Or curl** (replace `JOB_ID` with a real job id from your JobsData table):
```bash
curl -X POST http://localhost:8081/api/jobs/JOB_ID/request-payment
```

## 3. Send 0.1 FET on testnet

1. Get testnet FET: [Fetch.ai Testnet Faucet](https://companion.sandbox-london-b.fetch-ai.com/dorado-1/agents#Agents)
2. Send **exactly 0.1 FET** from your wallet to the **recipient_address** from step 2, on **stable-testnet** (e.g. via Fetch wallet or Keplr).
3. Copy the **transaction hash** (tx hash) and your **Fetch wallet address** (sender).

## 4. Submit payment in the app

1. Paste the **transaction hash** into the first field.
2. Paste your **Fetch wallet address** (buyer) into the second field.
3. Click **“Submit payment”**.

**Success:** The step shows “Payment verified and released to [vendor]” and the job status becomes 9 (Payment received).

**If it fails:** The UI shows the error from the backend, e.g.:
- **“Fetch.ai ledger unreachable”** — network/DNS can’t reach the Fetch RPC; try another network or check firewall.
- **“Transaction invalid or not found”** — wrong tx hash, wrong amount, wrong sender/recipient, or wrong network (testnet vs mainnet).

## API-only test (no UI)

Replace `JOB_ID` with a real job id. Use the same recipient and network as returned by `request-payment`.

```bash
# 1. Status
curl http://localhost:8081/api/payment-agent/status

# 2. Request payment (get recipient + amount)
curl -X POST http://localhost:8081/api/jobs/JOB_ID/request-payment

# 3. After sending 0.1 FET on-chain, commit (use your real tx hash and sender address)
curl -X POST http://localhost:8081/api/jobs/JOB_ID/commit-payment \
  -H "Content-Type: application/json" \
  -d '{"transaction_id":"YOUR_TX_HASH","buyer_fet_wallet":"YOUR_FET_ADDRESS"}'
```

Success: `{"success":true,"status":9}`.  
Failure: `{"success":false,"error":"..."}` with a specific message.

## Quick sanity check (no real FET)

1. Backend + frontend running.
2. Open fulfillment for any job → confirm completion.
3. You should see “Payment agent ready” and “Get payment details”.
4. Click “Get payment details” → recipient and “0.1 FET” and “stable-testnet” appear.
5. Submitting with a **fake** tx hash and address will return “Transaction invalid or not found” (confirms the API and verification path run; only on-chain verification fails).
