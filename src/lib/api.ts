/**
 * API client for the AgentPlace backend bridge.
 *
 * In development, Vite proxies /api and /ws to the FastAPI server.
 */

export interface AvailabilityWindow {
  start_iso: string;
  end_iso: string;
  priority: number;
  hard_constraint: boolean;
}

export interface NegotiateParams {
  /** Stable token for this specific user submit action (prevents accidental reruns on remount/back nav). */
  request_token?: string;
  service: string;
  budget: number;
  urgency: number;
  city: string;
  timezone: string;
  duration_minutes: number;
  availability_windows: AvailabilityWindow[];
  time_price_preference: 'time_first' | 'balanced' | 'price_first';
  latest_acceptable_start_iso: string;
  notes: string;
  /** Customer name for DB job linkage; sent to backend when starting negotiation */
  consumer_name?: string;
}

export interface NegotiateResponse {
  session_id: string;
}

/**
 * Start a new negotiation session.
 * Returns the session_id used to connect via WebSocket.
 */
export async function startNegotiation(
  params: NegotiateParams
): Promise<NegotiateResponse> {
  const res = await fetch('/api/negotiate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    throw new Error(`Failed to start negotiation: ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch the average price of similar past jobs based on the user's raw query.
 * The backend uses an LLM to match the query to relevant job types in the DB.
 */
export interface AvgPriceResponse {
  avg_price: number;
  job_count: number;
  matched_types: string[];
  query: string;
}

export async function fetchAvgPrice(
  query: string,
  service: string,
): Promise<AvgPriceResponse> {
  const params = new URLSearchParams({ query, service });
  const res = await fetch(`/api/avg-price?${params}`);
  if (!res.ok) {
    return { avg_price: 0, job_count: 0, matched_types: [], query };
  }
  return res.json();
}

/**
 * Open a WebSocket connection to stream negotiation events.
 */
export function connectNegotiationWS(sessionId: string): WebSocket {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  return new WebSocket(`${proto}//${host}/ws/negotiate/${sessionId}`);
}

/** Request body for creating a job (writes to JobsData and updates ConsumerData/VendorData). */
export interface CreateJobRequest {
  consumer_name: string;
  vendor_id?: number;
  job_type?: string;
  price?: number;
  duration_minutes?: number;
  date?: string | null;
  start_time?: string;
  status?: number;
}

export interface CreateJobResponse {
  ok: boolean;
  job_id?: number;
  job?: Record<string, unknown>;
  error?: string;
}

/**
 * Create a job in Supabase JobsData and attach to ConsumerData (and VendorData if vendor_id set).
 * Use when accepting a quote that has no job_id (e.g. deal-closed callback didn't run).
 */
export async function createJob(
  payload: CreateJobRequest
): Promise<CreateJobResponse> {
  const res = await fetch('/api/jobs', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      consumer_name: payload.consumer_name,
      vendor_id: payload.vendor_id ?? 0,
      job_type: payload.job_type ?? 'General',
      price: payload.price ?? 0,
      duration_minutes: payload.duration_minutes ?? 60,
      date: payload.date ?? null,
      start_time: payload.start_time ?? '09:00',
      status: payload.status ?? 5,
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: data?.error ?? `HTTP ${res.status}` };
  return data as CreateJobResponse;
}
