# Supabase setup so the app can read/write

The app uses:

- **URL:** `https://acfjkjogsrqsctiymsxr.supabase.co`
- **Tables:** `ConsumerData`, `VendorData`, `JobsData` (schema `public`)

## If you see "No vendors" / "No consumers" but you have data in Supabase

The app now shows the **real error** in the picker dialogs. Open **Choose vendor** or **Choose consumer** and look for a red box: **"Could not load vendors"** or **"Could not load consumers"** with the Supabase message.

**What we need from you:**

1. **Exact table names**  
   In Supabase: **Table Editor** → left sidebar. What are the names? (e.g. `VendorData`, `vendor_data`, `Vendor Data`). The app expects **exact** names. If your tables are different, set in `.env`:
   - `VITE_SUPABASE_TABLE_VENDOR=YourExactVendorTableName`
   - `VITE_SUPABASE_TABLE_CONSUMER=YourExactConsumerTableName`
   - `VITE_SUPABASE_TABLE_JOBS=YourExactJobsTableName`  
   Then restart the dev server.

2. **RLS (Row Level Security)**  
   If the error is empty or you see no error but still 0 rows, RLS is usually blocking **SELECT**. In **SQL Editor** run:
   ```sql
   ALTER TABLE public."VendorData" DISABLE ROW LEVEL SECURITY;
   ALTER TABLE public."ConsumerData" DISABLE ROW LEVEL SECURITY;
   ALTER TABLE public."JobsData" DISABLE ROW LEVEL SECURITY;
   ```
   Use the **exact** table names (with quotes if they have capitals).

3. **Copy the error text**  
   If there is a red error in the dialog, copy the full message and share it so we can fix table name, schema, or key issues.

The link you see in the dashboard (e.g. `https://acfjkjogsrqsctiymsxr.supabase.co/ConsumerData`) is the Table Editor; the API is at `/rest/v1/ConsumerData` under that same base URL. The Supabase client in the app uses the base URL and table names correctly.

If **data isn’t updating** (inserts from the app don’t show in Supabase, or you get permission errors), it’s usually **Row Level Security (RLS)**.

## Fix: allow the anon key to read and write

1. Open **Supabase Dashboard** → your project → **Authentication** → **Policies** (or **Table Editor** → select table → “RLS”).
2. For **ConsumerData**, **VendorData**, and **JobsData**:
   - Either **turn off RLS** for that table (e.g. Table Editor → table → “RLS” → disable),  
   **or**
   - **Add policies** so the anon key can insert and select:
     - **Policy name:** e.g. `Allow anon select and insert`
     - **Allowed operation:** SELECT and INSERT (and UPDATE if the app will update rows).
     - **Target roles:** `anon`.
     - **Policy definition:** e.g. “true” for all rows (for a hackathon this is fine).

Example SQL to allow all for anon (run in **SQL Editor**):

```sql
-- Allow anon to do everything on these tables (for hackathon / dev)
ALTER TABLE public."ConsumerData" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon all on ConsumerData"
  ON public."ConsumerData" FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public."VendorData" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon all on VendorData"
  ON public."VendorData" FOR ALL TO anon USING (true) WITH CHECK (true);

ALTER TABLE public."JobsData" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anon all on JobsData"
  ON public."JobsData" FOR ALL TO anon USING (true) WITH CHECK (true);
```

If you prefer **no RLS** (simplest for a short-lived hackathon):

```sql
ALTER TABLE public."ConsumerData" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."VendorData" DISABLE ROW LEVEL SECURITY;
ALTER TABLE public."JobsData" DISABLE ROW LEVEL SECURITY;
```

## Key

The app uses the **publishable (anon) key** you provided. If you rotate or change it, set:

- `VITE_SUPABASE_URL=https://acfjkjogsrqsctiymsxr.supabase.co`
- `VITE_SUPABASE_ANON_KEY=your_anon_or_publishable_key`

Then restart the dev server.

## Check from the app

Open the browser console on the app. If an insert fails, you’ll see a message like  
`Supabase insert consumer: <message> (code: …)`.  
That message and code will confirm whether it’s RLS (e.g. “new row violates row-level security”) or something else.
