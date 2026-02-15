import { supabase } from '@/lib/supabase';
import type { VendorData, CustomerData, JobData, VendorPricingStrategy } from '@/types';

const TABLE_VENDOR = import.meta.env.VITE_SUPABASE_TABLE_VENDOR ?? 'VendorData';
const TABLE_CONSUMER = import.meta.env.VITE_SUPABASE_TABLE_CONSUMER ?? 'ConsumerData';
const TABLE_JOBS = import.meta.env.VITE_SUPABASE_TABLE_JOBS ?? 'JobsData';

const STORAGE_KEYS = {
  vendors: 'agentplace_vendors',
  consumers: 'agentplace_consumers',
  jobs: 'agentplace_jobs',
} as const;
const STORAGE_VERSION_KEY = 'agentplace_storage_version';
const STORAGE_VERSION = 'local-v1';

function getStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function normalizeVendorPricingStrategy(raw: unknown): VendorPricingStrategy {
  const token = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[-\s]+/g, '_');
  if (token === 'high_value_only') return 'high_value_only';
  if (token === 'yield_optimizer') return 'yield_optimizer';
  return 'maximize_jobs';
}

function isMissingColumnError(message: string, column: string): boolean {
  const lower = (message || '').toLowerCase();
  return lower.includes('column') && lower.includes(column.toLowerCase());
}

function isMissingRelationError(message: string, code?: string): boolean {
  return code === '42P01' || /does not exist|relation.*not found/i.test(message || '');
}

function jobsTableNames(): string[] {
  const names = [TABLE_JOBS];
  if (TABLE_JOBS === 'JobsData') names.push('jobs_data');
  return Array.from(new Set(names));
}

function computeEndTime(startTime: string, durationMinutes: number): string {
  const m = startTime.match(/^(\d{2}):(\d{2})$/);
  if (!m) return '10:00';
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (
    Number.isNaN(hours) ||
    Number.isNaN(minutes) ||
    hours < 0 ||
    hours > 23 ||
    minutes < 0 ||
    minutes > 59
  ) {
    return '10:00';
  }
  const totalMinutes = hours * 60 + minutes + Math.max(1, durationMinutes);
  const wrapped = ((totalMinutes % 1440) + 1440) % 1440;
  const hh = String(Math.floor(wrapped / 60)).padStart(2, '0');
  const mm = String(wrapped % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

function normalizeDateOrDefault(raw?: string): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function normalizeStartTimeOrDefault(raw?: string): string {
  return raw && /^\d{2}:\d{2}$/.test(raw) ? raw : '09:00';
}

async function bestEffortLinkJobToVendorAndCustomer(job: JobData): Promise<void> {
  try {
    const vendorResult = await supabase
      .from(TABLE_VENDOR)
      .select('job_ids')
      .eq('vendor_id', job.vendor_id)
      .maybeSingle();
    if (!vendorResult.error && vendorResult.data) {
      const existing = Array.isArray(vendorResult.data.job_ids)
        ? (vendorResult.data.job_ids as number[]).map(Number).filter((id) => Number.isFinite(id))
        : [];
      if (!existing.includes(job.job_id)) {
        const next = [...existing, job.job_id];
        await supabase.from(TABLE_VENDOR).update({ job_ids: next }).eq('vendor_id', job.vendor_id);
      }
    }
  } catch {
    // Best-effort only.
  }

  try {
    const consumerResult = await supabase
      .from(TABLE_CONSUMER)
      .select('job_ids, job_count')
      .eq('consumer_name', job.consumer_name)
      .maybeSingle();
    if (!consumerResult.error && consumerResult.data) {
      const existing = Array.isArray(consumerResult.data.job_ids)
        ? (consumerResult.data.job_ids as number[]).map(Number).filter((id) => Number.isFinite(id))
        : [];
      const next = existing.includes(job.job_id) ? existing : [...existing, job.job_id];
      await supabase
        .from(TABLE_CONSUMER)
        .update({ job_ids: next, job_count: next.length })
        .eq('consumer_name', job.consumer_name);
      return;
    }
    await supabase.from(TABLE_CONSUMER).insert({
      consumer_name: job.consumer_name,
      job_count: 1,
      job_ids: [job.job_id],
    });
  } catch {
    // Best-effort only.
  }
}

async function createJobDirectlyInSupabase(payload: {
  vendor_id: number;
  consumer_name: string;
  job_type: string;
  price: number;
  duration_minutes?: number;
  date?: string;
  start_time?: string;
  status?: number;
}): Promise<{ data: JobData } | { error: string }> {
  const vendorId = Number(payload.vendor_id);
  const consumerName = String(payload.consumer_name ?? '').trim();
  if (!Number.isFinite(vendorId) || vendorId <= 0) {
    return { error: 'Invalid vendor_id for accepted quote' };
  }
  if (!consumerName) {
    return { error: 'Missing consumer_name for accepted quote' };
  }

  const durationMinutes = Math.max(1, Math.round(Number(payload.duration_minutes ?? 60)));
  const startTime = normalizeStartTimeOrDefault(payload.start_time);
  const rowBase: Record<string, unknown> = {
    vendor_id: vendorId,
    consumer_name: consumerName,
    type: String(payload.job_type || 'general'),
    date: normalizeDateOrDefault(payload.date),
    start_time: startTime,
    end_time: computeEndTime(startTime, durationMinutes),
    price: Math.max(0, Math.round(Number(payload.price ?? 0))),
    duration_minutes: durationMinutes,
    status: Math.round(Number(payload.status ?? 5)),
  };

  const tableNames = jobsTableNames();
  let lastError = 'Failed to create job';
  for (const tableName of tableNames) {
    const nextIdResult = await supabase
      .from(tableName)
      .select('job_id')
      .order('job_id', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (nextIdResult.error) {
      if (isMissingRelationError(nextIdResult.error.message, nextIdResult.error.code)) continue;
      lastError = nextIdResult.error.message;
      continue;
    }
    const nextId = Number(nextIdResult.data?.job_id ?? 0) + 1;
    const { data, error } = await supabase
      .from(tableName)
      .insert({ ...rowBase, job_id: nextId })
      .select('*')
      .single();
    if (error) {
      if (isMissingRelationError(error.message, error.code)) continue;
      lastError = error.message;
      continue;
    }
    const mapped = rowToJob(data as Record<string, unknown>);
    upsertLocalJob(mapped);
    void bestEffortLinkJobToVendorAndCustomer(mapped);
    return { data: mapped };
  }
  return { error: lastError };
}

function rowToVendor(row: Record<string, unknown>): VendorData {
  const jobTypes = (row.job_types as { type: string; price: number; duration_minutes: number }[]) ?? [];
  const jobIds = Array.isArray(row.job_ids) ? (row.job_ids as number[]) : [];
  const reviews = Array.isArray(row.reviews) ? (row.reviews as string[]) : [];
  const avg = row.average_rating != null ? Number(row.average_rating) : undefined;
  const total = row.total_ratings != null ? Number(row.total_ratings) : undefined;
  const pricingStrategy = normalizeVendorPricingStrategy(row.pricing_strategy);
  return {
    vendor_id: Number(row.vendor_id),
    name: (row.name as string) ?? '',
    weekly_availability: (row.weekly_availability as Record<string, string[] | null>) ?? {},
    max_distance_miles: Number(row.max_distance_miles) ?? 0,
    home_location: (row.home_location as { lat: number; lng: number }) ?? { lat: 0, lng: 0 },
    experience_years: Number(row.experience_years) ?? 0,
    negotiation_aggression: Number(row.negotiation_aggression) ?? 0,
    pricing_strategy: pricingStrategy,
    job_types: jobTypes,
    job_ids: jobIds.length ? jobIds : undefined,
    reviews: reviews.length ? reviews : undefined,
    average_rating: avg,
    total_ratings: total,
  };
}

function rowToCustomer(row: Record<string, unknown>): CustomerData {
  const jobIds = Array.isArray(row.job_ids) ? (row.job_ids as number[]) : [];
  return {
    consumer_name: (row.consumer_name as string) ?? '',
    job_count: Number(row.job_count) ?? 0,
    job_ids: jobIds.length ? jobIds : undefined,
  };
}

function rowToJob(row: Record<string, unknown>): JobData {
  return {
    job_id: Number(row.job_id),
    vendor_id: Number(row.vendor_id),
    consumer_name: (row.consumer_name as string) ?? '',
    date: (row.date as string) ?? '',
    start_time: (row.start_time as string) ?? '',
    end_time: (row.end_time as string) ?? '',
    price: Number(row.price) ?? 0,
    type: (row.type as string) ?? '',
    duration_minutes: Number(row.duration_minutes) ?? 0,
    status: (Number(row.status) ?? 1) as JobData['status'],
  };
}

function upsertLocalJob(job: JobData): void {
  const jobs = readList<JobData>(STORAGE_KEYS.jobs);
  const idx = jobs.findIndex((j) => j.job_id === job.job_id);
  if (idx >= 0) jobs[idx] = job;
  else jobs.push(job);
  writeList(STORAGE_KEYS.jobs, jobs);
}
  
function ensureInitialized(): void {
  const storage = getStorage();
  if (!storage) return;
  if (storage.getItem(STORAGE_VERSION_KEY) === STORAGE_VERSION) return;
  storage.setItem(STORAGE_KEYS.vendors, '[]');
  storage.setItem(STORAGE_KEYS.consumers, '[]');
  storage.setItem(STORAGE_KEYS.jobs, '[]');
  storage.setItem(STORAGE_VERSION_KEY, STORAGE_VERSION);
}

function readList<T>(key: string): T[] {
  ensureInitialized();
  const storage = getStorage();
  if (!storage) return [];
  const raw = storage.getItem(key);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function writeList<T>(key: string, value: T[]): void {
  ensureInitialized();
  const storage = getStorage();
  if (!storage) return;
  storage.setItem(key, JSON.stringify(value));
}

export type FetchResult<T> = { data: T[]; error?: undefined } | { data?: undefined; error: string };

/** Fetches vendors from Supabase table public."VendorData". Falls back to localStorage only on error (e.g. table missing). */
export async function fetchVendors(): Promise<FetchResult<VendorData>> {
  const { data, error } = await supabase
    .from(TABLE_VENDOR)
    .select('*')
    .order('vendor_id', { ascending: false });
  if (!error) {
    return { data: (data ?? []).map((row) => rowToVendor(row as Record<string, unknown>)) };
  }
  console.warn('Supabase vendors:', error.message);
  const local = readList<VendorData>(STORAGE_KEYS.vendors).sort((a, b) => b.vendor_id - a.vendor_id);
  return { data: local };
}

/** Fetches customers, most jobs first then by name. */
export async function fetchCustomers(): Promise<FetchResult<CustomerData>> {
  const { data, error } = await supabase
    .from(TABLE_CONSUMER)
    .select('*')
    .order('job_count', { ascending: false })
    .order('consumer_name', { ascending: true });
  if (error) {
    const msg = `${error.message}${error.code ? ` [${error.code}]` : ''}`;
    console.warn('Supabase customers:', msg);
    return { error: msg };
  }
  return { data: (data ?? []).map((row) => rowToCustomer(row as Record<string, unknown>)) };
}

/** Fetches all jobs from browser localStorage. */
export async function fetchJobs(): Promise<FetchResult<JobData>> {
  const data = readList<JobData>(STORAGE_KEYS.jobs).sort((a, b) => a.job_id - b.job_id);
  return { data };
}

/** Fetches jobs for one vendor: tries Supabase (JobsData then jobs_data) by vendor_id or job_ids, then falls back to localStorage. */
export async function fetchJobsForVendor(
  vendorId: number,
  jobIds?: number[]
): Promise<JobData[]> {
  const tableNames = jobsTableNames();

  for (const tableName of tableNames) {
    let query = supabase.from(tableName).select('*');
    if (jobIds && jobIds.length > 0) {
      query = query.in('job_id', jobIds);
    } else {
      query = query.eq('vendor_id', vendorId);
    }
    const { data, error } = await query.order('job_id');
    if (!error) {
      return (data ?? []).map((row) => rowToJob(row as Record<string, unknown>));
    }
    const isNotFound =
      error.code === '42P01' ||
      /does not exist|relation.*not found/i.test(error.message);
    if (!isNotFound || tableName === tableNames[tableNames.length - 1]) {
      console.warn('Supabase fetchJobsForVendor:', error.message);
      break;
    }
  }

  const jobs = readList<JobData>(STORAGE_KEYS.jobs);
  const filtered = jobIds && jobIds.length > 0
    ? jobs.filter((j) => jobIds.includes(j.job_id))
    : jobs.filter((j) => j.vendor_id === vendorId);
  return filtered.sort((a, b) => a.job_id - b.job_id);
}

/** Fetches a single job by job_id from Supabase (tries TABLE_JOBS then jobs_data). Returns null if not found. */
export async function fetchJobById(jobId: number): Promise<JobData | null> {
  const tableNames = jobsTableNames();

  for (const tableName of tableNames) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .eq('job_id', jobId)
      .maybeSingle();
    if (!error && data) {
      return rowToJob(data as Record<string, unknown>);
    }
    const isNotFound =
      error?.code === '42P01' || /does not exist|relation.*not found/i.test(error?.message ?? '');
    if (!isNotFound && error) {
      console.warn('Supabase fetchJobById:', error.message);
      return null;
    }
  }
  const local = readList<JobData>(STORAGE_KEYS.jobs).find((j) => j.job_id === jobId);
  return local ?? null;
}

/** Fetches jobs for one customer: by job_ids if provided, otherwise by consumer_name. Uses JobsData then jobs_data. */
export async function fetchJobsForCustomer(
  consumerName: string,
  jobIds?: number[]
): Promise<JobData[]> {
  const tableNames = jobsTableNames();

  for (const tableName of tableNames) {
    let query = supabase.from(tableName).select('*');
    if (jobIds && jobIds.length > 0) {
      query = query.in('job_id', jobIds);
    } else {
      query = query.eq('consumer_name', consumerName);
    }
    const { data, error } = await query.order('job_id');
    if (!error) {
      return (data ?? []).map((row) => rowToJob(row as Record<string, unknown>));
    }
    const isNotFound =
      error.code === '42P01' ||
      /does not exist|relation.*not found/i.test(error.message);
    if (!isNotFound || tableName === tableNames[tableNames.length - 1]) {
      console.warn('Supabase fetchJobsForCustomer:', error.message);
      break;
    }
  }
  const jobs = readList<JobData>(STORAGE_KEYS.jobs);
  const filtered = jobIds && jobIds.length > 0
    ? jobs.filter((j) => jobIds.includes(j.job_id))
    : jobs.filter((j) => j.consumer_name === consumerName);
  return filtered.sort((a, b) => a.job_id - b.job_id);
}

/** Updates a job's status (e.g. 5 = Booked). Calls backend API (writes to Supabase with service key), then syncs localStorage. */
export async function updateJobStatus(
  jobId: number,
  status: number
): Promise<{ ok: true } | { error: string }> {
  try {
    const res = await fetch(`/api/jobs/${jobId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok) {
      // Backend updated Supabase; sync localStorage
      const jobs = readList<JobData>(STORAGE_KEYS.jobs);
      const idx = jobs.findIndex((j) => j.job_id === jobId);
      if (idx !== -1) {
        jobs[idx] = { ...jobs[idx], status: status as JobData['status'] };
        writeList(STORAGE_KEYS.jobs, jobs);
      }
      return { ok: true };
    }
  } catch (e) {
    console.warn('updateJobStatus API:', e);
  }

  // Fallback: try direct Supabase update (may fail due to RLS) then localStorage
  const tableNames = jobsTableNames();
  for (const tableName of tableNames) {
    const { error } = await supabase
      .from(tableName)
      .update({ status })
      .eq('job_id', jobId);
    if (!error) break;
    const isNotFound = error.code === '42P01' || /does not exist|relation.*not found/i.test(error.message);
    if (!isNotFound) {
      console.warn('Supabase updateJobStatus:', error.message);
      break;
    }
  }

  const jobs = readList<JobData>(STORAGE_KEYS.jobs);
  const idx = jobs.findIndex((j) => j.job_id === jobId);
  if (idx === -1) {
    return { error: `Job ${jobId} not found` };
  }
  jobs[idx] = { ...jobs[idx], status: status as JobData['status'] };
  writeList(STORAGE_KEYS.jobs, jobs);
  return { ok: true };
}

/** Creates a job row in Supabase via backend API (service key). Used when customer accepts a quote. */
export async function createJob(payload: {
  vendor_id: number;
  vendor_name?: string;
  consumer_name: string;
  job_type: string;
  price: number;
  duration_minutes?: number;
  date?: string;
  start_time?: string;
  status?: number;
}): Promise<{ data: JobData } | { error: string }> {
  let backendError = '';
  try {
    const res = await fetch('/api/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vendor_id: payload.vendor_id,
        vendor_name: payload.vendor_name ?? '',
        consumer_name: payload.consumer_name,
        job_type: payload.job_type,
        price: payload.price,
        duration_minutes: payload.duration_minutes ?? 60,
        date: payload.date ?? null,
        start_time: payload.start_time ?? '09:00',
        status: payload.status ?? 5,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      backendError = String(data?.detail ?? data?.error ?? `Server error: ${res.status}`);
    } else if (!data?.ok || !data?.job) {
      backendError = 'No job returned from backend';
    } else {
      const mapped = rowToJob(data.job as Record<string, unknown>);
      upsertLocalJob(mapped);
      return { data: mapped };
    }
  } catch (e) {
    backendError = e instanceof Error ? e.message : 'Failed to create job';
    console.warn('createJob API:', backendError);
  }

  const fallback = await createJobDirectlyInSupabase(payload);
  if ('data' in fallback) return fallback;

  if (backendError && fallback.error) {
    return { error: `${backendError}. Direct Supabase fallback failed: ${fallback.error}` };
  }
  return { error: fallback.error || backendError || 'Failed to create job' };
}

/** Insert new vendor into Supabase public."VendorData". Falls back to localStorage on error. */
export async function insertVendor(payload: {
  vendor_id?: number;
  name: string;
  weekly_availability: Record<string, string[] | null>;
  max_distance_miles: number;
  home_location: { lat: number; lng: number };
  experience_years: number;
  negotiation_aggression: number;
  pricing_strategy?: VendorPricingStrategy;
  job_types: { type: string; price: number; duration_minutes: number }[];
  job_ids?: number[] | null;
  reviews?: string[] | null;
  average_rating?: string | number | null;
  total_ratings?: string | number | null;
}): Promise<VendorData | null> {
  const strategy = normalizeVendorPricingStrategy(payload.pricing_strategy);

  try {
    const res = await fetch('/api/data/vendors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        pricing_strategy: strategy,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok && data?.vendor) {
      return rowToVendor(data.vendor as Record<string, unknown>);
    }
  } catch (e) {
    console.warn('insertVendor API:', e);
  }

  let nextId = payload.vendor_id;
  if (nextId == null) {
    const { data: existing } = await supabase
      .from(TABLE_VENDOR)
      .select('vendor_id')
      .order('vendor_id', { ascending: false })
      .limit(1)
      .maybeSingle();
    nextId = existing?.vendor_id != null ? Number(existing.vendor_id) + 1 : 1;
  }
  const row: Record<string, unknown> = {
    vendor_id: nextId,
    name: payload.name,
    weekly_availability: payload.weekly_availability,
    max_distance_miles: payload.max_distance_miles,
    home_location: payload.home_location,
    experience_years: payload.experience_years,
    negotiation_aggression: payload.negotiation_aggression,
    pricing_strategy: strategy,
    job_types: payload.job_types ?? [],
    job_ids: payload.job_ids ?? [],
    reviews: payload.reviews ?? [],
    average_rating: payload.average_rating != null ? String(payload.average_rating) : null,
    total_ratings: payload.total_ratings != null ? String(payload.total_ratings) : null,
  };

  let { data, error } = await supabase.from(TABLE_VENDOR).insert(row).select().single();
  if (error && isMissingColumnError(error.message, 'pricing_strategy')) {
    const { pricing_strategy: _omitted, ...legacyRow } = row;
    const retry = await supabase.from(TABLE_VENDOR).insert(legacyRow).select().single();
    data = retry.data;
    error = retry.error;
  }
  if (!error && data) {
    const mapped = rowToVendor(data as Record<string, unknown>);
    if (!(data as Record<string, unknown>).pricing_strategy) {
      mapped.pricing_strategy = strategy;
    }
    return mapped;
  }
  if (error) console.warn('Supabase insert vendor:', error.message);
  const vendors = readList<VendorData>(STORAGE_KEYS.vendors);
  const created: VendorData = {
    vendor_id: nextId,
    name: payload.name,
    weekly_availability: payload.weekly_availability,
    max_distance_miles: payload.max_distance_miles,
    home_location: payload.home_location,
    experience_years: payload.experience_years,
    negotiation_aggression: payload.negotiation_aggression,
    pricing_strategy: strategy,
    job_types: payload.job_types,
    job_ids: payload.job_ids ?? [],
    reviews: payload.reviews ?? [],
    average_rating: payload.average_rating != null ? Number(payload.average_rating) : undefined,
    total_ratings: payload.total_ratings != null ? Number(payload.total_ratings) : undefined,
  };
  vendors.push(created);
  writeList(STORAGE_KEYS.vendors, vendors);
  return created;
}

/** Update existing vendor by vendor_id. Returns updated VendorData or null. */
export async function updateVendor(
  vendorId: number,
  payload: {
    name: string;
    weekly_availability: Record<string, string[] | null>;
    max_distance_miles: number;
    home_location: { lat: number; lng: number };
    experience_years: number;
    negotiation_aggression: number;
    pricing_strategy?: VendorPricingStrategy;
    job_types: { type: string; price: number; duration_minutes: number }[];
    job_ids?: number[] | null;
    reviews?: string[] | null;
    average_rating?: string | number | null;
    total_ratings?: string | number | null;
  }
): Promise<VendorData | null> {
  const strategy = normalizeVendorPricingStrategy(payload.pricing_strategy);

  try {
    const res = await fetch(`/api/data/vendors/${vendorId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        pricing_strategy: strategy,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data?.ok && data?.vendor) {
      return rowToVendor(data.vendor as Record<string, unknown>);
    }
  } catch (e) {
    console.warn('updateVendor API:', e);
  }

  const row: Record<string, unknown> = {
    name: payload.name,
    weekly_availability: payload.weekly_availability,
    max_distance_miles: payload.max_distance_miles,
    home_location: payload.home_location,
    experience_years: payload.experience_years,
    negotiation_aggression: payload.negotiation_aggression,
    pricing_strategy: strategy,
    job_types: payload.job_types,
    job_ids: payload.job_ids ?? [],
    reviews: payload.reviews ?? [],
    average_rating: payload.average_rating != null ? String(payload.average_rating) : null,
    total_ratings: payload.total_ratings != null ? String(payload.total_ratings) : null,
  };
  let { data, error } = await supabase
    .from(TABLE_VENDOR)
    .update(row)
    .eq('vendor_id', vendorId)
    .select()
    .single();
  if (error && isMissingColumnError(error.message, 'pricing_strategy')) {
    const { pricing_strategy: _omitted, ...legacyRow } = row;
    const retry = await supabase
      .from(TABLE_VENDOR)
      .update(legacyRow)
      .eq('vendor_id', vendorId)
      .select()
      .single();
    data = retry.data;
    error = retry.error;
  }
  if (error) {
    console.warn('Supabase update vendor:', error.message);
    return null;
  }
  if (!data) return null;
  const mapped = rowToVendor(data as Record<string, unknown>);
  if (!(data as Record<string, unknown>).pricing_strategy) {
    mapped.pricing_strategy = strategy;
  }
  return mapped;
}

/** Insert new customer. Returns { data } on success or { error: string } on failure. */
export async function insertCustomer(payload: {
  consumer_name: string;
  job_count?: number;
  job_ids?: number[] | null;
}): Promise<{ data: CustomerData } | { error: string }> {
  try {
    const res = await fetch('/api/data/customers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        consumer_name: payload.consumer_name,
        job_count: payload.job_count ?? 0,
        job_ids: payload.job_ids ?? [],
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (res.ok && json?.ok && json?.customer) {
      return { data: rowToCustomer(json.customer as Record<string, unknown>) };
    }
  } catch (e) {
    console.warn('insertCustomer API:', e);
  }

  const row = {
    consumer_name: payload.consumer_name,
    job_count: payload.job_count ?? 0,
    job_ids: payload.job_ids ?? [],
  };
  const { data, error } = await supabase.from(TABLE_CONSUMER).insert(row).select().single();
  if (error) {
    const msg = error.message + (error.hint ? ` (${error.hint})` : '') + (error.code ? ` [${error.code}]` : '');
    console.warn('Supabase insert customer:', msg);
    return { error: msg };
  }
  return data ? { data: rowToCustomer(data as Record<string, unknown>) } : { error: 'No data returned' };
}

/** Local mode status helper. */
export async function checkSupabaseAccess(): Promise<{ ok: boolean; message: string }> {
  const { error } = await supabase.from(TABLE_CONSUMER).select('consumer_name').limit(1);
  if (error) {
    return { ok: false, message: `CustomerData: ${error.message} (code: ${error.code}). Enable RLS policies or disable RLS for the table.` };
  }
  return { ok: true, message: 'Connected' };
}
